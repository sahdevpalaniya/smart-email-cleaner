import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { CreateFolderModal } from './CreateFolderModal'
import { AdSlot } from './AdSlot'
import { PlusIcon, RefreshIcon, SparkleIcon } from './icons'

interface Props {
  onOpen: (folderId: string) => void
}

export function Dashboard({ onOpen }: Props) {
  const { folders, folderCounts, emails, estimate, suggestions, addFolder, refresh, loading, backgroundLoading } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)

  const unread = emails.filter((e) => e.unread).length
  const topFolder = folders.reduce(
    (top, f) => ((folderCounts[f.id] ?? 0) > (folderCounts[top.id] ?? 0) ? f : top),
    folders[0],
  )
  // Only call it "capped" once loading has fully stopped — while the background
  // windows are still streaming, a smaller count just means "not done yet".
  const capped = !backgroundLoading && estimate > emails.length

  const { visibleFolders, emptyCount } = useMemo(() => {
    const vis = folders.filter((f) => (folderCounts[f.id] ?? 0) > 0 || !f.builtin || showEmpty)
    const empty = folders.filter((f) => f.builtin && (folderCounts[f.id] ?? 0) === 0).length
    return { visibleFolders: vis, emptyCount: empty }
  }, [folders, folderCounts, showEmpty])

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-7">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Your inbox, auto-sorted into folders. Open one to review and bulk-clean.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label={capped ? 'Loaded' : 'Inbox emails'} value={emails.length} hint={capped ? `of ~${estimate}` : undefined} />
        <StatCard label="Unread" value={unread} />
        <StatCard label="Active folders" value={visibleFolders.length} />
        <StatCard label="Biggest folder" value={topFolder?.label ?? '—'} small />
      </div>

      {capped && (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Loaded the {emails.length} most recent of about <strong>{estimate}</strong> inbox emails (large-mailbox safety limit).
        </div>
      )}

      {/* Ad — placed on the folder-overview (no individual email content shown here) */}
      <AdSlot slot="0987654321" className="rounded-2xl overflow-hidden" />

      {/* Reload */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          {backgroundLoading
            ? 'Loading more of your inbox in the background — folders update as it arrives.'
            : 'Your whole inbox is loaded and sorted automatically.'}
        </span>
        <button
          onClick={refresh}
          disabled={loading || backgroundLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 sm:ml-auto sm:w-auto"
        >
          <RefreshIcon width={16} height={16} className={loading || backgroundLoading ? 'animate-spin' : ''} />
          {loading || backgroundLoading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {/* Suggested folders auto-discovered from this inbox */}
      {suggestions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <SparkleIcon width={18} height={18} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-lg font-semibold">Suggested folders</h2>
            <span className="text-sm text-slate-400">from your top senders</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.folder.id}
                onClick={() => addFolder(s.folder)}
                className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-sm font-medium shadow-soft transition hover:border-brand-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500/50"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset ${s.folder.accent}`}>
                  {s.folder.icon}
                </span>
                <span className="text-slate-700 dark:text-slate-200">{s.folder.label}</span>
                <span className="text-xs tabular-nums text-slate-400">{s.count}</span>
                <PlusIcon width={15} height={15} className="text-slate-300 transition group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-400" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Folder grid */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your folders</h2>
          {emptyCount > 0 && (
            <button
              onClick={() => setShowEmpty((s) => !s)}
              className="text-sm font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
            >
              {showEmpty ? 'Hide empty' : `Show ${emptyCount} empty`}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {visibleFolders.map((f) => {
            const count = folderCounts[f.id] ?? 0
            return (
              <button
                key={f.id}
                onClick={() => onOpen(f.id)}
                disabled={count === 0}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:shadow-soft dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500/40 sm:p-5"
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold ring-1 ring-inset ${f.accent}`}>
                  {f.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="truncate font-semibold">{f.label}</h3>
                    <span className="ml-auto text-xl font-bold tabular-nums sm:text-2xl">{count}</span>
                  </div>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{f.description || 'Custom folder'}</p>
                </div>
              </button>
            )
          })}

          <button
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[92px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
          >
            <PlusIcon width={18} height={18} />
            Create folder
          </button>
        </div>
      </section>

      <CreateFolderModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => onOpen(id)} />
    </div>
  )
}

function StatCard({ label, value, small, hint }: { label: string; value: string | number; small?: boolean; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
      <div className={`mt-1 font-bold tabular-nums ${small ? 'truncate text-lg' : 'text-2xl sm:text-3xl'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  )
}
