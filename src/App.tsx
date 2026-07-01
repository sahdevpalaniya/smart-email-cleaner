import { useState } from 'react'
import { useApp } from './store/AppContext'
import { AdminUserList } from './components/AdminUserList'
import { Login } from './components/Login'
import { Header } from './components/Header'
import { Sidebar, type View } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { FolderView } from './components/FolderView'
import { Cleanup } from './components/Cleanup'
import { LoadingOverlay } from './components/LoadingOverlay'
import { AlertIcon, CloseIcon, SparkleIcon } from './components/icons'

/** True when the URL points at the admin user-list route, in any common form. */
function isUserListRoute(): boolean {
  if (typeof window === 'undefined') return false
  const { pathname, hash, search } = window.location
  return (
    pathname.replace(/\/+$/, '').endsWith('/user-list') ||
    hash.replace(/^#\/?/, '') === 'user-list' ||
    new URLSearchParams(search).has('user-list')
  )
}

export default function App() {
  const { profile, restoring, loading, progress, error, emails, backgroundLoading, undo, undoDelete } = useApp()
  const [view, setView] = useState<View>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  // Standalone admin route: visiting /user-list (or #user-list / ?user-list)
  // shows the password-gated user list, independent of Gmail sign-in.
  if (isUserListRoute()) return <AdminUserList />

  // Restoring a remembered session — show a splash instead of flashing the login screen.
  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingOverlay progress={null} />
      </div>
    )
  }

  // Not signed in -> login screen.
  if (!profile) return <Login />

  const showError = error && error !== dismissedError
  // Full-screen loader only until the very first emails are on screen; after that
  // the rest stream in behind a non-blocking banner.
  const showFullLoader = loading && emails.length === 0
  const loadPct =
    progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  return (
    <div className="min-h-screen">
      <Header onToggleSidebar={() => setSidebarOpen((o) => !o)} />

      <div className="flex">
        <Sidebar
          view={view}
          onSelect={setView}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="scrollbar-thin h-[calc(100vh-4rem)] flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {showError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <AlertIcon width={18} height={18} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setDismissedError(error)} aria-label="Dismiss">
                <CloseIcon width={16} height={16} />
              </button>
            </div>
          )}

          {backgroundLoading && (
            <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
              <div className="flex items-center gap-3">
                <SparkleIcon width={18} height={18} className="shrink-0 animate-pulse" />
                <span className="flex-1">
                  Loading the rest of your inbox in the background, paced to keep
                  things light on your account
                  {progress && progress.total > 0
                    ? ` — ${progress.loaded} of ${progress.total} so far`
                    : '…'}
                  . Folders update live as emails arrive.
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-200/70 dark:bg-brand-500/20">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-300 dark:bg-brand-400"
                  style={{ width: `${Math.max(loadPct, 5)}%` }}
                />
              </div>
            </div>
          )}

          {showFullLoader ? (
            <LoadingOverlay progress={progress} />
          ) : view === 'dashboard' ? (
            <Dashboard onOpen={(id) => setView(id)} />
          ) : view === 'cleanup' ? (
            <Cleanup />
          ) : (
            <FolderView folderId={view} onBack={() => setView('dashboard')} />
          )}
        </main>
      </div>

      {/* Global Undo toast — covers deletes from both the folder list and the
          reader. Auto-dismisses (the AppContext timer clears `undo` after ~8s). */}
      {undo && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-slate-900">
          <span>
            Moved {undo.count} email{undo.count === 1 ? '' : 's'} to Trash.
          </span>
          <button
            onClick={() => void undoDelete()}
            className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/25 dark:bg-slate-900/10 dark:text-slate-900 dark:hover:bg-slate-900/20"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
