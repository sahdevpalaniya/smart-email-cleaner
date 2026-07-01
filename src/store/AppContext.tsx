import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Email, Folder, GoogleProfile, LoadProgress } from '../types'
import {
  fetchProfile,
  getCachedToken,
  isConfigured,
  isTokenValid,
  loadRememberedProfile,
  rememberProfile,
  requestToken,
  signOut as gisSignOut,
} from '../lib/auth'
import {
  countQuery,
  fetchEmailWindow,
  fetchMessageBody,
  getMailboxHistoryId,
  GmailError,
  listIdsByQuery,
  markRead,
  syncHistory,
  trashEmails,
  untrashEmails,
  WINDOW_SIZE,
  type MessageBody,
} from '../lib/gmail'
import {
  CATCH_ALL_ID,
  indexByFolder,
  loadFolders,
  newFolderId,
  saveFolders,
  suggestSenderFolders,
  type FolderSuggestion,
} from '../lib/folders'
import { clearInboxCache, loadInboxCache, saveInboxCache, type LoadCursor } from '../lib/cache'
import { persist, restore } from '../lib/storage'
import { trackUser } from '../lib/track'
import { unsubscribe as performUnsubscribe, type UnsubResult } from '../lib/unsubscribe'

/** Cookie/localStorage flag — set once we've auto-created starter folders. */
const AUTO_FOLDERS_FLAG = 'sec-autofolders-v2'
/**
 * A sender becomes an auto-created folder only when it has MORE than this many
 * emails — i.e. it's actually flooding the inbox. Senders in the 0–15 range stay
 * as lightweight one-click suggestions instead of cluttering the sidebar.
 */
const AUTO_FOLDER_MIN_COUNT = 15
/** Safety cap so a huge mailbox can't spawn an unreasonable number of folders. */
const AUTO_FOLDER_MAX = 30

/**
 * Pause between background load windows. Spacing the windows out keeps the app
 * responsive, smooths the request rate so we never burst the Gmail quota, and
 * gives a huge mailbox room to breathe instead of loading all at once.
 */
const COOLDOWN_MS = 4000
/** Hard ceiling on emails held in memory, so a giant mailbox can't exhaust it. */
const MAX_LOADED = 12000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Shape of the data needed to create a new folder. */
export interface NewFolderInput {
  label: string
  icon: string
  accent: string
  description?: string
  templateId?: Folder['templateId']
  rule?: Folder['rule']
}

interface AppState {
  configured: boolean
  /** True while we attempt to restore a remembered session on first load. */
  restoring: boolean
  profile: GoogleProfile | null
  emails: Email[]
  /** Inbox size as reported by Gmail (may exceed emails.length when capped). */
  estimate: number
  loading: boolean
  progress: LoadProgress | null
  error: string | null
  /** True while more emails are still streaming in after the first window. */
  backgroundLoading: boolean

  // Folders
  folders: Folder[]
  folderCounts: Record<string, number>
  /** emailId -> folderId, the single home of each email. */
  folderIndex: Record<string, string>
  /** Auto-discovered sender folders from the user's own inbox (not yet added). */
  suggestions: FolderSuggestion[]
  createFolder: (input: NewFolderInput) => Folder
  /** Add an already-built folder (e.g. an accepted suggestion). */
  addFolder: (folder: Folder) => void
  deleteFolder: (id: string) => void
  emailsInFolder: (folderId: string) => Email[]

