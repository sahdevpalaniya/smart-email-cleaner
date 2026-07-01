import type { Email } from '../types'

export interface UnsubInfo {
  /** An https:// unsubscribe endpoint, if the sender offered one. */
  http?: string
  /** A mailto: unsubscribe address, if offered. */
  mailto?: string
  /** RFC 8058 one-click: sender accepts a POST and won't require interaction. */
  oneClick: boolean
}

/**
 * Parse the `List-Unsubscribe` (+ `List-Unsubscribe-Post`) headers.
 * Header form:  <https://...>, <mailto:unsub@x.com?subject=unsub>
 */
export function parseUnsubscribe(listUnsub: string, listUnsubPost: string): UnsubInfo | undefined {
  if (!listUnsub) return undefined
  const info: UnsubInfo = { oneClick: false }
  const parts = listUnsub.match(/<([^>]+)>/g) ?? []
  for (const raw of parts) {
    const url = raw.slice(1, -1).trim()
    if (/^https?:/i.test(url) && !info.http) info.http = url
    else if (/^mailto:/i.test(url) && !info.mailto) info.mailto = url
  }
  if (!info.http && !info.mailto) return undefined
  // One-click is only valid with an HTTPS endpoint + the List-Unsubscribe-Post header.
  if (info.http && /one-click/i.test(listUnsubPost)) info.oneClick = true
  return info
}

export type UnsubResult = 'one-click' | 'opened-web' | 'opened-mail' | 'none'

/**
 * Act on an email's unsubscribe info.
 *  - RFC 8058 one-click  → POST in the background (no-cors; we can't read the
 *    response, but the request is delivered and the list processes it).
 *  - https without one-click → open the unsubscribe page in a new tab.
 *  - mailto → open the user's mail client with a pre-filled unsubscribe email.
 */
export async function unsubscribe(email: Email): Promise<UnsubResult> {
  const u = email.unsubscribe
  if (!u) return 'none'

  if (u.http && u.oneClick) {
    try {
      await fetch(u.http, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      })
      return 'one-click'
    } catch {
      // Fall through to opening the page if the POST is blocked.
    }
  }
  if (u.http) {
    window.open(u.http, '_blank', 'noopener,noreferrer')
    return 'opened-web'
  }
  if (u.mailto) {
    window.location.href = u.mailto
    return 'opened-mail'
  }
  return 'none'
}
