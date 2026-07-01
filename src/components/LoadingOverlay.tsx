import type { LoadProgress } from '../types'
import { MailIcon } from './icons'

export function LoadingOverlay({ progress }: { progress: LoadProgress | null }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white">
        <MailIcon width={30} height={30} />
        <span className="absolute -inset-1 animate-ping rounded-2xl border-2 border-brand-400/50" />
      </div>
      <h2 className="text-lg font-semibold">Sorting your inbox…</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {progress && progress.total > 0
          ? `Categorizing ${progress.loaded} of ${progress.total} emails`
          : 'Fetching the latest messages from Gmail'}
      </p>
      <div className="mt-5 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${progress && progress.total > 0 ? pct : 15}%` }}
        />
      </div>
    </div>
  )
}