  signIn: () => Promise<void>
  signOut: () => void
  refresh: () => Promise<void>
  /** Move the given message ids to Trash and drop them from local state. */
  deleteEmails: (ids: string[]) => Promise<void>
  /** Pending undo for the most recent delete, or null. Drives the Undo toast. */
  undo: { count: number } | null
  /** Restore the most recently trashed emails (local state + Gmail untrash). */
  undoDelete: () => Promise<void>
  /** Fetch a single message's full body (HTML / plain text) for the reader. */
  fetchEmailBody: (id: string) => Promise<MessageBody>
  /** Remove the UNREAD label from a message, locally and in Gmail. */
  markEmailRead: (id: string) => Promise<void>
  /** Act on an email's List-Unsubscribe (one-click POST / open page / mailto). */
  unsubscribeEmail: (email: Email) => Promise<UnsubResult>
  /** Estimate how many messages match a Gmail search query (whole mailbox). */
  previewCleanup: (q: string) => Promise<number>
  /** Trash every message matching a query; returns how many were trashed. */
  runCleanup: (q: string) => Promise<number>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<GoogleProfile | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [estimate, setEstimate] = useState(0)
  const [loading, setLoading] = useState(false)
  const [backgroundLoading, setBackgroundLoading] = useState(false)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [folders, setFolders] = useState<Folder[]>(() => loadFolders())
  // Drives the global Undo toast; the trashed emails themselves live in
  // pendingUndoRef so they can be restored exactly (labels and all).
  const [undo, setUndo] = useState<{ count: number } | null>(null)
  const pendingUndoRef = useRef<Email[]>([])
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against overlapping first-load runs (double sign-in, StrictMode).
  const loadingRef = useRef(false)
  // Lets the first-run auto-folder effect call addFolder without a dep cycle.
  const addFolderRef = useRef<(folder: Folder) => void>(() => {})
  // Mirrors `emails`/`estimate` so the loaders can read the latest without deps.
  const emailsRef = useRef<Email[]>([])
  const estimateRef = useRef(0)
  // Windowed-loading state: where to resume, the History-API sync anchor, whether
  // a background loop is running, and a cancel flag (set on sign-out / reload).
  const cursorRef = useRef<LoadCursor>({ done: true })
  const historyIdRef = useRef<string | null>(null)
  const windowLoopRef = useRef(false)
  const cancelledRef = useRef(false)
  useEffect(() => {
    emailsRef.current = emails
  }, [emails])
  useEffect(() => {
    estimateRef.current = estimate
  }, [estimate])

  // Persist folders whenever they change.
  useEffect(() => {
    saveFolders(folders)
  }, [folders])

  // Resolve every email into exactly one folder + per-folder counts.
  const { map: folderIndex, counts: folderCounts } = useMemo(
    () => indexByFolder(emails, folders),
    [emails, folders],
  )

  // Sender folders auto-discovered from the user's own inbox.
  const suggestions = useMemo(() => suggestSenderFolders(emails, folders), [emails, folders])

  // First-run magic: auto-create a folder for every sender that floods the inbox
  // (more than AUTO_FOLDER_MIN_COUNT emails). Runs once; folders stay deletable.
  // Waits until loading is fully done — first window AND background windows — so
  // the tally reflects the WHOLE loaded inbox, not just the first batch.
  useEffect(() => {
    if (loading || backgroundLoading || emails.length === 0) return
    if (restore(AUTO_FOLDERS_FLAG)) return
    const heavy = suggestSenderFolders(emails, folders, 200)
      .filter((s) => s.count > AUTO_FOLDER_MIN_COUNT)
      .slice(0, AUTO_FOLDER_MAX)
    heavy.forEach((s) => addFolderRef.current(s.folder))
    persist(AUTO_FOLDERS_FLAG, '1')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, loading, backgroundLoading])

  // Persist the loaded inbox to IndexedDB (debounced) so a returning session can
  // paint instantly from cache and then catch up with a cheap delta sync, instead
  // of re-fetching the whole mailbox. Covers deletes/cleanups too, since those
  // change `emails`. Tokens/bodies are never cached — only the metadata we show.
  useEffect(() => {
    if (!profile || loading || emails.length === 0) return
    const t = setTimeout(() => {
      void saveInboxCache({
        email: profile.email,
        emails,
        estimate,
        historyId: historyIdRef.current,
        cursor: cursorRef.current,
        savedAt: Date.now(),
      })
    }, 1500)
    return () => clearTimeout(t)
  }, [emails, estimate, profile, loading])

  /**
   * Return a valid access token, renewing it if the cached one has expired.
   *
   * Silent renewal (`prompt: 'none'`) is tried first so background work never
   * pops UI. For user-initiated actions, pass `interactive` so that — when silent
   * renewal can't happen (token expired while idle, third-party-cookie limits, or
   * a cached token minted under an older scope) — we fall back to an interactive
   * prompt instead of throwing.
   */
  const getValidToken = useCallback(async (interactive = false): Promise<string> => {
    const cached = getCachedToken()
    if (cached) return cached
    try {
      return await requestToken('none') // silent renewal — no UI
    } catch (e) {
      if (interactive) return requestToken('') // let GIS show the minimal prompt
      throw e
    }
  }, [])

