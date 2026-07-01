import type { Email, LoadProgress } from '../types'
import { categorize } from './categories'
import { parseUnsubscribe } from './unsubscribe'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** A single MIME part of a `format=full` message payload (recursive). */
interface GmailMessagePart {
  mimeType?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GmailMessagePart[]
}

/**
 * Raw shape of the Gmail messages.get response we care about. For the metadata
 * format only `headers` is populated; for `format=full` the payload is a full
 * MIME tree (mimeType + body.data + nested parts) we walk to extract the body.
 */
interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailMessagePart
}

interface ListResponse {
  messages?: { id: string; threadId: string }[]
  nextPageToken?: string
  resultSizeEstimate?: number
}

class GmailError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GmailError'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Status codes worth retrying: rate-limit + transient server errors. */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504)
}

/**
 * fetch() with bounded exponential backoff + jitter on 429/5xx. Network errors
 * (offline / DNS) are also retried. Honors `Retry-After` when present.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries = 4): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (!isRetryable(res.status) || attempt === retries) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 300)
      await sleep(backoff)
    } catch (err) {
      // Network failure — retry with backoff unless we're out of attempts.
      lastErr = err
      if (attempt === retries) break
      await sleep(Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 300))
    }
  }
  throw new GmailError(lastErr instanceof Error ? lastErr.message : 'Network request failed', 0)
}

async function gapi<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) detail = body.error.message
    } catch {
      /* ignore parse error */
    }
    throw new GmailError(detail, res.status)
  }
  // Some endpoints (e.g. batchModify) reply 204 No Content with an empty body —
  // calling res.json() on that throws "Unexpected end of JSON input". Read the
  // text first and only parse when there's actually something to parse.
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

function header(msg: GmailMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

/** Parse a raw `From` header into a display name + address + domain. */
function parseFrom(raw: string): { name: string; address: string; domain: string } {
  // Formats: "Jane Doe <jane@x.com>"  |  "jane@x.com"  |  "<jane@x.com>"
  const match = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/)
  const address = (match?.[2] ?? raw).trim().toLowerCase()
  let name = (match?.[1] ?? '').trim().replace(/^"|"$/g, '')
  const domain = address.includes('@') ? address.split('@')[1] : ''
  if (!name) name = address || raw
  return { name, address, domain }
}

