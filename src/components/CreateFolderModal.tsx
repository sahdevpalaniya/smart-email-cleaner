import { useEffect, useMemo, useState } from 'react'
import { useApp, type NewFolderInput } from '../store/AppContext'
import { ACCENT_PRESETS, FOLDER_TEMPLATES, ICON_SUGGESTIONS } from '../lib/folders'
import { CloseIcon, FolderIcon } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (folderId: string) => void
}

const CUSTOM = '__custom__'

export function CreateFolderModal({ open, onClose, onCreated }: Props) {
  const { folders, suggestions, createFolder, addFolder } = useApp()

  // Templates not already added become dropdown options.
  const available = useMemo(
    () => FOLDER_TEMPLATES.filter((t) => !folders.some((f) => f.id === t.id)),
    [folders],
  )

  const [choice, setChoice] = useState<string>(CUSTOM)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📁')
  const [accent, setAccent] = useState(ACCENT_PRESETS[2].accent)
  const [domains, setDomains] = useState('')
  const [keywords, setKeywords] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Reset the form each time the modal opens; default to first available template.
  useEffect(() => {
    if (!open) return
    // Default to the most relevant option: a discovered sender, else a category.
    setChoice(suggestions[0]?.folder.id ?? available[0]?.id ?? CUSTOM)
    setName('')
    setIcon('📁')
    setAccent(ACCENT_PRESETS[2].accent)
    setDomains('')
    setKeywords('')
    setErr(null)
  }, [open, available, suggestions])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isCustom = choice === CUSTOM
  const template = available.find((t) => t.id === choice)
  const suggestion = suggestions.find((s) => s.folder.id === choice)

  function submit() {
    setErr(null)
    // Accepted an auto-discovered sender folder — add it as-is.
    if (suggestion) {
      addFolder(suggestion.folder)
      onCreated?.(suggestion.folder.id)
      onClose()
      return
    }
    let input: NewFolderInput
    if (isCustom) {
      const label = name.trim()
      const domainList = domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
      const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean)
      if (!label) return setErr('Give your folder a name.')
      // Domain/keyword are optional now — a name is enough to add a folder
      // directly. With neither rule given we match the folder name as a keyword,
      // so the folder still collects related mail out of the box.
      const domainsFinal = domainList
      const keywordsFinal = domainList.length === 0 && keywordList.length === 0 ? [label] : keywordList
      const matched = [...domainsFinal, ...keywordsFinal].slice(0, 3).join(', ')
      input = {
        label,
        icon: icon || '📁',
        accent,
        description: matched ? `Matches ${matched}` : label,
        rule: { domains: domainsFinal, keywords: keywordsFinal },
      }
    } else if (template) {
      input = {
        label: template.label,
        icon: template.icon,
        accent: template.accent,
        description: template.description,
        templateId: template.id,
      }
    } else {
      return setErr('Pick a folder type.')
    }
    const folder = createFolder(input)
    onCreated?.(folder.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-folder-title">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            <FolderIcon />
          </div>
          <h2 id="create-folder-title" className="text-lg font-semibold">Create folder</h2>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        {/* Folder-type dropdown */}
        <label className="mb-1.5 block text-sm font-medium">Folder type</label>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800"
        >
          {suggestions.length > 0 && (
            <optgroup label="From your inbox (top senders)">
              {suggestions.map((s) => (
                <option key={s.folder.id} value={s.folder.id}>
                  {s.folder.icon}  {s.folder.label} · {s.count}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Smart categories">
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon}  {t.label}
              </option>
            ))}
            {available.length === 0 && <option disabled>All categories already added</option>}
          </optgroup>
          <optgroup label="Custom">
            <option value={CUSTOM}>✏️  Custom folder…</option>
          </optgroup>
        </select>

        {(template || suggestion) && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl ring-1 ring-inset ${(template ?? suggestion!.folder).accent}`}>
              {(template ?? suggestion!.folder).icon}
            </span>
            <div className="min-w-0">
              <div className="font-semibold">{(template ?? suggestion!.folder).label}</div>
              <div className="truncate text-sm text-slate-500 dark:text-slate-400">{(template ?? suggestion!.folder).description}</div>
            </div>
            {suggestion && <span className="ml-auto text-sm font-semibold tabular-nums text-slate-400">{suggestion.count}</span>}
          </div>
        )}

        {isCustom && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Folder name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Medium, Banking, Travel"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setIcon(e)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition ${
                      icon === e ? 'bg-brand-600 ring-2 ring-brand-500' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.accent}
                    onClick={() => setAccent(p.accent)}
                    title={p.name}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${p.accent} ${
                      accent === p.accent ? 'ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : ''
                    }`}
                  >
                    <span className="text-xs font-bold">A</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Match sender domains <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="medium.com, substack.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800"
              />
              <p className="mt-1 text-xs text-slate-400">Comma-separated. Sub-domains match automatically. Leave blank to match by name.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">…or match keywords <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="invoice, statement, payslip"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800"
              />
              <p className="mt-1 text-xs text-slate-400">Matched in subject, preview & sender.</p>
            </div>
          </div>
        )}

        {err && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!isCustom && !template && !suggestion}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          >
            Create folder
          </button>
        </div>
      </div>
    </div>
  )
}
