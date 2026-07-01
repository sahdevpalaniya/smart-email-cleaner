import { useApp } from '../store/AppContext'
import { CATEGORIES } from '../lib/categories'
import { AlertIcon, MailIcon, SparkleIcon } from './icons'
import { AdSlot } from './AdSlot'

export function Login() {
  const { configured, signIn, error } = useApp()

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 dark:bg-slate-950">
      {/* Ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_-10%,theme(colors.brand.200/0.5),transparent),radial-gradient(40rem_30rem_at_90%_110%,theme(colors.violet.200/0.35),transparent)] dark:bg-[radial-gradient(60rem_40rem_at_50%_-10%,theme(colors.brand.500/0.18),transparent),radial-gradient(40rem_30rem_at_90%_110%,theme(colors.violet.500/0.12),transparent)]" />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30 sm:h-16 sm:w-16">
            <MailIcon width={32} height={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Smart Email Cleaner</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Auto-sorts <span className="font-medium text-slate-700 dark:text-slate-200">your</span> inbox into folders —
            then clear the clutter in one click.
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 p-5 shadow-card ring-1 ring-slate-200/70 backdrop-blur-sm dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
          <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3">
            {CATEGORIES.filter((c) => c.id !== 'other' && c.id !== 'spam').slice(0, 6).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ring-1 ring-inset ${c.accent}`}>{c.icon}</span>
                <span className="truncate text-slate-600 dark:text-slate-300">{c.label}</span>
              </div>
            ))}
          </div>

          {!configured ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="mb-1 flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                <AlertIcon width={18} height={18} /> Setup needed
              </div>
              <p className="text-amber-700/90 dark:text-amber-300/90">
                Add your Google OAuth Client ID to a <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env</code> file
                (<code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">VITE_GOOGLE_CLIENT_ID</code>), then restart the dev server.
                See <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env.example</code> for step-by-step instructions.
              </p>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <GoogleLogo />
              Continue with Google
            </button>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <p className="mt-6 flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            <SparkleIcon width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              We only request Gmail <strong>modify</strong> access. Deletes move mail to Trash — nothing is permanently erased.
            </span>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          Your emails never leave your browser. No backend · email content is never stored.
        </p>

        {/* Ad — shown on the public, logged-out page (AdSense-compliant surface) */}
        <AdSlot slot="1234567890" className="mt-6" />
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}