function toEmail(msg: GmailMessage): Email {
  const from = parseFrom(header(msg, 'From'))
  const subject = header(msg, 'Subject') || '(no subject)'
  const snippet = decodeEntities(msg.snippet ?? '')
  // `To` can list several recipients; show the first one's name/address so a
  // draft row reads "To: Jane Doe" rather than a wall of addresses.
  const toRaw = header(msg, 'To')
  const toParsed = parseFrom(toRaw.split(',')[0] ?? '')
  const to = toRaw ? toParsed.name || toParsed.address || toRaw : ''
  const labelIds = msg.labelIds ?? []
  const date = msg.internalDate ? Number(msg.internalDate) : Date.parse(header(msg, 'Date')) || 0
  // RFC 2369 / bulk-mail signals — the strongest evidence of automated/list mail.
  const listUnsub = header(msg, 'List-Unsubscribe')
  const bulk =
    Boolean(listUnsub) ||
    Boolean(header(msg, 'List-Id')) ||
    /\b(bulk|list|auto_reply)\b/i.test(header(msg, 'Precedence'))
  return {
    id: msg.id,
    threadId: msg.threadId,
    fromName: from.name,
    fromAddress: from.address,
    domain: from.domain,
    subject,
    snippet,
    to,
    date,
    labelIds,
    unread: labelIds.includes('UNREAD'),
    bulk,
    unsubscribe: parseUnsubscribe(listUnsub, header(msg, 'List-Unsubscribe-Post')),
    category: categorize({ domain: from.domain, address: from.address, subject, snippet, labelIds, bulk }),
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/**
 * Decode the HTML entities Gmail puts in snippets (&amp; &#39; &#x27; …) without
 * touching the DOM. Avoiding `innerHTML` keeps this free of any HTML-parsing /
 * XSS surface; the result is also React-escaped again on render.
 */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
      // Reject control chars / out-of-range code points; keep the raw text.
      if (!Number.isFinite(cp) || cp < 0x20 || cp > 0x10ffff) return match
      try {
        return String.fromCodePoint(cp)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

/** Run async tasks with a bounded concurrency pool (Gmail rate-limit friendly). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

/** Metadata headers we hydrate for every message (incl. bulk-mail signals). */
const META_QS =
  'format=metadata' +
  '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date' +
  '&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post' +
  '&metadataHeaders=List-Id&metadataHeaders=Precedence'

/** Default emails per load window — one chunk of the inbox fetched at a time. */
export const WINDOW_SIZE = 1500

/** Gmail's HTTP-batch endpoint — lets us hydrate up to 100 messages per request. */
const BATCH_ENDPOINT = 'https://gmail.googleapis.com/batch/gmail/v1'
/** Messages per batch request (Gmail allows up to 100). */
const BATCH_SIZE = 100
/** Concurrent batch requests in flight (increased for faster fetching). */
const BATCH_CONCURRENCY = 8

/**
 * Hydrate a chunk of message ids in a single multipart/mixed batch request.
 * Falls back to individual GETs (handled by the caller) on failure.
 */
async function batchGetMessages(token: string, ids: string[]): Promise<GmailMessage[]> {
  const boundary = 'sec_batch_boundary'
  const body =
    ids
      .map(
        (id, i) =>
          `--${boundary}\r\n` +
          'Content-Type: application/http\r\n' +
          `Content-ID: <item-${i}>\r\n\r\n` +
          `GET /gmail/v1/users/me/messages/${id}?${META_QS}\r\n`,
      )
      .join('') + `--${boundary}--`

  const res = await fetchWithRetry(BATCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new GmailError(`Batch request failed`, res.status)

  const text = await res.text()
  const ct = res.headers.get('content-type') ?? ''
  const respBoundary = ct.match(/boundary=("?)([^";]+)\1/)?.[2]
  const segments = respBoundary ? text.split(`--${respBoundary}`) : [text]

  const messages: GmailMessage[] = []
  for (const seg of segments) {
    // Each part embeds an HTTP response whose body is a single JSON object.
    // Headers never contain braces, so first '{' … last '}' isolates the body.
    const start = seg.indexOf('{')
    const end = seg.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      const obj = JSON.parse(seg.slice(start, end + 1)) as GmailMessage
      if (obj && obj.id) messages.push(obj)
    } catch {
      /* skip unparseable / error parts */
    }
  }
  return messages
}

/**
 * Hydrate a list of message ids into categorized {@link Email}s.
 *
 * Uses Gmail's HTTP-batch endpoint (≈10× faster than per-message GETs), gap-fills
 * any sub-request the batch dropped, then reconciles a couple of times so the
 * loaded count reliably reaches the full set instead of stalling below it. Each
 * freshly-hydrated batch is emitted via `onBatch` for progressive rendering.
 */
async function hydrateIds(
  token: string,
  ids: string[],
  onProgress?: (p: LoadProgress) => void,
  onBatch?: (emails: Email[]) => void,
): Promise<Email[]> {
  onProgress?.({ loaded: 0, total: ids.length })
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE))

  // Loaded messages, keyed by id so a message is never counted twice.
  const byId = new Map<string, Email>()
  const hydrate = async (chunkIds: string[]): Promise<Email[]> => {
    let msgs: GmailMessage[] = []
    try {
      msgs = await batchGetMessages(token, chunkIds)
    } catch {
      msgs = []
    }
    // Gap-fill: any id the batch didn't return (a rate-limited or dropped
    // sub-request) is fetched individually so messages are never silently lost.
    const got = new Set(msgs.map((m) => m.id))
    const missing = chunkIds.filter((id) => !got.has(id))
    if (missing.length > 0) {
      const filled = await Promise.all(
        missing.map((id) =>
          gapi<GmailMessage>(token, `/messages/${id}?${META_QS}`).catch(() => null),
        ),
      )
      for (const m of filled) if (m) msgs.push(m)
    }
    // Surface only ids we haven't seen yet, so the progressive count rises
    // monotonically and never double-counts.
    const fresh: Email[] = []
    for (const m of msgs) {
      if (!m.id || byId.has(m.id)) continue
      const email = toEmail(m)
      byId.set(m.id, email)
      fresh.push(email)
    }
    onProgress?.({ loaded: Math.min(byId.size, ids.length), total: ids.length })
    if (fresh.length > 0) onBatch?.(fresh)
    return fresh
  }

  // Hydrate the very first chunk on its own for the fastest possible first paint,
  // then stream the remaining chunks with bounded concurrency in the background.
  if (chunks.length > 0) await hydrate(chunks[0])
  await pool(chunks.slice(1), BATCH_CONCURRENCY, hydrate)

  // Reconcile — retry anything that still didn't come through.
  for (let attempt = 0; attempt < 2; attempt++) {
    const missing = ids.filter((id) => !byId.has(id))
    if (missing.length === 0) break
    const retryChunks: string[][] = []
    for (let i = 0; i < missing.length; i += BATCH_SIZE) retryChunks.push(missing.slice(i, i + BATCH_SIZE))
    await pool(retryChunks, BATCH_CONCURRENCY, hydrate)
  }
  return [...byId.values()]
}

