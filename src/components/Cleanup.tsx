import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store/AppContext'
import { ConfirmModal } from './ConfirmModal'
import { ACCENTS } from '../lib/categories'

interface Preset {
  id: string
  title: string
  description: string
  icon: string
  accent: string
  /** Gmail search query (server-side, whole mailbox). */
  query: string
}

/**
 * One-click bulk cleanups powered by Gmail's own search operators. Each acts on
 * the WHOLE mailbox (not just the loaded inbox) and moves matches to Trash, so
 * everything is reversible for ~30 days.
 */
const PRESETS: Preset[] = [
  { id: 'old-promos', title: 'Old promotions', description: 'Marketing & deals older than 3 months', icon: '🏷️', accent: ACCENTS.amber, query: 'category:promotions older_than:3m' },
  { id: 'old-social', title: 'Old social', description: 'Social updates older than 3 months', icon: '💬', accent: ACCENTS.sky, query: 'category:social older_than:3m' },
  { id: 'read-newsletters', title: 'Read newsletters', description: 'Already-read promos you kept', icon: '📰', accent: ACCENTS.violet, query: 'category:promotions is:read older_than:1m' },
  { id: 'large', title: 'Large emails', description: 'Bigger than 10 MB — storage hogs', icon: '📦', accent: ACCENTS.rose, query: 'larger:10M' },
  { id: 'old-updates', title: 'Old notifications', description: 'Updates older than 6 months', icon: '🔔', accent: ACCENTS.blue, query: 'category:updates older_than:6m' },
  { id: 'very-old', title: 'Ancient & read', description: 'Read mail older than 1 year', icon: '🗓️', accent: ACCENTS.slate, query: 'is:read older_than:1y' },
]

export function Cleanup() {
  const { previewCleanup, runCleanup } = useApp()
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [confirm, setConfirm] = useState<Preset | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const mounted = useRef(true)

  const loadCount = useCallback(
    async (p: Preset) => {
      try {
        const n = await previewCleanup(p.query)
        if (mounted.current) setCounts((c) => ({ ...c, [p.id]: n }))
      } catch {
        if (mounted.current) setCounts((c) => ({ ...c, [p.id]: 0 }))
      }
    },
    [previewCleanup],
  )

  useEffect(() => {
    mounted.current = true
    PRESETS.forEach(loadCount)
    return () => {
      mounted.current = false
    }
  }, [loadCount])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500)
  }

  async function run() {
    if (!confirm) return
    setBusy(true)
    try {
      const n = await runCleanup(confirm.query)
      flash(n > 0 ? `Moved ${n} email${n === 1 ? '' : 's'} to Trash ✓` : 'Nothing to clean — already tidy!')
      setCounts((c) => ({ ...c, [confirm.id]: 0 }))
      setConfirm(null)
      // Recount the presets (their queries overlap) so the tiles stay accurate.
      // No inbox refetch — runCleanup already pruned the trashed mail from local
      // state, so reloading the whole inbox would only add needless server load.
      PRESETS.forEach(loadCount)
    } catch {
      flash('Cleanup failed — please try again.')
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Clean up</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          One-click bulk cleanups across your <strong>whole mailbox</strong>. Everything moves to Trash — reversible for 30 days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {PRESETS.map((p) => {
          const count = counts[p.id]
          const loading = count === undefined
          const empty = count === 0
          return (
            <div
              key={p.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ring-1 ring-inset ${p.accent}`}>
                  {p.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{p.title}</h3>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{p.description}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {loading ? (
                    <span className="inline-block h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  ) : (
                    <>
                      <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{count}</span> match
                    </>
                  )}
                </span>
                <button
                  onClick={() => setConfirm(p)}
                  disabled={loading || empty}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-default disabled:opacity-40"
                >
                  {empty ? 'All clear' : 'Clean up'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Counts are Gmail's own estimate and may differ slightly from the exact number trashed.
      </p>

      <ConfirmModal
        open={confirm !== null}
        busy={busy}
        title={`Clean up “${confirm?.title}”?`}
        message={
          confirm
            ? `About ${counts[confirm.id] ?? 0} matching email${(counts[confirm.id] ?? 0) === 1 ? '' : 's'} across your mailbox will be moved to Gmail Trash. You can restore them within 30 days.`
            : ''
        }
        confirmLabel={`Move ${confirm ? (counts[confirm.id] ?? 0) : 0} to Trash`}
        onConfirm={run}
        onCancel={() => !busy && setConfirm(null)}
      />

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  )
}
