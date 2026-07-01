/**
 * Per-account inbox cache, backed by IndexedDB.
 *
 * Why IndexedDB and not localStorage: a large mailbox can hold many thousands of
 * email-metadata objects (several MB) — well past localStorage's ~5MB synchronous
 * budget. IndexedDB is async and roomy, so reopening the app can paint instantly
 * from cache while a cheap History-API delta sync catches up, instead of
 * re-fetching the whole inbox from Gmail every time.
 *
 * Only message *metadata* we already show in the UI is cached (sender, subject,
 * snippet, labels, date) — never tokens or full message bodies. The cache is
 * keyed by account email and cleared on sign-out.
 */
import type { Email } from '../types'

const DB_NAME = 'sec-cache'
const STORE = 'inbox'
const VERSION = 1

/** The resume cursor for windowed loading: where the next page picks up. */
export interface LoadCursor {
  /** Gmail `nextPageToken` for the next window; undefined once fully paged. */
  token?: string
  /** True when the whole inbox has been paged (nothing left to load). */
  done: boolean
}

/** Everything we persist so a returning session can resume without a full refetch. */
export interface InboxCache {
  /** Account key (the signed-in Gmail address). */
  email: string
  emails: Email[]
  /** Gmail's reported inbox size at cache time. */
  estimate: number
  /** Sync anchor for the History API; null if we never captured one. */
  historyId: string | null
  /** Where windowed loading should resume. */
  cursor: LoadCursor
  /** Epoch ms the cache was written (for future staleness policies). */
  savedAt: number
}

/** IndexedDB isn't available in every context (private mode, SSR) — guard it. */
function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'email' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Read the cached inbox for an account, or null if there's nothing usable. */
export async function loadInboxCache(email: string): Promise<InboxCache | null> {
  if (!hasIDB()) return null
  try {
    const db = await openDB()
    const entry = await new Promise<InboxCache | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(email)
      req.onsuccess = () => resolve((req.result as InboxCache | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    // Defend against a corrupt/partial record so a bad cache can never crash boot.
    if (entry && Array.isArray(entry.emails)) return entry
    return null
  } catch {
    return null
  }
}

/** Write (replace) the cached inbox for an account. Best-effort — never throws. */
export async function saveInboxCache(entry: InboxCache): Promise<void> {
  if (!hasIDB()) return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* quota exceeded / storage disabled — fall back to re-fetching next time */
  }
}

/** Drop the cache for one account (sign-out), or all accounts when omitted. */
export async function clearInboxCache(email?: string): Promise<void> {
  if (!hasIDB()) return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      if (email) store.delete(email)
      else store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* ignore */
  }
}