export interface WindowResult {
  /** The emails hydrated in this window (unsorted; caller merges + sorts). */
  emails: Email[]
  /** Cursor for the next window; undefined once the inbox is fully paged. */
  nextPageToken?: string
  /** Gmail's rough estimate of the whole inbox size (`in:inbox`). */
  estimate: number
}

/**
 * Load ONE window of the inbox — up to `windowSize` messages — starting from
 * `pageToken` (omit for the first window). This is the unit of paced loading: the
 * caller fetches a window, renders it, waits out a short cooling period, then asks
 * for the next window via the returned `nextPageToken`. Spreading the fetch into
 * windows keeps the first paint fast, caps the requests in flight at any moment,
 * and makes loading resumable instead of an all-or-nothing burst.
 *
 * On the FIRST window only, `includeQueries` (e.g. `is:starred`, `in:drafts`) are
 * folded in fully — these are small, stable sets that live outside the inbox but
 * still need their own folders/views.
 *
 * @param onProgress called as messages hydrate, for a live progress bar.
 * @param onBatch    called with each hydrated batch for progressive rendering.
 */
export async function fetchEmailWindow(
  token: string,
  opts: {
    pageToken?: string
    windowSize?: number
    query?: string
    includeQueries?: string[]
    /** Ids already loaded in earlier windows — skipped so we never double-fetch. */
    knownIds?: Set<string>
    onProgress?: (p: LoadProgress) => void
    onBatch?: (emails: Email[]) => void
  } = {},
): Promise<WindowResult> {
  const windowSize = opts.windowSize ?? WINDOW_SIZE
  const query = opts.query ?? 'in:inbox'
  const known = opts.knownIds ?? new Set<string>()
  const ids: string[] = []
  const idSet = new Set<string>()
  let pageToken = opts.pageToken
  let estimate = 0
  let done = false

  // Page the inbox (500 ids/page) until this window is full or we run out of
  // pages. De-dupe against both this window and ids loaded in earlier windows.
  while (ids.length < windowSize) {
    const params = new URLSearchParams({ maxResults: '500', q: query })
    if (pageToken) params.set('pageToken', pageToken)
    const list = await gapi<ListResponse>(token, `/messages?${params.toString()}`)
    if (typeof list.resultSizeEstimate === 'number') estimate = list.resultSizeEstimate
    for (const m of list.messages ?? []) {
      if (!idSet.has(m.id) && !known.has(m.id)) {
        idSet.add(m.id)
        ids.push(m.id)
      }
    }
    pageToken = list.nextPageToken
    if (!pageToken || !list.messages?.length) {
      done = true
      break
    }
  }

  // First window only: fold in the extra queries fully (starred/drafts are small).
  if (!opts.pageToken) {
    for (const extra of opts.includeQueries ?? []) {
      let extraToken: string | undefined
      do {
        const params = new URLSearchParams({ maxResults: '500', q: extra })
        if (extraToken) params.set('pageToken', extraToken)
        const list = await gapi<ListResponse>(token, `/messages?${params.toString()}`)
        for (const m of list.messages ?? []) {
          if (!idSet.has(m.id) && !known.has(m.id)) {
            idSet.add(m.id)
            ids.push(m.id)
          }
        }
        extraToken = list.nextPageToken
        if (!extraToken || !list.messages?.length) break
      } while (true)
    }
  }

  const emails = await hydrateIds(token, ids, opts.onProgress, opts.onBatch)
  return { emails, nextPageToken: done ? undefined : pageToken, estimate }
}

