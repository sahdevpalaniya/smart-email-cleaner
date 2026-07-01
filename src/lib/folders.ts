import type { Email, Folder, FolderRule } from '../types'
import { ACCENTS, ACCENT_ROTATION, CATEGORIES, CATEGORY_MAP, FREE_MAIL } from './categories'
import { persist, restore } from './storage'

const STORAGE_KEY = 'sec-folders-v2'

/** The non-deletable catch-all folder. Guarantees every email has a home. */
export const CATCH_ALL_ID = 'other'

/** Special label-based folder for Gmail-starred mail. */
export const STARRED_ID = 'starred'

export function starredFolder(): Folder {
  return {
    id: STARRED_ID,
    label: 'Starred',
    icon: '⭐',
    accent: ACCENTS.amber,
    description: 'Starred & important emails',
    builtin: true,
    rule: { labels: ['STARRED'] },
  }
}

/** Special label-based folder for unsent Gmail drafts. */
export const DRAFTS_ID = 'drafts'

export function draftsFolder(): Folder {
  return {
    id: DRAFTS_ID,
    label: 'Drafts',
    icon: '📝',
    accent: ACCENTS.slate,
    description: 'Unsent drafts you’ve started',
    builtin: true,
    rule: { labels: ['DRAFT'] },
  }
}

/** Emoji suggestions for the custom-folder icon picker. */
export const ICON_SUGGESTIONS = ['📁', '⭐', '🔖', '📨', '💡', '🎯', '🧾', '📰', '✈️', '🏦', '🎮', '🍔', '❤️', '🔔', '📦']

/** Accent presets offered in the custom-folder colour picker. */
export const ACCENT_PRESETS = Object.entries(ACCENTS).map(([name, accent]) => ({ name, accent }))

/** Category templates, used as the dropdown options when creating a folder. */
export const FOLDER_TEMPLATES = CATEGORIES

/**
 * Brand registry — nice label + icon + colour for well-known senders. This is
 * ONLY used to prettify auto-discovered sender folders; it never decides a
 * category, so an inbox full of unknown brands still works perfectly.
 */
const BRANDS: { domains: string[]; label: string; icon: string; accent: string }[] = [
  { domains: ['linkedin.com'], label: 'LinkedIn', icon: '💼', accent: ACCENTS.blue },
  { domains: ['github.com', 'githubusercontent.com'], label: 'GitHub', icon: '🐙', accent: ACCENTS.slate },
  { domains: ['naukri.com', 'naukrimail.com', 'infoedge.com'], label: 'Naukri', icon: '🧑‍💻', accent: ACCENTS.indigo },
  { domains: ['indeed.com'], label: 'Indeed', icon: '🧑‍💼', accent: ACCENTS.blue },
  { domains: ['glassdoor.com'], label: 'Glassdoor', icon: '🏢', accent: ACCENTS.emerald },
  { domains: ['amazon.com', 'amazon.in'], label: 'Amazon', icon: '📦', accent: ACCENTS.orange },
  { domains: ['flipkart.com'], label: 'Flipkart', icon: '🛒', accent: ACCENTS.amber },
  { domains: ['myntra.com'], label: 'Myntra', icon: '👗', accent: ACCENTS.pink },
  { domains: ['google.com', 'accounts.google.com', 'mail.google.com'], label: 'Google', icon: '🔵', accent: ACCENTS.sky },
  { domains: ['youtube.com'], label: 'YouTube', icon: '▶️', accent: ACCENTS.red },
  { domains: ['facebookmail.com', 'facebook.com'], label: 'Facebook', icon: '📘', accent: ACCENTS.blue },
  { domains: ['instagram.com', 'mail.instagram.com'], label: 'Instagram', icon: '📸', accent: ACCENTS.fuchsia },
  { domains: ['twitter.com', 'x.com'], label: 'X', icon: '✖️', accent: ACCENTS.slate },
  { domains: ['reddit.com', 'redditmail.com'], label: 'Reddit', icon: '👽', accent: ACCENTS.orange },
  { domains: ['medium.com'], label: 'Medium', icon: '✍️', accent: ACCENTS.slate },
  { domains: ['substack.com'], label: 'Substack', icon: '📰', accent: ACCENTS.orange },
  { domains: ['netflix.com'], label: 'Netflix', icon: '🎬', accent: ACCENTS.red },
  { domains: ['spotify.com'], label: 'Spotify', icon: '🎵', accent: ACCENTS.emerald },
  { domains: ['slack.com'], label: 'Slack', icon: '💬', accent: ACCENTS.violet },
  { domains: ['notion.so'], label: 'Notion', icon: '📝', accent: ACCENTS.slate },
  { domains: ['figma.com'], label: 'Figma', icon: '🎨', accent: ACCENTS.fuchsia },
  { domains: ['atlassian.com', 'atlassian.net'], label: 'Atlassian', icon: '🧩', accent: ACCENTS.blue },
  { domains: ['stackoverflow.com', 'stackoverflowmail.com'], label: 'Stack Overflow', icon: '📚', accent: ACCENTS.orange },
  { domains: ['paypal.com'], label: 'PayPal', icon: '💰', accent: ACCENTS.blue },
  { domains: ['uber.com'], label: 'Uber', icon: '🚗', accent: ACCENTS.slate },
  { domains: ['swiggy.in', 'swiggy.com'], label: 'Swiggy', icon: '🍔', accent: ACCENTS.orange },
  { domains: ['zomato.com'], label: 'Zomato', icon: '🍽️', accent: ACCENTS.red },
  { domains: ['booking.com'], label: 'Booking.com', icon: '🏨', accent: ACCENTS.blue },
]

