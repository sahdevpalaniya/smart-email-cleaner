import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

/**
 * Records the signed-in user's email so the owner can see who has used the app.
 *
 * Storage is Vercel KV (private Redis), NOT a file: a serverless filesystem is
 * wiped on every deploy, and Vercel Blob is public-read (it would expose the
 * whole list). `SADD` is the dedup — an email is stored exactly once no matter
 * how many times the user signs in — and the set persists across deploys, so a
 * rebuild never clears it.
 *
 * This endpoint is best-effort: it always responds 200 and never throws, so a
 * tracking hiccup can never block or slow down sign-in.
 */

const USERS_KEY = 'app:users'
const FIRST_SEEN_KEY = 'app:users:firstSeen'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end()
    return
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
    const email = String(body.email ?? '').trim().toLowerCase()

    // Validate before touching the store; ignore anything that isn't an email.
    if (EMAIL_RE.test(email) && email.length <= 320) {
      // sadd returns the number of NEW members added: 1 the first time we see an
      // email, 0 on every subsequent sign-in. Only stamp first-seen on the first.
      const added = await kv.sadd(USERS_KEY, email)
      if (added) {
        await kv.hset(FIRST_SEEN_KEY, { [email]: new Date().toISOString() })
      }
    }
  } catch {
    /* swallow — tracking must never affect the user's session */
  }

  res.status(200).json({ ok: true })
}
