import { useState } from 'react'

/**
 * The gate password is NOT stored in plaintext here — only its SHA-256 hash, so
 * the literal password never appears in the shipped bundle. The entered value is
 * hashed and compared. The real data is still protected server-side by
 * ADMIN_TOKEN (see api/users.ts) — set that env var to the same password.
 * (Hash below is SHA-256 of the admin password.)
 */
const ADMIN_PASSWORD_SHA256 = '6d42139eef91023589f719a37c060e8476ad9cc78d562013b10dbbde1bc0f61f'

/** SHA-256 → lowercase hex, via the browser's Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface UserRow {
  email: string
  firstSeen: string | null
}

/**
 * Standalone admin panel reached at /user-list (no Gmail login required).
 * Enter the password to view the list of every account that has signed in.
 * It POSTs the password to /api/users, which validates it against ADMIN_TOKEN
 * and returns the deduped list.
 */
export function AdminUserList() {
  const [password, setPassword] = useState('')
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Quick client check (hash comparison) so a wrong password never hits the network.
    if ((await sha256Hex(password)) !== ADMIN_PASSWORD_SHA256) {
      setError('Incorrect password.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 401) {
        setError('Server rejected the password. Set ADMIN_TOKEN to match on the host.')
        return
      }
      if (!res.ok) {
        setError(`Could not load the list (HTTP ${res.status}).`)
        return
      }
      const data = (await res.json()) as { users: UserRow[] }
      setUsers(data.users ?? [])
    } catch {
      // Most likely local `vite dev`, where /api isn't served.
      setError('Could not reach /api/users. This view works on the deployed app.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">User list</h1>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          Accounts that have signed in to the app.
        </p>

        {users === null ? (
          <form
            onSubmit={submit}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900"
          >
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="admin-pw">
              Password
            </label>
            <input
              id="admin-pw"
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
            />
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'View users'}
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {users.length} user{users.length === 1 ? '' : 's'}
              </span>
              <a
                href={`/api/users?token=${encodeURIComponent(password)}`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                Download users.txt
              </a>
            </div>
            {users.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No users yet.</p>
            ) : (
              <ul className="scrollbar-thin max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {users.map((u, i) => (
                  <li key={u.email} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
                    <span className="flex-1 truncate text-slate-800 dark:text-slate-200">{u.email}</span>
                    {u.firstSeen && (
                      <span className="shrink-0 text-xs text-slate-400" title="First signed in">
                        {u.firstSeen.slice(0, 10)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
