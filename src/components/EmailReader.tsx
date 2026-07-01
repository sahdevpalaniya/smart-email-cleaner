import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Email } from '../types'
import type { MessageBody } from '../lib/gmail'
import { useApp } from '../store/AppContext'
import { avatarColor, formatDate, initials } from '../lib/format'
import { CloseIcon, MailOffIcon, TrashIcon } from './icons'

interface Props {
  email: Email | null
  onClose: () => void
}

// Force every link in a rendered email to open in a new, isolated tab — matches
// the noopener/noreferrer posture used for unsubscribe links (src/lib/unsubscribe.ts).
// Registered once at module load so it applies to every sanitize() call.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function EmailReader({ email, onClose }: Props) {
  const { fetchEmailBody, markEmailRead, deleteEmails, unsubscribeEmail } = useApp()
  const [body, setBody] = useState<MessageBody | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch the full body (and mark read) whenever a different email is opened.
  useEffect(() => {
    if (!email) return
    let cancelled = false
    setBody(null)
    setError(null)
    setLoading(true)
    fetchEmailBody(email.id)
      .then((b) => {
        if (!cancelled) setBody(b)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this email.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // Marking read is best-effort; its own optimistic update surfaces in the list.
    if (email.unread) void markEmailRead(email.id).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [email, fetchEmailBody, markEmailRead])

  // Close on Escape (disabled mid-delete, like ConfirmModal).
  useEffect(() => {
    if (!email) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [email, deleting, onClose])

  // Sanitize the HTML body once per fetch. DOMPurify strips scripts/handlers; the
  // afterSanitizeAttributes hook above hardens links. ADD_ATTR keeps target=_blank.
  const cleanHtml = useMemo(
    () => (body?.html ? DOMPurify.sanitize(body.html, { ADD_ATTR: ['target'] }) : ''),
    [body],
  )

  if (!email) return null

  async function handleDelete() {
    if (!email) return
    setDeleting(true)
    try {
      await deleteEmails([email.id])
      onClose()
    } catch {
      // Error surfaces via the context banner; just re-enable the button.
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-subject"
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !deleting && onClose()}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col animate-scale-in rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(email.fromAddress)}`}>
            {initials(email.fromName)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="reader-subject" className="truncate text-lg font-bold tracking-tight">
              {email.subject}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">{email.fromName}</span>
              <span className="truncate text-slate-400 dark:text-slate-500">&lt;{email.fromAddress}&gt;</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{formatDate(email.date)}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        {/* Body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400 dark:text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500 dark:border-slate-700 dark:border-t-brand-400" />
              Loading email…
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-rose-500">{error}</div>
          ) : cleanHtml ? (
            <div className="email-body" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
          ) : body?.text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-700 dark:text-slate-300">
              {body.text}
            </pre>
          ) : (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">{email.snippet || 'This email has no readable content.'}</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          {email.unsubscribe && (
            <button
              onClick={() => void unsubscribeEmail(email)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
              title="Unsubscribe from this sender"
            >
              <MailOffIcon width={14} height={14} />
              Unsubscribe
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <TrashIcon width={14} height={14} />
            )}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
