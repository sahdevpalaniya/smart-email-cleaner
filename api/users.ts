import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import { createHash } from 'node:crypto'

/**
 * Owner-only export of the tracked user list (see api/track.ts).
 *
 * The admin password is NOT stored in an env var or in plaintext — only its
 * SHA-256 hash is hard-coded below, so the literal password lives nowhere in the
 * repo or deploy. The caller's password is hashed and compared. (Hash is
 * SHA-256 of the admin password.)
 *
 * Auth is the admin password only — supplied in the request body as
 * `{ password }`. The `?token=` query param and `x-admin-token` header are no
 * longer accepted.
 *
 * Used two ways (both authenticate with the body password):
 *   - The in-app /user-list admin panel POSTs `{ password }` and renders JSON.
 *   - A GET with `{ password }` in the body downloads a plain-text users.txt.
 */

const USERS_KEY = 'app:users'
const FIRST_SEEN_KEY = 'app:users:firstSeen'
const ADMIN_PASSWORD_SHA256 = '6d42139eef91023589f719a37c060e8476ad9cc78d562013b10dbbde1bc0f61f'

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body =
    typeof req.body === 'string' ? safeJson(req.body) : ((req.body ?? {}) as Record<string, unknown>)
  const provided = typeof body.password === 'string' ? body.password : undefined

  // Compare the SHA-256 of the supplied password against the stored hash.
  if (!provided || sha256Hex(provided) !== ADMIN_PASSWORD_SHA256) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  const emails = ((await kv.smembers(USERS_KEY)) as string[]).sort()
  const firstSeen = ((await kv.hgetall(FIRST_SEEN_KEY)) ?? {}) as Record<string, string>

  // POST (from the admin panel) → JSON the UI can render.
  if (req.method === 'POST') {
    res.status(200).json({
      ok: true,
      count: emails.length,
      users: emails.map((email) => ({ email, firstSeen: firstSeen[email] ?? null })),
    })
    return
  }

  // GET → downloadable users.txt.
  const lines = emails.map((e) => (firstSeen[e] ? `${e}\t${firstSeen[e]}` : e))
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="users.txt"')
  res.status(200).send(`# ${emails.length} users\n${lines.join('\n')}\n`)
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}
