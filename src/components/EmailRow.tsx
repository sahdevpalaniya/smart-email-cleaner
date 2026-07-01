import type { Email } from '../types'
import { avatarColor, formatDate, initials } from '../lib/format'
import { MailOffIcon } from './icons'

interface Props {
  email: Email
  selected: boolean
  onToggle: (id: string) => void
  /** Open the email in the reader. The checkbox still handles selection. */
  onOpen?: (email: Email) => void
  onUnsubscribe?: (email: Email) => void
}

export function EmailRow({ email, selected, onToggle, onOpen, onUnsubscribe }: Props) {
  // A draft is from the user, so showing them as the "sender" is meaningless —
  // surface the recipient instead ("To: Jane"), matching how Gmail lists drafts.
  const isDraft = email.labelIds.includes('DRAFT')
  const primary = isDraft ? (email.to ? `To: ${email.to}` : 'To: (no recipient)') : email.fromName
  return (
    <li
      onClick={() => onOpen?.(email)}
      className={`group/row flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 transition last:border-0 dark:border-slate-800/70 ${
        selected
          ? 'bg-brand-50 dark:bg-brand-500/10'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(email.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
        aria-label={`Select email from ${email.fromName}`}
      />

      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white sm:h-9 sm:w-9 ${avatarColor(isDraft ? email.to : email.fromAddress)}`}>
        {isDraft ? '📝' : initials(email.fromName)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm ${email.unread ? 'font-bold' : 'font-medium'} text-slate-900 dark:text-slate-100`}>
            {primary}
          </span>
          {isDraft && (
            <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300" title="Unsent draft">Draft</span>
          )}
          {email.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
          {email.labelIds.includes('STARRED') && (
            <span className="shrink-0 text-xs text-amber-400" title="Starred" aria-label="starred">★</span>
          )}
          <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDate(email.date)}</span>
        </div>
        <div className={`truncate text-sm ${email.unread ? 'font-semibold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
          {email.subject}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-slate-400 dark:text-slate-500">{email.snippet}</span>
          {email.unsubscribe && onUnsubscribe && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUnsubscribe(email)
              }}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 lg:hidden lg:group-hover/row:flex"
              title="Unsubscribe from this sender"
            >
              <MailOffIcon width={12} height={12} />
              Unsubscribe
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
