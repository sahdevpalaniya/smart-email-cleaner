export type CategoryId =
  | 'personal'
  | 'finance'
  | 'travel'
  | 'shopping'
  | 'social'
  | 'promotions'
  | 'updates'
  | 'otp'
  | 'spam'
  | 'other'

export interface Category {
  id: CategoryId
  label: string
  /** Tailwind text/background accent classes for the icon chip. */
  accent: string
  /** Single emoji used as a lightweight icon (keeps the bundle dependency-free). */
  icon: string
  description: string
}

/** Matching rule for a folder. */
export interface FolderRule {
  /** Sender domains to match, e.g. ["medium.com"]. Sub-domains match too. */
  domains?: string[]
  /** Keywords matched against subject, snippet and sender name. */
  keywords?: string[]
  /** Gmail labelIds to match, e.g. ["STARRED"]. Highest-priority match. */
  labels?: string[]
}

/**
 * A folder shown in the sidebar. Built-in folders mirror the categorization
 * templates; custom folders are created by the user and matched via `rule`.
 * Every email resolves to exactly one folder, so folder counts always sum to
 * the total number of loaded emails.
 */
export interface Folder {
  id: string
  label: string
  icon: string
  accent: string
  description: string
  /** True for the predefined category folders, false for user-created ones. */
  builtin: boolean
  /** For built-in folders: which categorization template this maps to. */
  templateId?: CategoryId
  /** For custom folders: how to match emails into this folder. */
  rule?: FolderRule
}

export interface Email {
  id: string
  threadId: string
  /** Display name of the sender, falls back to the address. */
  fromName: string
  /** Raw email address of the sender. */
  fromAddress: string
  /** Lower-cased sender domain, e.g. "linkedin.com". */
  domain: string
  subject: string
  snippet: string
  /** Recipient display (the `To` header) — used to render drafts, which are from you. */
  to: string
  /** Epoch milliseconds. */
  date: number
  /** Gmail system + user labels (e.g. CATEGORY_PROMOTIONS, SPAM, UNREAD). */
  labelIds: string[]
  unread: boolean
  /** True when the message carries bulk/list headers (List-Unsubscribe, etc.). */
  bulk: boolean
  /** Parsed unsubscribe options, if the sender provided any. */
  unsubscribe?: import('./lib/unsubscribe').UnsubInfo
  /** Built-in category, decided by the categorization engine. */
  category: CategoryId
}

export interface GoogleProfile {
  email: string
  name: string
  picture?: string
}

export type SortKey = 'date-desc' | 'date-asc' | 'sender-asc' | 'subject-asc'

export interface LoadProgress {
  loaded: number
  total: number
}
