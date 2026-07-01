/**
 * Best-effort, fire-and-forget record of the signed-in user's email to the
 * `/api/track` serverless endpoint (which dedupes server-side in Vercel KV).
 *
 * It deliberately:
 *   - never throws and swallows every error, so sign-in is never blocked;
 *   - no-ops cleanly in local `vite dev`, where `/api` doesn't exist (the fetch
 *     just fails and is ignored);
 *   - uses `keepalive` so the request still completes if it fires right before
 *     the page navigates.
 */
export function trackUser(email: string): void {
  if (!email) return
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore — tracking must never affect the app */
  }
}
