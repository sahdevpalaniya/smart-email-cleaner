import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { CATCH_ALL_ID } from '../lib/folders'
import { SMART_VIEWS } from '../lib/views'
import { CreateFolderModal } from './CreateFolderModal'
import { ChevronDownIcon, CloseIcon, PlusIcon, SparkleIcon, TrashIcon } from './icons'

/** 'dashboard' or a folder id. */
export type View = string

interface Props {
  view: View
  onSelect: (view: View) => void
  open: boolean
  onClose: () => void
}

export function Sidebar({ view, onSelect, open, onClose }: Props) {
  const { folders, folderCounts, emails, suggestions, deleteFolder, addFolder } = useApp()
  const [expanded, setExpanded] = useState(true)
  const [showEmpty, setShowEmpty] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Hide folders with 0 emails unless they're currently selected,
  // and order the rest by email count (highest first).
  const { visible, emptyCount } = useMemo(() => {
    const vis = folders
      .filter((f) => (folderCounts[f.id] ?? 0) > 0 || f.id === view)
      .sort((a, b) => (folderCounts[b.id] ?? 0) - (folderCounts[a.id] ?? 0))
    const empty = folders.filter((f) => (folderCounts[f.id] ?? 0) === 0 && f.id !== view).length
    return { visible: vis, emptyCount: empty }
  }, [folders, folderCounts, view])

  // Live counts for the smart views (Unread / Starred / Last 24 hours).
  const viewCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of SMART_VIEWS) c[v.id] = emails.filter(v.filter).length
    return c
  }, [emails])

  function go(v: View) {
    onSelect(v)
    onClose()
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[85vw] max-w-xs flex-col border-r border-slate-200 bg-white pt-16 transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950 sm:w-72 lg:static lg:z-0 lg:translate-x-0 lg:pt-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold text-slate-400">Menu</span>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 pb-4 lg:pt-4">
          {/* Dashboard */}
          <button
            onClick={() => go('dashboard')}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              view === 'dashboard'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base ${view === 'dashboard' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
              📊
            </span>
            <span>Dashboard</span>
            {emails.length > 0 && (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${view === 'dashboard' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {emails.length}
              </span>
            )}
          </button>

          {/* Clean up */}
          <button
            onClick={() => go('cleanup')}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              view === 'cleanup'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base ${view === 'cleanup' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
              🧹
            </span>
            <span>Clean up</span>
          </button>

          {/* Smart views — filter-based, not folders (Unread / Starred / Last 24 hours) */}
          <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Views
          </div>
          <div className="space-y-0.5">
            {SMART_VIEWS.map((v) => {
              const active = view === v.id
              const count = viewCounts[v.id] ?? 0
              return (
                <button
                  key={v.id}
                  onClick={() => go(v.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-inset ${active ? 'bg-white/20 ring-white/10' : v.accent}`}>
                    {v.icon}
                  </span>
                  <span className="truncate text-left">{v.label}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Folders header */}
          <div className="flex items-center gap-1 px-2 pb-1 pt-4">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <ChevronDownIcon width={14} height={14} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
              Folders
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
              title="Create folder"
              aria-label="Create folder"
            >
              <PlusIcon width={16} height={16} />
            </button>
          </div>

          {expanded && (
            <div className="space-y-0.5">
              {visible.map((f) => {
                const active = view === f.id
                const count = folderCounts[f.id] ?? 0
                const deletable = f.id !== CATCH_ALL_ID
                return (
                  <div key={f.id} className="group relative">
                    <button
                      onClick={() => go(f.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-inset ${active ? 'bg-white/20 ring-white/10' : f.accent}`}>
                        {f.icon}
                      </span>
                      <span className="truncate text-left">{f.label}</span>
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition ${
                          deletable ? 'opacity-0 lg:opacity-100 lg:group-hover:opacity-0' : ''
                        } ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
                      >
                        {count}
                      </span>
                    </button>
                    {deletable && (
                      <button
                        onClick={() => setConfirmDelete(f.id)}
                        className={`absolute right-2 top-1/2 block -translate-y-1/2 rounded-md p-1.5 transition lg:hidden lg:group-hover:block ${
                          active ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700'
                        }`}
                        title={`Delete ${f.label} folder`}
                        aria-label={`Delete ${f.label} folder`}
                      >
                        <TrashIcon width={15} height={15} />
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Toggle for empty folders */}
              {emptyCount > 0 && (
                <button
                  onClick={() => setShowEmpty((s) => !s)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showEmpty ? 'Hide empty folders' : `Show ${emptyCount} empty folder${emptyCount === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          )}

          {/* Suggested sender folders, auto-discovered from this inbox */}
          {suggestions.length > 0 && (
            <div className="pt-4">
              <div className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <SparkleIcon width={13} height={13} /> Suggested for you
              </div>
              <div className="space-y-0.5">
                {suggestions.slice(0, 5).map((s) => (
                  <button
                    key={s.folder.id}
                    onClick={() => addFolder(s.folder)}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={`Add ${s.folder.label} folder`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-inset ${s.folder.accent}`}>
                      {s.folder.icon}
                    </span>
                    <span className="truncate text-left text-slate-600 dark:text-slate-300">{s.folder.label}</span>
                    <span className="ml-auto text-xs tabular-nums text-slate-400">{s.count}</span>
                    <PlusIcon width={15} height={15} className="text-slate-300 transition group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-400" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {emails.length} emails · {folders.length} folders
        </div>
      </aside>

      <CreateFolderModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => go(id)} />

      {confirmDelete && (
        <DeleteFolderConfirm
          folderId={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete
            setConfirmDelete(null)
            deleteFolder(id)
            if (view === id) go('dashboard')
          }}
        />
      )}
    </>
  )
}

function DeleteFolderConfirm({
  folderId,
  onCancel,
  onConfirm,
}: {
  folderId: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const { folders, folderCounts } = useApp()
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return null
  const count = folderCounts[folderId] ?? 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
        <h2 className="text-lg font-semibold">Delete “{folder.label}” folder?</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          This removes the folder from your sidebar only — the {count} email{count === 1 ? '' : 's'} inside are{' '}
          <strong>not</strong> deleted. They’ll move back into their default category.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
            Delete folder
          </button>
        </div>
      </div>
    </div>
  )
}