function brandFor(domain: string): { label: string; icon: string; accent: string } | null {
  for (const b of BRANDS) {
    if (b.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      return { label: b.label, icon: b.icon, accent: b.accent }
    }
  }
  return null
}

/** Very small public-suffix awareness so labels read nicely (e.g. naukri.co.in → Naukri). */
const MULTI_SUFFIX = new Set(['co.in', 'co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'org.in', 'net.in', 'gov.in', 'ac.in'])

/** Derive a human label from a domain, e.g. "mail.spotify.com" → "Spotify". */
export function labelForDomain(domain: string): string {
  const parts = domain.split('.')
  if (parts.length <= 1) return domain
  const lastTwo = parts.slice(-2).join('.')
  const name = MULTI_SUFFIX.has(lastTwo) ? parts[parts.length - 3] : parts[parts.length - 2]
  if (!name) return domain
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Build a custom folder that matches a single sender domain. */
export function senderFolder(domain: string): Folder {
  const brand = brandFor(domain)
  const label = brand?.label ?? labelForDomain(domain)
  return {
    id: `sender:${domain}`,
    label,
    icon: brand?.icon ?? label.charAt(0).toUpperCase(),
    accent: brand?.accent ?? ACCENT_ROTATION[hash(domain) % ACCENT_ROTATION.length],
    description: `Mail from ${domain}`,
    builtin: false,
    rule: { domains: [domain] },
  }
}

function fromTemplate(templateId: (typeof CATEGORIES)[number]['id']): Folder {
  const c = CATEGORY_MAP[templateId]
  return {
    id: c.id,
    label: c.label,
    icon: c.icon,
    accent: c.accent,
    description: c.description,
    builtin: true,
    templateId: c.id,
  }
}

/** The default folder set: Starred + Drafts + the universal categories (work for every inbox). */
export function defaultFolders(): Folder[] {
  return [starredFolder(), draftsFolder(), ...CATEGORIES.map((c) => fromTemplate(c.id))]
}

export function loadFolders(): Folder[] {
  try {
    const raw = restore(STORAGE_KEY)
    if (!raw) return defaultFolders()
    const parsed = JSON.parse(raw) as Folder[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultFolders()
    // Ensure the Starred + Drafts folders exist (pinned to the top) for existing users.
    if (!parsed.some((f) => f.id === DRAFTS_ID)) parsed.unshift(draftsFolder())
    if (!parsed.some((f) => f.id === STARRED_ID)) parsed.unshift(starredFolder())
    // The catch-all must always exist so no email is ever orphaned.
    if (!parsed.some((f) => f.id === CATCH_ALL_ID)) parsed.push(fromTemplate('other'))
    return parsed
  } catch {
    return defaultFolders()
  }
}

export function saveFolders(folders: Folder[]): void {
  // Persisted to cookie + localStorage so the layout survives across sessions.
  persist(STORAGE_KEY, JSON.stringify(folders))
}

function matchesLabels(email: Email, rule?: FolderRule): boolean {
  if (!rule?.labels?.length) return false
  return rule.labels.some((l) => email.labelIds.includes(l))
}

function matchesRule(email: Email, rule?: FolderRule): boolean {
  if (!rule) return false
  if (rule.domains?.length) {
    const d = email.domain
    if (rule.domains.some((dom) => d === dom || d.endsWith(`.${dom}`))) return true
  }
  if (rule.keywords?.length) {
    const hay = `${email.subject} ${email.snippet} ${email.fromName} ${email.fromAddress}`.toLowerCase()
    if (rule.keywords.some((k) => hay.includes(k.toLowerCase()))) return true
  }
  return false
}

/**
 * Resolve the single folder an email belongs to, given the active folders.
 * Priority:
 *   1. Label folders (e.g. Starred) — important mail is grouped no matter what.
 *   2. Custom sender/keyword folders (in user order).
 *   3. Matching built-in category.
 *   4. Catch-all.
 */
export function resolveFolderId(email: Email, folders: Folder[]): string {
  for (const f of folders) {
    if (matchesLabels(email, f.rule)) return f.id
  }
  for (const f of folders) {
    if (!f.builtin && matchesRule(email, f.rule)) return f.id
  }
  const builtin = folders.find((f) => f.builtin && f.templateId === email.category)
  if (builtin) return builtin.id
  const catchAll = folders.find((f) => f.id === CATCH_ALL_ID)
  return catchAll?.id ?? folders[folders.length - 1]?.id ?? CATCH_ALL_ID
}

/** Build the email→folder map and per-folder counts in a single pass. */
export function indexByFolder(
  emails: Email[],
  folders: Folder[],
): { map: Record<string, string>; counts: Record<string, number> } {
  const map: Record<string, string> = {}
  const counts: Record<string, number> = {}
  for (const f of folders) counts[f.id] = 0
  for (const e of emails) {
    const fid = resolveFolderId(e, folders)
    map[e.id] = fid
    counts[fid] = (counts[fid] ?? 0) + 1
  }
  return { map, counts }
}

/** True if some existing custom folder already matches this domain. */
function isDomainCovered(domain: string, folders: Folder[]): boolean {
  return folders.some(
    (f) => !f.builtin && f.rule?.domains?.some((d) => domain === d || domain.endsWith(`.${d}`)),
  )
}

export interface FolderSuggestion {
  folder: Folder
  count: number
}

/**
 * Auto-discover sender folders from the user's ACTUAL inbox: tally automated
 * senders by domain, skip personal/free webmail and already-added domains, and
 * surface the busiest ones. This is what makes the product universal — a
 * recruiter sees LinkedIn/Naukri, a developer sees GitHub, a shopper sees
 * Amazon, all derived from their own mail.
 */
export function suggestSenderFolders(emails: Email[], folders: Folder[], limit = 12): FolderSuggestion[] {
  const tally = new Map<string, number>()
  for (const e of emails) {
    const d = e.domain
    if (!d || FREE_MAIL.has(d)) continue // free webmail ≈ personal, not a brand folder
    if (isDomainCovered(d, folders)) continue
    tally.set(d, (tally.get(d) ?? 0) + 1)
  }
  return [...tally.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ folder: senderFolder(domain), count }))
}

/** Generate a stable id for a brand-new custom folder. */
export function newFolderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `f_${crypto.randomUUID()}`
  return `f_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}
