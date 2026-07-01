import type { GoogleProfile } from '../types'

/**
 * Thin wrapper around Google Identity Services (GIS) OAuth token flow.
 *
 * We use the *implicit* token model (no backend / client secret required):
 *   - `google.accounts.oauth2.initTokenClient` mints a short-lived access token.
 *   - The token is used as a Bearer credential against the Gmail REST API.
 *
 * Security posture for "remember me":
 *   - The access token is stored ONLY in `sessionStorage`, so it survives a page
 *     refresh but is wiped when the tab/browser closes — it never lingers on disk.
 *   - Only the (non-sensitive) display profile is kept in `localStorage`, purely so
 *     a returning user can be re-authenticated *silently* (`prompt: ''`) without a
 *     fresh access token ever being written to durable storage.
 *   - Everything is revoked + cleared on sign-out, and the token auto-expires (~1h).
 */

// Scopes:
//   gmail.modify -> read message metadata + move messages to Trash (batchModify).
//     This is all the app does; we deliberately avoid the full-access
//     https://mail.google.com/ scope (a "restricted" scope that unverified apps
//     can only grant to test users) so any user can authorize the app.
//   openid/email/profile -> lets us show the signed-in account in the header.
export const GMAIL_SCOPE =
  'openid email profile https://www.googleapis.com/auth/gmail.modify'

// The one scope the app cannot function without (read metadata + move to Trash).
// openid/email/profile only power the header avatar, so we don't require them —
// but Gmail access is non-negotiable. Google's *granular consent* lets a user
// approve sign-in while leaving this checkbox UNticked, so we must verify it
// was actually granted (see grantedRequiredScope below).
export const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

// Minimal typings for the GIS global so we don't pull in extra deps.
interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  error?: string
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}
interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type: string }) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
  /**
   * GIS helper: true only if every listed scope was actually granted. Optional
   * because older GIS builds may not expose it — we fall back to parsing
   * `resp.scope` ourselves in grantedRequiredScope.
   */
  hasGrantedAllScopes?: (resp: TokenResponse, ...scopes: string[]) => boolean
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleAccountsOAuth2 } }
  }
}

let cachedToken: { value: string; expiresAt: number; scope: string } | null = null
let cachedProfile: GoogleProfile | null = null

// Access token → sessionStorage (cleared on tab close). Profile → localStorage.
const TOKEN_KEY = 'sec-token-v1'
const PROFILE_KEY = 'sec-profile-v1'

function persistToken(): void {
  try {
    if (cachedToken) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(cachedToken))
  } catch {
    /* storage disabled — token simply won't survive refresh */
  }
}

/** Remember the (non-sensitive) profile so a returning user can be silently re-authed. */
export function rememberProfile(profile: GoogleProfile): void {
  cachedProfile = profile
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}

/**
 * Hydrate in-memory state from storage and return the remembered profile, if any.
 * Pulls a still-valid token from sessionStorage so a refresh restores instantly.
 */
export function loadRememberedProfile(): GoogleProfile | null {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY)
    const parsed = t
      ? (JSON.parse(t) as { value: string; expiresAt: number; scope?: string })
      : null
    // A token persisted before scope-tracking existed has no `scope` field; treat
    // it as '' so isTokenValid() rejects it and we re-mint with the Gmail scope.
    cachedToken =
      parsed && typeof parsed.value === 'string'
        ? { value: parsed.value, expiresAt: parsed.expiresAt, scope: parsed.scope ?? '' }
        : null
  } catch {
    cachedToken = null
  }
  try {
    const p = localStorage.getItem(PROFILE_KEY)
    cachedProfile = p ? (JSON.parse(p) as GoogleProfile) : null
  } catch {
    cachedProfile = null
  }
  return cachedProfile
}

function clearStorage(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PROFILE_KEY)
  } catch {
    /* ignore */
  }
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && !CLIENT_ID.startsWith('your-client-id'))
}

