import { useApp } from '../store/AppContext'
import { useTheme } from '../hooks/useTheme'
import { initials, avatarColor } from '../lib/format'
import { LogoutIcon, MailIcon, MenuIcon, MoonIcon, RefreshIcon, SunIcon } from './icons'

interface Props {
  onToggleSidebar: () => void
}

export function Header({ onToggleSidebar }: Props) {
  const { profile, signOut, refresh, loading, backgroundLoading } = useApp()
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 sm:px-4">
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Toggle menu"
      >
        <MenuIcon />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
          <MailIcon width={18} height={18} />
        </div>
        <span className="hidden text-lg font-bold tracking-tight sm:block">Smart Email Cleaner</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={refresh}
          disabled={loading || backgroundLoading}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Refresh inbox"
          title="Refresh inbox"
        >
          <RefreshIcon className={loading || backgroundLoading ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={toggle}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Toggle theme"
          title="Toggle light / dark"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {profile && (
          <div className="ml-1 flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-1 dark:bg-slate-800">
            {profile.picture ? (
              <img src={profile.picture} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(profile.email)}`}>
                {initials(profile.name)}
              </div>
            )}
            <span className="hidden max-w-[160px] truncate text-sm font-medium md:block">{profile.email}</span>
            <button
              onClick={signOut}
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutIcon width={18} height={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
