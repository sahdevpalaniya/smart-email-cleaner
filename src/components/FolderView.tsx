import { useEffect, useMemo, useState } from 'react'
import type { Email, Folder, SortKey } from '../types'
import { useApp } from '../store/AppContext'
import { ConfirmModal } from './ConfirmModal'
import { EmailReader } from './EmailReader'
import { EmailRow } from './EmailRow'
import { ChevronLeftIcon, MailOffIcon, SearchIcon, TrashIcon } from './icons'
import { getSmartView } from '../lib/views'
import { useIsMobile } from '../hooks/useIsMobile'

interface Props {
  folderId: string
  onBack: () => void
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'sender-asc', label: 'Sender A–Z' },
  { value: 'subject-asc', label: 'Subject A–Z' },
]

export function FolderView({ folderId, onBack }: Props) {
  const { folders, folderIndex, emails, deleteEmails, unsubscribeEmail } = useApp()
  const isMobile = useIsMobile()
  // A view id is either a smart view (Unread / Starred / Last 24h) or a folder.
  // Both expose { label, icon, accent, description }, so the rest of the UI is shared.
  const smart = getSmartView(folderId)
  const meta = smart ?? folders.find((f) => f.id === folderId)

  const [query, setQuery] = useState('')
  const [sender, setSender] = useState('all')
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { ids: string[]; mode: 'selected' | 'all' }>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [openEmail, setOpenEmail] = useState<Email | null>(null)

  // Reset transient UI state whenever the folder changes.
  useEffect(() => {
    setSelected(new Set())
    setQuery('')
    setSender('all')
    setSort('date-desc')
    setOpenEmail(null)
  }, [folderId])

  const folderEmails = useMemo(
    () =>
      smart
        ? emails.filter(smart.filter)
        : emails.filter((e) => folderIndex[e.id] === folderId),
    [emails, folderIndex, folderId, smart],
  )

  // Folder may have been deleted while open — bounce back to the dashboard.
  // (Smart views always resolve, so this only fires for removed folders.)
  useEffect(() => {
    if (!meta) onBack()
  }, [meta, onBack])

  // Unique senders for the filter dropdown.
  const senders = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of folderEmails) {
      if (!map.has(e.fromAddress)) map.set(e.fromAddress, e.fromName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [folderEmails])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = folderEmails.filter((e) => {
      if (sender !== 'all' && e.fromAddress !== sender) return false
      if (!q) return true
      return (
        e.subject.toLowerCase().includes(q) ||
        e.fromName.toLowerCase().includes(q) ||
        e.fromAddress.toLowerCase().includes(q) ||
        e.snippet.toLowerCase().includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'date-asc': return a.date - b.date
        case 'sender-asc': return a.fromName.localeCompare(b.fromName)
        case 'subject-asc': return a.subject.localeCompare(b.subject)
        default: return b.date - a.date
      }
    })
    return list
  }, [folderEmails, query, sender, sort])

  // Smart views (Unread / Starred / Last 24h) span every folder, so group their
  // emails by the folder each one lives in — making it easy to spot important
  // mail at a glance. Regular folders render as a flat list (grouped === null).
  // Order preserved from `visible`, so the active sort still applies within groups.
  const grouped = useMemo(() => {
    if (!smart) return null
    const byFolder = new Map<string, Email[]>()
    for (const e of visible) {
      const fid = folderIndex[e.id]
      const list = byFolder.get(fid)
      if (list) list.push(e)
      else byFolder.set(fid, [e])
    }
    return [...byFolder.entries()]
      .map(([fid, list]) => ({ folder: folders.find((f) => f.id === fid), emails: list }))
      .filter((g): g is { folder: Folder; emails: Email[] } => Boolean(g.folder))
      .sort((a, b) => b.emails.length - a.emails.length)
  }, [smart, visible, folderIndex, folders])

  // Prune selections that are no longer visible (e.g. after filtering).
  const visibleIds = useMemo(() => new Set(visible.map((e) => e.id)), [visible])
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  )
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((cur) => {
      const next = new Set(cur)
      if (allSelected) visible.forEach((e) => next.delete(e.id))
      else visible.forEach((e) => next.add(e.id))
      return next
    })
  }

  async function runDelete() {
    if (!confirm) return
    setBusy(true)
    try {
      await deleteEmails(confirm.ids)
      setSelected(new Set())
      setConfirm(null)
    } catch {
      // error surfaces via context banner; keep modal open state reset
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500)
  }

  async function handleUnsubscribe(email: Email) {
    const result = await unsubscribeEmail(email)
    flash(
      result === 'one-click'
        ? `Unsubscribed from ${email.fromName} ✓`
        : result === 'opened-web'
          ? 'Opened the unsubscribe page in a new tab.'
          : result === 'opened-mail'
            ? 'Opened an unsubscribe email in your mail app.'
            : 'No unsubscribe option for this sender.',
    )
  }

  // Selected emails that expose an unsubscribe option, de-duped by sender.
  const unsubableSelected = useMemo(() => {
    const bySender = new Map<string, (typeof visible)[number]>()
    for (const e of visible) {
      if (selected.has(e.id) && e.unsubscribe && !bySender.has(e.fromAddress)) bySender.set(e.fromAddress, e)
    }
    return [...bySender.values()]
  }, [visible, selected])

  async function bulkUnsubscribe() {
    if (unsubableSelected.length === 0) return
    let done = 0
    for (const e of unsubableSelected) {
      const r = await unsubscribeEmail(e)
      if (r !== 'none') done++
    }
    flash(`Sent unsubscribe to ${done} sender${done === 1 ? '' : 's'}.`)
  }

  if (!meta) return null

  const showMobileBar = isMobile && selectedVisible.length > 0

  return (
    <div className={`mx-auto max-w-5xl animate-fade-in ${showMobileBar ? 'pb-24' : ''}`}>
      {/* Folder header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Back to dashboard"
        >
          <ChevronLeftIcon />
        </button>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ring-1 ring-inset ${meta.accent}`}>{meta.icon}</div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{meta.label}</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {folderEmails.length} email{folderEmails.length !== 1 && 's'} · {meta.description}
          </p>
        </div>

        {folderEmails.length > 0 && (
          <button
            onClick={() => setConfirm({ ids: folderEmails.map((e) => e.id), mode: 'all' })}
            className="ml-auto shrink-0 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            <TrashIcon width={16} height={16} />
            <span className="hidden sm:inline">Delete all {folderEmails.length}</span>
            <span className="sm:hidden">All</span>
          </button>
        )}
      </div>

      {/* Toolbar — on mobile the search takes a full row and the two filters sit
          side-by-side beneath it, so nothing gets crushed on a narrow screen. */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:min-w-[180px] sm:flex-1">
          <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject, sender or text…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 sm:max-w-[180px] sm:flex-none"
            aria-label="Filter by sender"
          >
            <option value="all">All senders</option>
            {senders.map(([addr, name]) => (
              <option key={addr} value={addr}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 sm:flex-none"
            aria-label="Sort emails"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selection bar */}
      <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800/60">
        <label className="flex cursor-pointer select-none items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={visible.length === 0}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
          />
          {selectedVisible.length > 0 ? `${selectedVisible.length} selected` : 'Select all'}
        </label>

        {/* Desktop inline actions. On mobile these move to the sticky bar below
            so the selection row stays readable on a narrow screen. */}
        {selectedVisible.length > 0 && (
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            {unsubableSelected.length > 0 && (
              <button
                onClick={bulkUnsubscribe}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
                title="Unsubscribe from the selected senders"
              >
                <MailOffIcon width={14} height={14} />
                Unsubscribe ({unsubableSelected.length})
              </button>
            )}
            <button
              onClick={() => setConfirm({ ids: selectedVisible, mode: 'selected' })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
            >
              <TrashIcon width={14} height={14} />
              Delete selected
            </button>
          </div>
        )}
        <span className={`text-slate-400 dark:text-slate-500 ${selectedVisible.length > 0 ? 'ml-auto sm:ml-0' : 'ml-auto'}`}>
          {visible.length} shown
        </span>
      </div>

      {/* Email list */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {folderEmails.length === 0 ? 'This folder is empty 🎉' : 'No emails match your filters.'}
        </div>
      ) : grouped ? (
        // Smart view: emails grouped by their folder so important mail is easy to find.
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.folder.id}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ring-1 ring-inset ${g.folder.accent}`}>
                  {g.folder.icon}
                </span>
                <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{g.folder.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {g.emails.length}
                </span>
              </div>
              <ul className="scrollbar-thin overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {g.emails.map((e) => (
                  <EmailRow key={e.id} email={e} selected={selected.has(e.id)} onToggle={toggle} onOpen={setOpenEmail} onUnsubscribe={handleUnsubscribe} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="scrollbar-thin overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {visible.map((e) => (
            <EmailRow key={e.id} email={e} selected={selected.has(e.id)} onToggle={toggle} onOpen={setOpenEmail} onUnsubscribe={handleUnsubscribe} />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirm !== null}
        busy={busy}
        title={confirm?.mode === 'all' ? `Delete all ${meta.label} emails?` : `Delete ${confirm?.ids.length ?? 0} email${confirm?.ids.length === 1 ? '' : 's'}?`}
        message={
          confirm?.mode === 'all'
            ? `All ${confirm.ids.length} emails in ${meta.label} will be moved to Gmail Trash. You can restore them from Trash within 30 days.`
            : `The selected email${(confirm?.ids.length ?? 0) === 1 ? '' : 's'} will be moved to Gmail Trash. You can restore them within 30 days.`
        }
        confirmLabel={`Move ${confirm?.ids.length ?? 0} to Trash`}
        onConfirm={runDelete}
        onCancel={() => !busy && setConfirm(null)}
      />

      <EmailReader email={openEmail} onClose={() => setOpenEmail(null)} />

      {/* Mobile-only sticky bulk-action bar. Desktop shows these actions inline in
          the selection row; on a phone they live in a thumb-reachable bottom bar. */}
      {showMobileBar && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{selectedVisible.length} selected</span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unsubableSelected.length > 0 && (
              <button
                onClick={bulkUnsubscribe}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                title="Unsubscribe from the selected senders"
              >
                <MailOffIcon width={14} height={14} />
                Unsub ({unsubableSelected.length})
              </button>
            )}
            <button
              onClick={() => setConfirm({ ids: selectedVisible, mode: 'selected' })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition active:scale-95"
            >
              <TrashIcon width={14} height={14} />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Transient toast for unsubscribe feedback — lifted above the mobile bar. */}
      {toast && (
        <div className={`fixed left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-slate-900 ${showMobileBar ? 'bottom-20' : 'bottom-5'}`}>
          {toast}
        </div>
      )}
    </div>
  )
}