/** Gmail profile fields we read — `historyId` anchors incremental sync. */
interface ProfileResponse {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
  historyId: string
}

/**
 * Read the mailbox's current `historyId` — the anchor for {@link syncHistory}.
 * Capture this at the START of a full load so any change after that moment can be
 * replayed later as a delta instead of re-fetching the whole inbox.
 */
export async function getMailboxHistoryId(token: string): Promise<string> {
  const p = await gapi<ProfileResponse>(token, '/profile')
  return p.historyId
}

interface HistoryMessage {
  id: string
  threadId: string
  labelIds?: string[]
}
interface HistoryRecord {
  id: string
  messagesAdded?: { message: HistoryMessage }[]
  messagesDeleted?: { message: HistoryMessage }[]
  labelsAdded?: { message: HistoryMessage; labelIds: string[] }[]
  labelsRemoved?: { message: HistoryMessage; labelIds: string[] }[]
}
interface HistoryListResponse {
  history?: HistoryRecord[]
  nextPageToken?: string
  historyId: string
}

export interface HistorySync {
  /** Newly arrived inbox messages, hydrated + categorized. */
  added: Email[]
  /** Message ids that left the inbox (archived / trashed / deleted). */
  removedIds: string[]
  /** The mailbox historyId to store as the next sync anchor. */
  newHistoryId: string
  /**
   * True when `startHistoryId` was too old for Gmail to replay (404). The caller
   * must fall back to a full reload — the delta can't be reconstructed.
   */
  expired: boolean
}

/**
 * Fetch only what changed in the inbox since `startHistoryId`, via Gmail's
 * History API — the cheap, scalable alternative to re-listing the whole mailbox
 * on every refresh. Returns the ids that entered/left the inbox (hydrating the
 * new arrivals) plus the next anchor.
 *
 * Scoped with `labelId=INBOX` so we only see inbox-affecting changes: new mail
 * (messagesAdded / labelsAdded INBOX) and departures (messagesDeleted /
 * labelsRemoved INBOX — i.e. trashed or archived).
 */
export async function syncHistory(token: string, startHistoryId: string): Promise<HistorySync> {
  const addedIds = new Set<string>()
  const removedIds = new Set<string>()
  let pageToken: string | undefined
  let newHistoryId = startHistoryId

  try {
    do {
      const params = new URLSearchParams({ startHistoryId, maxResults: '500', labelId: 'INBOX' })
      params.append('historyTypes', 'messageAdded')
      params.append('historyTypes', 'messageDeleted')
      params.append('historyTypes', 'labelAdded')
      params.append('historyTypes', 'labelRemoved')
      if (pageToken) params.set('pageToken', pageToken)
      const res = await gapi<HistoryListResponse>(token, `/history?${params.toString()}`)
      if (res.historyId) newHistoryId = res.historyId
      for (const h of res.history ?? []) {
        for (const a of h.messagesAdded ?? []) {
          addedIds.add(a.message.id)
          removedIds.delete(a.message.id)
        }
        for (const d of h.messagesDeleted ?? []) {
          removedIds.add(d.message.id)
          addedIds.delete(d.message.id)
        }
        // INBOX label removed → left the inbox; added → entered it.
        for (const r of h.labelsRemoved ?? []) {
          if (r.labelIds?.includes('INBOX')) {
            removedIds.add(r.message.id)
            addedIds.delete(r.message.id)
          }
        }
        for (const a of h.labelsAdded ?? []) {
          if (a.labelIds?.includes('INBOX')) {
            addedIds.add(a.message.id)
            removedIds.delete(a.message.id)
          }
        }
      }
      pageToken = res.nextPageToken
    } while (pageToken)
  } catch (e) {
    // A startHistoryId older than Gmail's retention window comes back 404 — the
    // delta can't be replayed, so signal the caller to do a full reload.
    if (e instanceof GmailError && e.status === 404) {
      return { added: [], removedIds: [], newHistoryId: startHistoryId, expired: true }
    }
    throw e
  }

  const added = addedIds.size > 0 ? await hydrateIds(token, [...addedIds]) : []
  return { added, removedIds: [...removedIds], newHistoryId, expired: false }
}