  // Forget any pending undo (timer + stashed emails + toast).
  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    pendingUndoRef.current = []
    setUndo(null)
  }, [])

  // ---- Windowed loading engine -------------------------------------------------

  // Merge a freshly hydrated batch into state (dedupe; no sort — the caller sorts
  // once per window). Keeps `emails` the single source of truth.
  const appendFresh = useCallback((batch: Email[]) => {
    setEmails((cur) => {
      const have = new Set(cur.map((e) => e.id))
      const add = batch.filter((e) => !have.has(e.id))
      return add.length ? cur.concat(add) : cur
    })
  }, [])

  // Once the inbox is fully paged, the exact loaded-inbox count is the truth —
  // set it so the "loaded of ~N" cap banner resolves to the real number.
  const finalizeEstimate = useCallback(() => {
    const inboxLoaded = emailsRef.current.reduce(
      (n, e) => n + (e.labelIds.includes('INBOX') ? 1 : 0),
      0,
    )
    setEstimate(inboxLoaded)
  }, [])

  // Load ONE more window (windows after the first), resuming from the cursor.
  const loadOneWindow = useCallback(
    async (token: string) => {
      const base = emailsRef.current.length
      const known = new Set(emailsRef.current.map((e) => e.id))
      const res = await fetchEmailWindow(token, {
        pageToken: cursorRef.current.token,
        windowSize: WINDOW_SIZE,
        knownIds: known,
        onProgress: (p) =>
          setProgress({
            loaded: base + p.loaded,
            total: Math.max(estimateRef.current, base + p.total),
          }),
        onBatch: appendFresh,
      })
      cursorRef.current = { token: res.nextPageToken, done: !res.nextPageToken }
      setEstimate((prev) => Math.max(prev, res.estimate))
      // Sort the merged list once per window (cheaper than sorting every batch).
      setEmails((cur) => [...cur].sort((a, b) => b.date - a.date))
    },
    [appendFresh],
  )

  // Background loop: after the first window, keep pulling the rest of the inbox
  // one window at a time, with a cooling pause between each. Pauses while the tab
  // is hidden and stops on the cancel flag / the in-memory ceiling.
  const runBackgroundWindows = useCallback(async () => {
    if (windowLoopRef.current) return // a loop is already running
    windowLoopRef.current = true
    setBackgroundLoading(true)
    try {
      while (!cursorRef.current.done && emailsRef.current.length < MAX_LOADED) {
        if (cancelledRef.current) break
        // Don't fetch for a backgrounded tab — wait until it's visible again.
        while (typeof document !== 'undefined' && document.hidden && !cancelledRef.current) {
          await sleep(2000)
        }
        if (cancelledRef.current) break
        await sleep(COOLDOWN_MS) // cooling period between windows
        if (cancelledRef.current) break
        const token = await getValidToken(false)
        await loadOneWindow(token)
      }
    } catch {
      // Token lapsed or a page cursor expired mid-stream — stop quietly. Whatever
      // loaded stays on screen; the user can Reload to resume.
    } finally {
      windowLoopRef.current = false
      setBackgroundLoading(false)
      if (cursorRef.current.done) finalizeEstimate()
    }
  }, [getValidToken, loadOneWindow, finalizeEstimate])

  // Full load from scratch: capture the sync anchor, fetch the first window for a
  // fast first paint, then kick off the paced background loop for the rest.
  const fullLoad = useCallback(
    async (token: string) => {
      cancelledRef.current = false
      setLoading(true)
      setError(null)
      setProgress({ loaded: 0, total: 0 })
      setEmails([])
      emailsRef.current = []
      cursorRef.current = { done: false }
      try {
        // Anchor BEFORE loading so any change after this moment is replayable.
        historyIdRef.current = await getMailboxHistoryId(token).catch(() => null)
        const res = await fetchEmailWindow(token, {
          windowSize: WINDOW_SIZE,
          // Pull in mail that lives outside the inbox but still needs its own
          // section: starred mail archived long ago, and every draft.
          includeQueries: ['is:starred', 'in:drafts'],
          onProgress: setProgress,
          onBatch: appendFresh,
        })
        cursorRef.current = { token: res.nextPageToken, done: !res.nextPageToken }
        setEstimate(res.estimate)
        estimateRef.current = res.estimate
        setEmails((cur) => [...cur].sort((a, b) => b.date - a.date))
      } catch (e) {
        const msg =
          e instanceof GmailError && e.status === 401
            ? 'Your session expired. Please sign in again.'
            : e instanceof Error
              ? e.message
              : 'Failed to load emails.'
        setError(msg)
      } finally {
        setLoading(false)
        setProgress(null)
      }
      if (!cursorRef.current.done && !cancelledRef.current) void runBackgroundWindows()
      else finalizeEstimate()
    },
    [appendFresh, runBackgroundWindows, finalizeEstimate],
  )

  // Incremental refresh: replay only what changed since the last sync anchor via
  // Gmail's History API — adding new inbox mail and dropping anything that left —
  // instead of re-listing the whole mailbox. Falls back to a full load if there's
  // no anchor or the anchor is too old for Gmail to replay.
  const syncInbox = useCallback(
    async (token: string) => {
      if (!historyIdRef.current) return fullLoad(token)
      let sync
      try {
        sync = await syncHistory(token, historyIdRef.current)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to refresh.')
        return
      }
      if (sync.expired) return fullLoad(token)
      historyIdRef.current = sync.newHistoryId
      if (sync.removedIds.length || sync.added.length) {
        const removed = new Set(sync.removedIds)
        setEmails((cur) => {
          const have = new Set(cur.map((e) => e.id))
          const kept = cur.filter((e) => !removed.has(e.id))
          const add = sync.added.filter((e) => !have.has(e.id))
          return [...kept, ...add].sort((a, b) => b.date - a.date)
        })
        const addedInbox = sync.added.reduce(
          (n, e) => n + (e.labelIds.includes('INBOX') ? 1 : 0),
          0,
        )
        setEstimate((prev) => Math.max(0, prev + addedInbox - sync.removedIds.length))
      }
    },
    [fullLoad],
  )

  // Entry point for sign-in / session restore: paint instantly from cache when we
  // have one (then delta-sync, and resume windows if a prior session didn't
  // finish), otherwise do a full windowed load.
  const loadInbox = useCallback(
    async (token: string, email: string) => {
      if (loadingRef.current) return // a load is already in flight
      loadingRef.current = true
      cancelledRef.current = false
      try {
        const cached = await loadInboxCache(email)
        if (cached && cached.emails.length > 0) {
          const sorted = [...cached.emails].sort((a, b) => b.date - a.date)
          setEmails(sorted)
          emailsRef.current = sorted
          setEstimate(cached.estimate)
          estimateRef.current = cached.estimate
          historyIdRef.current = cached.historyId
          cursorRef.current = cached.cursor ?? { done: true }
          setLoading(false)
          await syncInbox(token) // catch up on changes since the cache was written
          if (!cursorRef.current.done && !cancelledRef.current) void runBackgroundWindows()
        } else {
          await fullLoad(token)
        }
      } finally {
        loadingRef.current = false
      }
    },
    [syncInbox, runBackgroundWindows, fullLoad],
  )

  // ---- Auth + session ----------------------------------------------------------

  const signIn = useCallback(async () => {
    setError(null)
    try {
      // '' (not 'consent') lets Google skip the permission screen for a returning
      // user who already granted Gmail access. A first-time or previously-declined
      // user still sees consent, since the required scope isn't granted yet.
      const accessToken = await requestToken('')
      const prof = await fetchProfile(accessToken)
      setProfile(prof)
      rememberProfile(prof) // persist the session for "remember me"
      trackUser(prof.email) // best-effort, silent — never blocks sign-in
      await loadInbox(accessToken, prof.email)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    }
  }, [loadInbox])

  /**
   * Run a Gmail write with a valid token, recovering once from an auth failure.
   * A 401 (expired token) or 403 (token lacks the current scope — e.g. minted
   * before the scope change) forces a fresh consented token and retries, so the
   * action actually persists on the server instead of being rolled back locally.
   */
  const runAuthed = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const token = await getValidToken(true)
      try {
        return await fn(token)
      } catch (e) {
        if (e instanceof GmailError && (e.status === 401 || e.status === 403)) {
          const fresh = await requestToken('consent')
          return fn(fresh)
        }
        throw e
      }
    },
    [getValidToken],
  )

  // Restore a remembered session on first load. The token is only ever taken
  // from sessionStorage (instant) or minted silently — never from durable disk.
  useEffect(() => {
    if (!isConfigured()) {
      setRestoring(false)
      return
    }
    const remembered = loadRememberedProfile()
    if (!remembered && !isTokenValid()) {
      setRestoring(false)
      return
    }
    ;(async () => {
      try {
        const accessToken = isTokenValid() ? getCachedToken()! : await requestToken('none')
        const prof = remembered ?? (await fetchProfile(accessToken))
        setProfile(prof)
        rememberProfile(prof)
        trackUser(prof.email) // server-side SADD dedupes the per-reload call
        await loadInbox(accessToken, prof.email)
      } catch {
        // Silent renewal failed (session lapsed / consent revoked) — show login.
        gisSignOut()
        setProfile(null)
      } finally {
        setRestoring(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = useCallback(() => {
    cancelledRef.current = true // stop any background load loop
    const email = profile?.email
    gisSignOut()
    setProfile(null)
    setEmails([])
    setEstimate(0)
    setError(null)
    setBackgroundLoading(false)
    historyIdRef.current = null
    cursorRef.current = { done: true }
    if (email) void clearInboxCache(email) // don't leave inbox metadata on a shared machine
    clearUndo()
  }, [clearUndo, profile])

  const refresh = useCallback(async () => {
    if (!profile) return
    if (loadingRef.current || windowLoopRef.current) return // already busy loading
    try {
      // Interactive: the user clicked Reload, so we may prompt if silent renewal
      // isn't possible rather than failing the refresh on a stale token.
      const accessToken = await getValidToken(true)
      await syncInbox(accessToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh.')
    }
  }, [profile, getValidToken, syncInbox])

  const deleteEmails = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      const previous = emails
      const prevEstimate = estimate
      // The full Email objects being trashed — kept so undo can restore them
      // (and their labels) exactly, without a refetch.
      const trashed = previous.filter((e) => idSet.has(e.id))
      // Optimistic update — remove immediately, restore on failure.
      setEmails((cur) => cur.filter((e) => !idSet.has(e.id)))
      setEstimate((n) => Math.max(0, n - ids.length))
      try {
        await runAuthed((token) => trashEmails(token, ids))
      } catch (e) {
        // Server write failed — undo the optimistic removal so local state and
        // Gmail stay in sync (otherwise the emails "come back" on the next reload).
        setEmails(previous)
        setEstimate(prevEstimate)
        setError(e instanceof Error ? e.message : 'Failed to move emails to Trash.')
        throw e
      }
      // Success — offer a short-lived Undo. Replaces any earlier pending undo
      // (only the most recent delete is recoverable in-app; older ones still
      // sit in Gmail's Trash for ~30 days).
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      pendingUndoRef.current = trashed
      setUndo({ count: trashed.length })
      undoTimerRef.current = setTimeout(() => clearUndo(), 8000)
    },
    [emails, estimate, runAuthed, clearUndo],
  )

  // Restore the most recently trashed emails: re-insert them locally (newest
  // first, matching the load sort) and untrash them in Gmail, re-adding INBOX
  // only to those that had it. Best-effort — on server failure we keep the local
  // restore and surface the error rather than re-hiding the emails.
  const undoDelete = useCallback(async () => {
    const restored = pendingUndoRef.current
    if (restored.length === 0) return
    clearUndo()
    const ids = restored.map((e) => e.id)
    const inboxIds = restored.filter((e) => e.labelIds.includes('INBOX')).map((e) => e.id)
    setEmails((cur) => {
      const have = new Set(cur.map((e) => e.id))
      const merged = [...cur, ...restored.filter((e) => !have.has(e.id))]
      return merged.sort((a, b) => b.date - a.date)
    })
    setEstimate((n) => n + inboxIds.length)
    try {
      await runAuthed((token) => untrashEmails(token, ids, inboxIds))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore emails from Trash.')
    }
  }, [runAuthed, clearUndo])

  // Fetch a single message's body on demand (no local-state change; the reader
  // component holds the result). runAuthed handles silent/interactive renewal.
  const fetchEmailBody = useCallback(
    (id: string) => runAuthed((token) => fetchMessageBody(token, id)),
    [runAuthed],
  )

  // Mark a message read: optimistically clear the unread flag locally, then sync
  // to Gmail. On failure, roll the local state back so the inbox stays accurate.
  const markEmailRead = useCallback(
    async (id: string) => {
      const previous = emails
      setEmails((cur) =>
        cur.map((e) =>
          e.id === id && e.unread
            ? { ...e, unread: false, labelIds: e.labelIds.filter((l) => l !== 'UNREAD') }
            : e,
        ),
      )
      try {
        await runAuthed((token) => markRead(token, id))
      } catch (e) {
        setEmails(previous)
        setError(e instanceof Error ? e.message : 'Failed to mark email as read.')
        throw e
      }
    },
    [emails, runAuthed],
  )

  // Insert a folder, keeping the catch-all pinned to the end and de-duping by id.
  const addFolder = useCallback((folder: Folder) => {
    setFolders((cur) => {
      if (cur.some((f) => f.id === folder.id)) return cur
      const catchAllIdx = cur.findIndex((f) => f.id === CATCH_ALL_ID)
      if (catchAllIdx === -1) return [...cur, folder]
      const next = [...cur]
      next.splice(catchAllIdx, 0, folder)
      return next
    })
  }, [])
  addFolderRef.current = addFolder

  const createFolder = useCallback(
    (input: NewFolderInput): Folder => {
      const folder: Folder = {
        id: input.templateId ?? newFolderId(),
        label: input.label,
        icon: input.icon,
        accent: input.accent,
        description: input.description ?? (input.rule ? 'Custom folder' : ''),
        builtin: Boolean(input.templateId),
        templateId: input.templateId,
        rule: input.rule,
      }
      addFolder(folder)
      return folder
    },
    [addFolder],
  )

  const deleteFolder = useCallback((id: string) => {
    if (id === CATCH_ALL_ID) return // catch-all is permanent
    setFolders((cur) => cur.filter((f) => f.id !== id))
  }, [])

  const emailsInFolder = useCallback(
    (folderId: string) => emails.filter((e) => folderIndex[e.id] === folderId),
    [emails, folderIndex],
  )

  const unsubscribeEmail = useCallback((email: Email) => performUnsubscribe(email), [])

  const previewCleanup = useCallback(
    async (q: string) => runAuthed((token) => countQuery(token, q)),
    [runAuthed],
  )

  const runCleanup = useCallback(
    async (q: string): Promise<number> => {
      const ids = await runAuthed((token) => listIdsByQuery(token, q))
      if (ids.length === 0) return 0
      await runAuthed((token) => trashEmails(token, ids))
      // Drop any trashed messages that were part of the loaded inbox. No refetch —
      // local state already reflects the change, which keeps server load down.
      const idSet = new Set(ids)
      setEmails((cur) => cur.filter((e) => !idSet.has(e.id)))
      setEstimate((n) => Math.max(0, n - ids.length))
      return ids.length
    },
    [runAuthed],
  )

  const value: AppState = {
    configured: isConfigured(),
    restoring,
    profile,
    emails,
    estimate,
    loading,
    progress,
    error,
    backgroundLoading,
    folders,
    folderCounts,
    folderIndex,
    suggestions,
    createFolder,
    addFolder,
    deleteFolder,
    emailsInFolder,
    signIn,
    signOut,
    refresh,
    deleteEmails,
    undo,
    undoDelete,
    fetchEmailBody,
    markEmailRead,
    unsubscribeEmail,
    previewCleanup,
    runCleanup,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within <AppProvider>')
  return ctx
}
