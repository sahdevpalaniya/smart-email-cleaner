# Smart Email Cleaner

A modern, frontend-only React app that connects to your **Gmail** account, automatically
sorts your inbox into folders (LinkedIn, Naukri, GitHub, Shopping, Promotions, OTP,
Social, Updates, Spam…) and lets you **bulk-clean** clutter with one click.

No backend. No database. Your emails never leave your browser — the app talks to the
Gmail REST API directly using a short-lived OAuth token (kept in `sessionStorage`, wiped on
tab close). You stay signed in across refreshes via silent, no-popup re-auth; no access
token is ever written to durable disk storage.

![stack](https://img.shields.io/badge/React-18-149eca) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6)

---

## Features

- 🗂️ **Auto-categorization** — emails grouped by sender domain, keywords, and Gmail's
  own category labels (LinkedIn, Naukri, GitHub, Shopping, Social, Promotions, OTP,
  Updates, Spam, Other).
- ➕ **Dynamic folders** — create your own folders from a **dropdown** (pick a suggested
  category, or a **custom** folder matched by sender domain / keyword) and delete folders
  you don't want. Folders live under one collapsible **Folders** menu in the sidebar and
  persist across sessions. Every email always resolves to exactly **one** folder, so the
  folder counts always add up to the inbox total — no mismatch.
- 📊 **Folder dashboard** — every folder with a live email count and summary stats.
- 🗑️ **Bulk delete** — clear an entire folder, or just the selected emails, in one click.
  Deletes move mail to **Gmail Trash** (reversible for ~30 days) — nothing is wiped permanently.
- 🔍 **Search, filter & sort** — search text, filter by sender, sort by date/sender/subject.
- 🔐 **Secure Google OAuth** — Google Identity Services token flow + Gmail API.
- 🌗 **Dark / light mode**, fully **responsive**, mobile-friendly, fast.

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Create a Google OAuth Client ID

The app needs your own OAuth client to talk to Gmail (takes ~5 minutes):

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library →** enable **Gmail API**.
3. **APIs & Services → OAuth consent screen:**
   - User type: **External**
   - Under **Test users**, add your own Google account (required while the app is in *Testing*).
   - Add the scope `https://www.googleapis.com/auth/gmail.modify`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `http://localhost:5173`
     (add your production URL too when you deploy).
5. Copy the **Client ID**.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and paste your client id:

```
VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

### 4. Run

```bash
npm run dev
```

Open <http://localhost:5173>, click **Continue with Google**, and grant access.

---

## Deploying to Vercel

The app is a static Vite build, so Vercel auto-detects it (build `vite build`,
output `dist/`) — no extra build config needed. Two manual steps are required, plus
one Vercel-specific gotcha:

1. **Set the env var in Vercel.** Add `VITE_GOOGLE_CLIENT_ID` under
   **Project → Settings → Environment Variables**. Vite inlines `VITE_*` at **build**
   time, so set it *before* deploying (and redeploy after any change). Your local
   `.env` is gitignored, so Vercel has no client id unless you add it here.
2. **Authorize the Vercel origin in Google.** In **Google Cloud Console → Credentials
   → your OAuth client → Authorized JavaScript origins**, add
   `https://<your-app>.vercel.app` — exact, `https://`, **no trailing slash, no path**.
   Without it Google rejects the origin and sign-in fails.

> **Preview deployments won't sign in.** Every push gets a unique preview URL
> (`<app>-<hash>.vercel.app`), and Google OAuth origins **don't support wildcards**.
> OAuth only works on origins you've explicitly listed — in practice your stable
> **Production** domain (or a custom domain added to *both* Vercel and Google). Test
> sign-in on the Production URL, not on per-push previews.

**Security headers:** Vercel does **not** read `public/_headers` (a Netlify/Cloudflare
convention), so the CSP/HSTS/etc. are declared in [`vercel.json`](vercel.json) instead.
Keep the two in sync if you change the policy.

As always, while the OAuth consent screen is unverified / in *Testing*, only
**Test users** can sign in even on the public URL (see the next section).

---

## Who can sign in / going to production

Deploying publicly (e.g. to Vercel) makes the app *reachable* by anyone, but **who
can actually sign in is gated by your Google OAuth consent-screen status**, not by
hosting. There are three states:

1. **Testing (default).** Only Google accounts you add under **OAuth consent screen →
   Test users** (max 100) can sign in. Everyone else is rejected with
   `access_denied`, even on a public URL.
2. **Published but unverified.** Users hit the *"Google hasn't verified this app"*
   warning screen, and Google caps/limits unverified apps that use sensitive scopes —
   not suitable for real public use.
3. **Published & verified.** Any Google user worldwide can sign in cleanly.

> **Reaching state 3 with this app requires Google's strictest review.**
> `https://www.googleapis.com/auth/gmail.modify` is a **restricted** scope, so general
> public use requires OAuth **brand verification** *and* **restricted-scope
> verification** — which includes an annual independent **security assessment (CASA)**
> by a Google-approved assessor (real cost + lead time). There's no lighter scope that
> still allows moving mail to Trash (the app's core feature needs `modify`), so this
> can't be sidestepped while keeping bulk-clean.

**In short:** to share it with a few people now, add them as **Test users**. To open
it to the world, budget for the restricted-scope verification process.

---

## How categorization works (universal — works for *any* inbox)

The engine is brand-agnostic: it sorts every inbox using **universal semantic
categories**, never a hardcoded list of services. Two people with completely different
senders both get a sensible inbox.

`src/lib/categories.ts` assigns each email exactly one category, in priority order:

1. **Spam** — trusts Gmail's `SPAM` label.
2. **Security & OTP** — "verification code", "one-time", "OTP" (only on non-bulk mail).
3. **Finance** — banks/payments domains + invoice/payment/statement keywords.
4. **Travel** — airlines/booking domains + itinerary/PNR/boarding keywords.
5. **Shopping** — store domains + order/shipped/delivered/tracking keywords.
6. **Social** — Gmail `CATEGORY_SOCIAL` + social-network domains.
7. **Personal** — a real human from free webmail (gmail/outlook/…), not a `noreply`
   address and not bulk mail.
8. **Promotions** — Gmail `CATEGORY_PROMOTIONS`, bulk-list headers
   (`List-Unsubscribe` / `List-Id` / `Precedence: bulk`), or marketing keywords.
9. **Updates** — `CATEGORY_UPDATES` + notification/confirmation keywords.
10. **Other** — the catch-all.

The **bulk signal** (RFC 2369 `List-Unsubscribe`/`List-Id`, `Precedence: bulk`) is fetched
as message metadata and is the strongest evidence of automated/marketing mail — it keeps
real people out of Promotions and stops "verify to get 20% off" landing in OTP.

### Folders adapt to each user (the important part)

Brand folders like LinkedIn / GitHub / Naukri are **not** hardcoded — they're
**auto-discovered from your actual inbox**. `folders.ts` tallies your busiest automated
sender domains (skipping personal free-webmail) and offers them as one-click **Suggested
folders**. A recruiter sees LinkedIn + Naukri; a developer sees GitHub; a shopper sees
Amazon — all derived from *their* mail. A small brand registry only adds a nice icon/label
when a domain is recognized; unknown senders still get a clean monogram + colour.

- **Categories** (`categories.ts`) = the universal engine that labels every email.
- **Folders** (`folders.ts`) = what you see in the sidebar. Defaults are the universal
  categories; you can add suggested sender folders, create **custom** folders (match by
  domain or keyword), and delete any folder. Custom/sender rules take priority over the
  category, and anything unmatched falls into the permanent **Other** catch-all — so
  resolution always picks exactly one folder and `sum(folder counts) === emails loaded`.
- Empty categories are hidden by default so the sidebar stays uncluttered.
- Folders are stored in `localStorage` (`sec-folders-v2`).

### Why the count now matches Gmail

The app loads `in:inbox` (not all mail), so the total lines up with the "1–50 of **N**"
count Gmail shows above your inbox. The **whole inbox is loaded automatically** — there's
no load-size limit to pick. Messages are hydrated through Gmail's **HTTP batch endpoint**
(up to 50 messages per request instead of one-at-a-time), which is roughly an order of
magnitude faster. A safety ceiling of 8,000 emails protects very large mailboxes from
exhausting browser memory; if you're above it the dashboard says so.

---

## Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start the Vite dev server (port 5173)    |
| `npm run build`   | Typecheck + production build to `dist/`  |
| `npm run preview` | Preview the production build locally     |
| `npm run lint`    | TypeScript type-check only               |

---

## Security & privacy

- **Minimal scope:** only `gmail.modify` (read + move-to-trash). The app never requests
  the full-access `https://mail.google.com/` scope, so it physically *cannot* permanently
  delete or send mail.
- **Token never persisted to disk:** the short-lived OAuth access token lives in
  `sessionStorage` only — it survives a page refresh but is **wiped when the tab/browser
  closes**, so it never lingers on disk. Only your non-sensitive display profile is kept in
  `localStorage`, purely so a returning user can be **re-authenticated silently**
  (`prompt: 'none'`, no popup) without a fresh token ever being written to durable storage.
  Everything is revoked + cleared on sign-out, and the token auto-expires (~1h) and renews
  silently.
- **No XSS sinks:** all email content is rendered as React-escaped text (no
  `dangerouslySetInnerHTML`); HTML entities in snippets are decoded with a pure-JS decoder,
  not `innerHTML`.
- **Resilient networking:** every Gmail request retries 429/5xx with exponential backoff +
  jitter (honoring `Retry-After`), so rate limits and blips don't corrupt the UI. Deletes
  apply optimistically and **roll back** if the API call fails.
- **Hardened hosting:** [`public/_headers`](public/_headers) ships a strict
  **Content-Security-Policy** (locked to the Google/Gmail origins the app actually uses)
  plus HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, and a
  restrictive `Permissions-Policy`. (Set the same headers at your CDN/server if it doesn't
  read `_headers`.)
- **Crash isolation:** a React error boundary keeps any unexpected UI error from
  white-screening the app or leaking a stack trace to the user.
- **No server:** there is no backend and no database. Email content is held only in the
  browser tab's memory for the session.

---

## Project structure

```
src/
  lib/
    auth.ts         Google Identity Services OAuth token flow
    gmail.ts        Gmail REST client (list, fetch metadata, trash)
    categories.ts   Category definitions + categorization engine
    format.ts       Date / avatar helpers
  store/
    AppContext.tsx  Global state: auth, emails, counts, actions
  hooks/
    useTheme.ts     Dark/light mode (persisted)
  components/       Login, Header, Sidebar, Dashboard, FolderView,
                    EmailRow, ConfirmModal, LoadingOverlay, icons
  App.tsx           Layout + routing between dashboard and folders
```

---

## Roadmap (optional advanced features)

These hooks are scaffolded for but not yet implemented — good next steps:

- AI-based smart categorization (e.g. classify ambiguous "Other" mail).
- One-click unsubscribe (parse `List-Unsubscribe` headers).
- Auto-clean suggestions & scheduled cleanup.
- Analytics dashboard (volume over time, top senders).

---

## Notes & limits

- Only **Test users** can sign in until the app is published & verified — see
  [Who can sign in / going to production](#who-can-sign-in--going-to-production).
- The Gmail list endpoint returns message ids; the app then hydrates metadata for each
  (From / Subject / Date / labels / snippet) with bounded concurrency. Loading 1000
  emails makes ~1000 metadata calls, so very large pulls take a little longer.
