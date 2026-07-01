import type { Email } from '../types'
import { ACCENTS } from './categories'

/**
 * A "smart view" is a filter-based pseudo-folder shown in the sidebar (Unread,
 * Starred, Last 24 hours). Unlike a Folder it has no rule/persistence — it just
 * filters the loaded emails on the fly. It shares the visual shape of a Folder
 * (`label` / `icon` / `accent` / `description`) so FolderView can render it with
 * the exact same UI.
 */
export interface SmartView {
  id: string
  label: string
  icon: string
  accent: string
  description: string
  /** Returns true for emails that belong in this view. */
  filter: (e: Email) => boolean
}

/** Rolling 24-hour window, in milliseconds. */
const DAY_MS = 86_400_000

export const SMART_VIEWS: SmartView[] = [
  {
    id: 'view:unread',
    label: 'Unread',
    icon: '📩',
    accent: ACCENTS.blue,
    description: 'Emails you haven’t read yet',
    filter: (e) => e.unread,
  },
  {
    id: 'view:starred',
    label: 'Starred',
    icon: '⭐',
    accent: ACCENTS.amber,
    description: 'Emails you’ve starred',
    filter: (e) => e.labelIds.includes('STARRED'),
  },
  {
    id: 'view:drafts',
    label: 'Drafts',
    icon: '📝',
    accent: ACCENTS.slate,
    description: 'Unsent drafts you’ve started',
    filter: (e) => e.labelIds.includes('DRAFT'),
  },
  {
    id: 'view:recent',
    label: 'Last 24 hours',
    icon: '🕒',
    accent: ACCENTS.violet,
    description: 'Arrived in the past 24 hours',
    filter: (e) => e.date >= Date.now() - DAY_MS,
  },
]

/** Look up a smart view by id (ids are prefixed `view:` so they can't hit a folder). */
export function getSmartView(id: string): SmartView | undefined {
  return SMART_VIEWS.find((v) => v.id === id)
}
