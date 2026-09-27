import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { AppInfo } from '../../../shared/types'
import { AppIcon } from './ui'

/** Multi-select list of known applications with a search box. */
export function AppPicker({
  apps,
  selected,
  onChange,
  exclude = [],
  emptyHint = 'No applications match.'
}: {
  apps: AppInfo[]
  selected: number[]
  onChange: (ids: number[]) => void
  exclude?: number[]
  emptyHint?: string
}): JSX.Element {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return apps
      .filter((a) => !a.hidden && a.mergedInto === null)
      .filter((a) => !exclude.includes(a.id))
      .filter((a) => !needle || a.displayName.toLowerCase().includes(needle) || a.exeName.toLowerCase().includes(needle))
  }, [apps, q, exclude])

  const toggle = (id: number): void => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search size={14} className="text-muted" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search applications"
          className="!bg-transparent !border-0 !p-0 flex-1 text-[13px]"
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {list.length === 0 && <div className="px-3 py-4 text-[12.5px] text-muted">{emptyHint}</div>}
        {list.map((a) => {
          const on = selected.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-card-2 ${on ? 'bg-card-2' : ''}`}
            >
              <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={20} />
              <span className="flex-1 truncate text-[13px]">{a.displayName}</span>
              <span
                className={`w-4 h-4 rounded grid place-items-center border ${on ? 'bg-accent border-accent' : 'border-border-2'}`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