/**
 * Is the cached access token still usable? It must be unexpired (30s safety
 * margin) AND carry the Gmail scope — a token granted without it (or persisted
 * before we tracked scope) must not be reused, or Gmail calls would 403.
 */
export function isTokenValid(): boolean {
  return Boolean(
    cachedToken &&
      cachedToken.expiresAt > Date.now() + 30_000 &&
      scopeStringHasRequired(cachedToken.scope),
  )
}

/** Wait for the async GIS script tag to finish loading. */
function waitForGis(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const start = Date.now()
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        reject(new Error('Google Identity Services failed to load. Check your network / ad-blocker.'))
      }
    }, 50)
  })
}

/** Returns the current access token if it is still valid, else null. */
export function getCachedToken(): string | null {
  return isTokenValid() ? cachedToken!.value : null
}

/**
 * Did the user actually grant the Gmail scope the app needs?
 *
 * With Google's *granular consent*, a user can approve the sign-in while leaving
 * the Gmail permission checkbox UNticked. GIS still resolves successfully and
 * mints an access token — but one that only carries the scopes that were ticked.
 * If we accepted it, the very first Gmail call would fail with the confusing
 * 403 "Request had insufficient authentication scopes." So we verify up-front.
 */
/** Does a space-delimited granted-scope string include the required Gmail scope? */
function scopeStringHasRequired(granted: string): boolean {
  return granted.split(/\s+/).includes(REQUIRED_SCOPE)
}

function grantedRequiredScope(resp: TokenResponse): boolean {
  const helper = window.google?.accounts?.oauth2?.hasGrantedAllScopes
  if (helper) return helper(resp, REQUIRED_SCOPE)
  // Fallback: `resp.scope` is a space-delimited list of the granted scopes.
  return scopeStringHasRequired(resp.scope ?? '')
}

/** Thrown when sign-in succeeds but the user declined the Gmail permission. */
export const SCOPE_DECLINED_MESSAGE =
  'Gmail access wasn’t granted. On Google’s consent screen, please check the box ' +
  'that lets the app view and manage your Gmail, then continue — the inbox can’t ' +
  'be loaded or cleaned without it.'

/**
 * Trigger the Google sign-in / consent popup and resolve with an access token.
 * @param prompt 'consent' forces the consent screen; 'none' is fully silent
 *   (errors instead of showing UI — used for background renewal on page load);
 *   '' lets GIS decide.
 */
export async function requestToken(prompt: 'consent' | 'none' | '' = ''): Promise<string> {
  if (!isConfigured()) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID. Copy .env.example to .env and add your OAuth client id.')
  }
  await waitForGis()

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: GMAIL_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Authorization failed: ${resp.error}`))
          return
        }
        // Granular consent: the token can come back valid but WITHOUT the Gmail
        // scope if the user didn't tick its checkbox. Reject here so the caller
        // can re-prompt, instead of letting a later Gmail call 403.
        if (!grantedRequiredScope(resp)) {
          reject(new Error(SCOPE_DECLINED_MESSAGE))
          return
        }
        cachedToken = {
          value: resp.access_token,
          expiresAt: Date.now() + resp.expires_in * 1000,
          scope: resp.scope ?? '',
        }
        persistToken()
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        reject(new Error(err.type === 'popup_closed' ? 'Sign-in was cancelled.' : `Sign-in error: ${err.type}`))
      },
    })
    client.requestAccessToken({ prompt })
  })
}

/** Revoke the current token and clear all local + stored state. */
export function signOut(): void {
  const token = cachedToken?.value
  cachedToken = null
  cachedProfile = null
  clearStorage()
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token)
  }
}

/** Fetch the signed-in user's basic profile via the OpenID userinfo endpoint. */
export async function fetchProfile(token: string): Promise<GoogleProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to load Google profile.')
  const data = (await res.json()) as { email: string; name?: string; picture?: string }
  return { email: data.email, name: data.name ?? data.email, picture: data.picture }
}