/**
 * Estimate how many messages match a Gmail search query (e.g. "older_than:6m").
 * Uses Gmail's own server-side search — covers the whole mailbox, not just what's
 * loaded — and reads the cheap `resultSizeEstimate` (one request, one id).
 */
export async function countQuery(token: string, q: string): Promise<number> {
  const params = new URLSearchParams({ q, maxResults: '1' })
  const res = await gapi<ListResponse>(token, `/messages?${params.toString()}`)
  return res.resultSizeEstimate ?? 0
}

/** Collect every message id matching a search query (up to a safety cap). */
export async function listIdsByQuery(token: string, q: string, cap = 5000): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  while (ids.length < cap) {
    const params = new URLSearchParams({ q, maxResults: '500' })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await gapi<ListResponse>(token, `/messages?${params.toString()}`)
    if (res.messages) ids.push(...res.messages.map((m) => m.id))
    pageToken = res.nextPageToken
    if (!pageToken || !res.messages?.length) break
  }
  return ids
}

/**
 * Move messages to Trash (reversible — they sit in Gmail's Trash for ~30 days).
 * Uses batchModify to add the TRASH label in chunks of 1000 (API limit).
 */
export async function trashEmails(token: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const CHUNK = 1000
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    await gapi(token, '/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: chunk, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] }),
    })
  }
}

/**
 * Restore trashed messages (the inverse of {@link trashEmails}) so an accidental
 * delete can be undone. Removes the TRASH label from every id, and re-adds INBOX
 * only to `inboxIds` — the subset that actually lived in the inbox before being
 * trashed. Archived-starred mail and drafts (which carry no INBOX label) are
 * restored to exactly where they were, never forced into the inbox.
 */
export async function untrashEmails(token: string, ids: string[], inboxIds: string[]): Promise<void> {
  if (ids.length === 0) return
  const CHUNK = 1000
  // 1. Take everything out of Trash.
  for (let i = 0; i < ids.length; i += CHUNK) {
    await gapi(token, '/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: ids.slice(i, i + CHUNK), removeLabelIds: ['TRASH'] }),
    })
  }
  // 2. Re-add INBOX only to the messages that had it (trashEmails removed it).
  for (let i = 0; i < inboxIds.length; i += CHUNK) {
    await gapi(token, '/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: inboxIds.slice(i, i + CHUNK), addLabelIds: ['INBOX'] }),
    })
  }
}

/** The readable body of a single message, as extracted from its MIME tree. */
export interface MessageBody {
  /** Sanitized-elsewhere HTML body, if the message had a text/html part. */
  html?: string
  /** Plain-text body, if the message had a text/plain part. */
  text?: string
}

/**
 * Decode a base64url string (Gmail's `body.data` encoding) to a UTF-8 string.
 * Gmail uses the URL-safe alphabet (`-`/`_`) and may omit padding; we normalize
 * both, then decode the raw bytes through TextDecoder so multi-byte characters
 * (emoji, accents, non-Latin scripts) survive intact.
 */
function decodeBase64Url(data: string): string {
  let b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  if (b64.length % 4) b64 += '='.repeat(4 - (b64.length % 4))
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Walk a message's MIME tree depth-first, capturing the first text/html and the
 * first text/plain part we encounter. Multipart containers carry no body of
 * their own, so we just recurse into their `parts`.
 */
function extractBody(part: GmailMessagePart | undefined, out: MessageBody): void {
  if (!part) return
  const mime = (part.mimeType ?? '').toLowerCase()
  if (mime === 'text/html' && out.html === undefined && part.body?.data) {
    out.html = decodeBase64Url(part.body.data)
  } else if (mime === 'text/plain' && out.text === undefined && part.body?.data) {
    out.text = decodeBase64Url(part.body.data)
  }
  for (const child of part.parts ?? []) extractBody(child, out)
}

/**
 * Fetch a single message in full and return its readable body (HTML and/or
 * plain text). The HTML is returned raw — callers must sanitize before rendering.
 */
export async function fetchMessageBody(token: string, id: string): Promise<MessageBody> {
  const msg = await gapi<GmailMessage>(token, `/messages/${id}?format=full`)
  const body: MessageBody = {}
  extractBody(msg.payload, body)
  return body
}

/** Mark a message as read by removing its UNREAD label (gmail.modify scope). */
export async function markRead(token: string, id: string): Promise<void> {
  await gapi(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

export { GmailError }
