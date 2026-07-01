import type { Category, CategoryId, Email } from '../types'

/**
 * Professional accent palette. Each value is a literal Tailwind class string so
 * the compiler keeps it during purge. Shared by categories, brand folders, and
 * auto-derived sender folders.
 */
export const ACCENTS = {
  emerald: 'text-emerald-600 bg-emerald-50 ring-emerald-600/10 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  teal: 'text-teal-600 bg-teal-50 ring-teal-600/10 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20',
  cyan: 'text-cyan-600 bg-cyan-50 ring-cyan-600/10 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/20',
  sky: 'text-sky-600 bg-sky-50 ring-sky-600/10 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
  blue: 'text-blue-600 bg-blue-50 ring-blue-600/10 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20',
  indigo: 'text-indigo-600 bg-indigo-50 ring-indigo-600/10 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20',
  violet: 'text-violet-600 bg-violet-50 ring-violet-600/10 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20',
  fuchsia: 'text-fuchsia-600 bg-fuchsia-50 ring-fuchsia-600/10 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-400/20',
  pink: 'text-pink-600 bg-pink-50 ring-pink-600/10 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-400/20',
  rose: 'text-rose-600 bg-rose-50 ring-rose-600/10 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20',
  red: 'text-red-600 bg-red-50 ring-red-600/10 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20',
  orange: 'text-orange-600 bg-orange-50 ring-orange-600/10 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/20',
  amber: 'text-amber-600 bg-amber-50 ring-amber-600/10 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
  lime: 'text-lime-600 bg-lime-50 ring-lime-600/10 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-400/20',
  slate: 'text-slate-600 bg-slate-100 ring-slate-600/10 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-400/20',
} as const

/** Rotation used to colour auto-discovered sender folders deterministically. */
export const ACCENT_ROTATION = [
  ACCENTS.indigo, ACCENTS.violet, ACCENTS.sky, ACCENTS.emerald, ACCENTS.amber,
  ACCENTS.rose, ACCENTS.teal, ACCENTS.fuchsia, ACCENTS.orange, ACCENTS.cyan,
  ACCENTS.lime, ACCENTS.pink,
]

/**
 * UNIVERSAL categories — semantic buckets that apply to ANY inbox, independent
 * of which specific brands/services a person uses. Brand-specific folders
 * (LinkedIn, GitHub, …) are NOT categories here; they are auto-discovered per
 * user from their actual senders (see folders.ts).
 */
export const CATEGORIES: Category[] = [
  { id: 'personal', label: 'Personal', icon: '👤', accent: ACCENTS.emerald, description: 'Real people & conversations' },
  { id: 'finance', label: 'Finance', icon: '💳', accent: ACCENTS.teal, description: 'Banking, payments & invoices' },
  { id: 'travel', label: 'Travel', icon: '✈️', accent: ACCENTS.cyan, description: 'Trips, bookings & tickets' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', accent: ACCENTS.violet, description: 'Orders, shipping & receipts' },
  { id: 'social', label: 'Social', icon: '💬', accent: ACCENTS.sky, description: 'Social networks & communities' },
  { id: 'promotions', label: 'Promotions', icon: '🏷️', accent: ACCENTS.amber, description: 'Deals, offers & newsletters' },
  { id: 'updates', label: 'Updates', icon: '🔔', accent: ACCENTS.blue, description: 'Notifications & confirmations' },
  { id: 'otp', label: 'Security & OTP', icon: '🔐', accent: ACCENTS.rose, description: 'Login codes & security alerts' },
  { id: 'spam', label: 'Spam', icon: '🚫', accent: ACCENTS.red, description: 'Flagged as spam by Gmail' },
  { id: 'other', label: 'Other', icon: '📥', accent: ACCENTS.slate, description: 'Everything else' },
]

export const CATEGORY_MAP: Record<CategoryId, Category> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c
    return acc
  },
  {} as Record<CategoryId, Category>,
)

/** Common free webmail providers → mail from these is usually from a real person. */
export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'aol.com', 'zoho.com', 'gmx.com',
  'rediffmail.com', 'mail.com',
])

/** Local-parts that signal an automated/no-reply sender (never "personal"). */
const ROBOT_LOCALPARTS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'no_reply',
  'notification', 'notifications', 'notify', 'updates', 'update', 'info',
  'support', 'help', 'team', 'hello', 'hi', 'mailer', 'mail', 'bounce',
  'news', 'newsletter', 'alert', 'alerts', 'account', 'accounts', 'service',
  'auto', 'automated', 'system', 'admin', 'contact', 'feedback', 'care',
]

