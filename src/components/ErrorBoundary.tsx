import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches render-time errors so a single bad component can't white-screen the
 * whole app. Shows a safe, generic message (no stack trace leaked to the UI)
 * and a reload action.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for developers; never surfaced to end-users.
    console.error('Unexpected UI error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950">
        <div className="text-4xl">😵</div>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          The app hit an unexpected error. Your emails are untouched. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Reload app
        </button>
      </div>
    )
  }
}