function domainMatches(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`))
}
function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}
function localPart(address: string): string {
  return address.includes('@') ? address.split('@')[0] : address
}

// ---- High-signal keyword/domain sets (brand-agnostic) -----------------------

const OTP_KEYWORDS = [
  'otp', 'one-time', 'one time password', 'verification code', 'verify your',
  'security code', 'login code', 'log in code', 'sign-in code', 'sign in code',
  'two-factor', 'two factor', '2fa', 'authentication code', 'confirm your email',
  'is your code', 'your code is', 'passcode', 'reset your password',
]

const FINANCE_DOMAINS = [
  'paypal.com', 'stripe.com', 'razorpay.com', 'paytm.com', 'phonepe.com',
  'gpay.com', 'wise.com', 'venmo.com', 'cash.app', 'squareup.com',
  'hdfcbank.net', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'kotak.com',
  'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'citi.com', 'americanexpress.com',
  'visa.com', 'mastercard.com', 'discover.com', 'capitalone.com',
]
const FINANCE_KEYWORDS = [
  'invoice', 'receipt', 'payment', 'transaction', 'statement', 'credited',
  'debited', 'balance', 'refund', 'paid', 'amount due', 'bill', 'salary',
  'payslip', 'tax', 'gst', 'emi', 'loan', 'credit card', 'debit card',
]

const TRAVEL_DOMAINS = [
  'booking.com', 'airbnb.com', 'expedia.com', 'makemytrip.com', 'goibibo.com',
  'irctc.co.in', 'cleartrip.com', 'yatra.com', 'ixigo.com', 'uber.com',
  'olacabs.com', 'lyft.com', 'redbus.in', 'trivago.com', 'agoda.com',
  'indigo.in', 'airindia.com', 'emirates.com', 'lufthansa.com', 'vistara.com',
]
const TRAVEL_KEYWORDS = [
  'itinerary', 'booking confirmed', 'reservation', 'pnr', 'boarding pass',
  'check-in', 'check in', 'flight', 'your trip', 'hotel', 'ticket', 'departure',
  'arrival', 'ride receipt', 'your ride',
]

const SHOPPING_DOMAINS = [
  'amazon.com', 'amazon.in', 'flipkart.com', 'myntra.com', 'ebay.com',
  'etsy.com', 'aliexpress.com', 'walmart.com', 'meesho.com', 'ajio.com',
  'nykaa.com', 'snapdeal.com', 'target.com', 'bestbuy.com', 'shopify.com',
]
const SHOPPING_KEYWORDS = [
  'your order', 'order #', 'order confirmation', 'order placed', 'has shipped',
  'shipped', 'out for delivery', 'delivered', 'tracking', 'your package',
  'arriving', 'cart', 'wishlist', 'return', 'order summary',
]

const SOCIAL_DOMAINS = [
  'facebookmail.com', 'facebook.com', 'instagram.com', 'mail.instagram.com',
  'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'reddit.com',
  'redditmail.com', 'quora.com', 'pinterest.com', 'tiktok.com', 'snapchat.com',
  'discord.com', 'meetup.com', 'medium.com', 'threads.net',
]

const PROMO_KEYWORDS = [
  'sale', 'discount', '% off', 'deal', 'offer', 'coupon', 'newsletter',
  'unsubscribe', 'limited time', 'save big', 'flash sale', 'promo',
  'exclusive', 'free shipping', 'last chance', 'new arrivals', 'shop now',
  'subscribe', 'webinar',
]

const UPDATE_KEYWORDS = [
  'confirmation', 'confirmed', 'notification', 'reminder', 'update',
  'your account', 'security alert', 'new sign-in', 'welcome', 'verify',
  'password', 'request', 'status', 'scheduled',
]

/**
 * Assign one universal category to an email.
 *
 * Priority is by importance/time-sensitivity, with high-confidence provider
 * signals (Gmail labels, bulk headers) used as tie-breakers:
 *   1. Spam (Gmail SPAM)
 *   2. OTP / security codes  (most time-sensitive)
 *   3. Finance               (money — high importance)
 *   4. Travel                (time-sensitive, dated)
 *   5. Shopping (orders)
 *   6. Social
 *   7. Personal              (real person, before bulk/marketing buckets)
 *   8. Promotions            (marketing / bulk newsletters)
 *   9. Updates               (transactional notifications)
 *  10. Other
 */
export function categorize(args: {
  domain: string
  address: string
  subject: string
  snippet: string
  labelIds: string[]
  bulk: boolean
}): CategoryId {
  const { domain, address, subject, snippet, labelIds, bulk } = args
  const text = `${subject} ${snippet}`.toLowerCase()
  const local = localPart(address).toLowerCase()

  if (labelIds.includes('SPAM')) return 'spam'

  // OTP — only when NOT a bulk/marketing message (avoids "verify to get 20% off").
  if (!bulk && includesAny(text, OTP_KEYWORDS)) return 'otp'

  if (domainMatches(domain, FINANCE_DOMAINS) || includesAny(text, FINANCE_KEYWORDS)) return 'finance'
  if (domainMatches(domain, TRAVEL_DOMAINS) || includesAny(text, TRAVEL_KEYWORDS)) return 'travel'
  if (domainMatches(domain, SHOPPING_DOMAINS) || includesAny(text, SHOPPING_KEYWORDS)) return 'shopping'

  if (labelIds.includes('CATEGORY_SOCIAL') || domainMatches(domain, SOCIAL_DOMAINS)) return 'social'

  // Personal: a real human from free webmail, not an automated address, not bulk.
  const robot = ROBOT_LOCALPARTS.some((r) => local === r || local.startsWith(`${r}.`) || local.startsWith(`${r}-`) || local.startsWith(`${r}_`))
  if (!bulk && FREE_MAIL.has(domain) && !robot) return 'personal'

  // Promotions: Gmail's own label, explicit bulk/list headers, or marketing words.
  if (labelIds.includes('CATEGORY_PROMOTIONS') || (bulk && includesAny(text, PROMO_KEYWORDS)) || includesAny(text, PROMO_KEYWORDS)) {
    return 'promotions'
  }

  if (labelIds.includes('CATEGORY_UPDATES') || includesAny(text, UPDATE_KEYWORDS)) return 'updates'

  // A bulk message we couldn't otherwise place is almost certainly promotional.
  if (bulk) return 'promotions'

  return 'other'
}

/** Build a {categoryId: count} map from a list of emails. */
export function countByCategory(emails: Email[]): Record<CategoryId, number> {
  const counts = CATEGORIES.reduce(
    (acc, c) => {
      acc[c.id] = 0
      return acc
    },
    {} as Record<CategoryId, number>,
  )
  for (const e of emails) counts[e.category]++
  return counts
}
