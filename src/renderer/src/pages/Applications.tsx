import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react'
import type { AppDetail, AppInfo, Category, YearAppUsage, YearApps } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { deltaText, fmtDay, fmtDuration, today } from '@/lib/format'
import { assignSlots, colorForApp } from '@/lib/palette'
import { AppIcon, Card, Dot, Empty, Page, PageHeader, Select } from '@/components/ui'
import { CATEGORY_COLORS } from '@/lib/palette'
import { UsageBars } from '@/components/UsageBars'

/**
 * Every application seen this year with its total time, searchable and scrollable, plus a detail panel for the
 * selected one. Year totals run up to yesterday and are computed once a day, so today's use joins them after midnight.
 */
export function Applications(): JSX.Element {
  const day = today()
  const year = Number(day.slice(0, 4))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const yearApps = usePoll<YearApps>(() => window.api.yearApps(year), [year], 300_000, ['data:changed', 'apps:changed'])
  const all = usePoll<AppInfo[]>(() => window.api.listApps(), [], 60_000, ['apps:changed'])
  const cats = usePoll<Category[]>(() => window.api.listCategories(), [], 60_000, ['apps:changed'])
  const detail = usePoll<AppDetail | null>(
    () => (selectedId === null ? Promise.resolve(null) : window.api.appDetail(selectedId, day)),
    [selectedId, day],
    10_000,
    ['data:changed', 'apps:changed']
  )

  const apps = yearApps.data?.apps ?? []
  useEffect(() => {
    if (apps.length) assignSlots(apps.map((a) => a.id))
    if (apps.length && selectedId === null) setSelectedId(apps[0].id)
  }, [apps, selectedId])

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return apps
    return apps.filter((a) => a.displayName.toLowerCase().includes(needle) || a.exeName.toLowerCase().includes(needle))
  }, [apps, query])
  const total = apps.reduce((s, a) => s + a.activeMs + a.idleMs - a.listeningMs, 0)
  const max = apps.length ? apps[0].activeMs + apps[0].idleMs : 0
  const used = apps.filter((a) => a.activeMs + a.idleMs > 0).length

  const d = detail.data
  const delta = d ? deltaText(d.todayMs, d.yesterdayMs) : null
  const selectedYear: YearAppUsage | undefined = apps.find((a) => a.id === selectedId)
  const allApps = all.data ?? []
  const hiddenApps = allApps.filter((a) => a.hidden)
  const through = yearApps.data?.throughDay
  return (
    <Page>
      <PageHeader
        title="Applications"
        subtitle={`${used} application${used === 1 ? '' : 's'} used in ${year} · ${fmtDuration(total)} on screen${through ? ` through ${fmtDay(through)}` : ''}`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <Card padded={false}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search size={14} className="text-muted shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${apps.length} application${apps.length === 1 ? '' : 's'}`}
                aria-label="Search applications"
                className="!bg-transparent !border-0 !p-0 !shadow-none flex-1 text-[13px]"
              />
              <span className="text-[11.5px] text-muted whitespace-nowrap">Totals for {year} · today is added after midnight</span>
            </div>
            {apps.length === 0 ? (
              <Empty title="No applications recorded" hint="Applications appear here after their first full day of use." />
            ) : list.length === 0 ? (
              <Empty title="No application matches" hint="Try part of the name or the executable." />
            ) : (
              <ul className="min-w-0 overflow-y-auto max-h-[560px]">
                {list.map((a) => {
                  const on = a.id === selectedId
                  const t = a.activeMs + a.idleMs
                  const share = max ? (t / max) * 100 : 0
                  return (
                    <li key={a.id}>
                      <button className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-card-2 ${on ? 'bg-card-2' : ''}`} onClick={() => setSelectedId(a.id)}>
                        <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={26} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[13.5px]">{a.displayName}</span>
                            <span className={`num text-[13.5px] ${t ? '' : 'text-muted'}`}>{t ? fmtDuration(t) : '—'}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex-1 h-[4px] rounded-full bg-[var(--card-2)] overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${share}%`, background: colorForApp(a.id) }} />
                            </div>
                            <span className="text-[11.5px] text-muted num shrink-0 text-right whitespace-nowrap">
                              {t
                                ? `${fmtDuration(a.activeMs)} active · ${a.days} day${a.days === 1 ? '' : 's'}${a.listeningMs >= 60_000 ? ` · ${fmtDuration(a.listeningMs)} listening` : ''}`
                                : 'No finished day yet'}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <CategoriesCard cats={cats.data ?? []} onChanged={() => cats.refresh()} />

          {hiddenApps.length > 0 && (
            <Card
              title="Hidden applications"
              right={
                <button className="btn btn-ghost !py-1 !px-2 text-[12.5px] inline-flex items-center gap-1" onClick={() => setShowHidden((v) => !v)}>
                  {showHidden ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {showHidden ? 'Hide' : `Show ${hiddenApps.length}`}
                </button>
              }
            >
              {!showHidden ? (
                <div className="text-[12.5px] text-secondary">
                  {hiddenApps.length} application{hiddenApps.length === 1 ? ' is' : 's are'} excluded from every statistic. Show them to bring one back.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {hiddenApps.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2 text-[13.5px]">
                      <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={22} />
                      <span className="flex-1 truncate">{a.displayName}</span>
                      <span className="text-[12px] text-muted truncate max-w-[200px]">{a.exeName}</span>
                      <button className="btn btn-ghost !py-1 !px-2 text-[12.5px] inline-flex items-center gap-1.5" onClick={() => window.api.hideApp(a.id, false)}>
                        <Eye size={14} /> Show
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3 sticky top-0">
          {d ? (
            <>
              <Card>
                <div className="flex items-center gap-3">
                  <AppIcon icon={d.app.icon} name={d.app.displayName} appId={d.app.id} size={40} />
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold truncate">{d.app.displayName}</div>
                    <div className="text-[12px] text-muted truncate" title={d.app.exePath}>
                      {d.app.exeName}
                    </div>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-y-3 text-[13.5px]">
                  <dt className="text-secondary">Active today</dt>
                  <dd className="num text-right">{fmtDuration(d.todayMs)}</dd>
                  <dt className="text-secondary">Idle today</dt>
                  <dd className="num text-right">{fmtDuration(d.daily[6].idleMs)}</dd>
                  <dt className="text-secondary">Yesterday</dt>
                  <dd className="num text-right">{fmtDuration(d.yesterdayMs)}</dd>
                  <dt className="text-secondary">7-day average</dt>
                  <dd className="num text-right">{fmtDuration(d.weeklyAvgMs)}</dd>
                  <dt className="text-secondary">Sessions today</dt>
                  <dd className="num text-right">{d.sessions}</dd>
                  <dt className="text-secondary">Longest session</dt>
                  <dd className="num text-right">{fmtDuration(d.longestMs)}</dd>
                  {selectedYear && (
                    <>
                      <dt className="text-secondary pt-2 border-t border-border">This year</dt>
                      <dd className="num text-right pt-2 border-t border-border">{fmtDuration(selectedYear.activeMs + selectedYear.idleMs)}</dd>
                      <dt className="text-secondary">Days used</dt>
                      <dd className="num text-right">{selectedYear.days}</dd>
                    </>
                  )}
                </dl>
                {delta && (
                  <div className={`mt-4 text-[12.5px] ${delta.dir === 'down' ? 'text-success' : delta.dir === 'up' ? 'text-warning' : 'text-secondary'}`}>{delta.text}</div>
                )}
              </Card>
              <Card title="Last 7 days · active time">
                <UsageBars data={d.daily} height={170} showIdle={false} />
              </Card>
              <ManageCard
                app={d.app}
                cats={cats.data ?? []}
                onChanged={() => {
                  detail.refresh()
                  all.refresh()
                  yearApps.refresh()
                }}
              />
            </>
          ) : (
            <Card>
              <Empty title="Select an application" />
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}

function ManageCard({
  app,
  cats,
  onChanged
}: {
  app: AppInfo
  cats: Category[]
  onChanged: () => void
}): JSX.Element {
  const [name, setName] = useState(app.displayName)
  useEffect(() => setName(app.displayName), [app.id, app.displayName])
  const renamed = name.trim() !== '' && name.trim() !== app.displayName

  const rename = async (): Promise<void> => {
    if (!renamed) return
    await window.api.renameApp(app.id, name.trim())
    onChanged()
  }
  const hide = async (): Promise<void> => {
    await window.api.hideApp(app.id, true)
    onChanged()
  }

  return (
    <Card title={`Manage ${app.displayName}`}>
      <div className="flex flex-col gap-4 text-[13px]">
        <div>
          <div className="text-secondary text-[12.5px] mb-1.5">Category</div>
          <Select
            aria-label="Category"
            className="text-[12.5px]"
            value={app.categoryId ?? 0}
            options={[{ value: 0, label: 'Uncategorized' }, ...cats.map((c) => ({ value: c.id, label: c.name, icon: <Dot color={c.color} /> }))]}
            onChange={async (v) => {
              await window.api.setAppCategory(app.id, v === 0 ? null : v)
              onChanged()
            }}
          />
        </div>
        <div>
          <div className="text-secondary text-[12.5px] mb-1.5">Name</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              maxLength={60}
              aria-label="Application name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void rename()
                if (e.key === 'Escape') setName(app.displayName)
              }}
              className="flex-1 !py-1.5"
            />
            <button className="btn btn-accent !py-1.5" onClick={rename} disabled={!renamed}>
              Save
            </button>
          </div>
        </div>

        <div>
          <button className="btn !py-1.5 inline-flex items-center gap-2" onClick={hide}>
            <EyeOff size={13} /> Hide from statistics
          </button>
          <div className="text-muted text-[12px] mt-1.5">Still tracked, but excluded from every total until you show it again.</div>
        </div>
      </div>
    </Card>
  )
}

/** Editable category list: rename inline, recolor, delete (apps become uncategorized), add new. */
function CategoriesCard({ cats, onChanged }: { cats: Category[]; onChanged: () => void }): JSX.Element {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  // Category whose color palette is open. Click-toggled: a hover popover lost the pointer in the gap below the dot.
  const [colorFor, setColorFor] = useState<number | null>(null)
  useEffect(() => {
    if (colorFor === null) return
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('[data-color-picker]')) setColorFor(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setColorFor(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [colorFor])

  const add = async (): Promise<void> => {
    if (!newName.trim()) return
    const color = CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length]
    await window.api.addCategory(newName, color)
    setNewName('')
    onChanged()
  }
  const save = async (c: Category, color = c.color): Promise<void> => {
    await window.api.updateCategory(c.id, draft.trim() || c.name, color)
    setEditing(null)
    onChanged()
  }

  return (
    <Card title="Categories" right={<span className="text-[12px] text-muted">Click a name to rename, a dot to recolor</span>}>
      <ul className="divide-y divide-border">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-[13.5px]">
            <div className="relative" data-color-picker>
              <button
                className="grid place-items-center w-5 h-5 rounded-md hover:bg-[var(--control)]"
                aria-label="Change color"
                aria-expanded={colorFor === c.id}
                onClick={() => setColorFor(colorFor === c.id ? null : c.id)}
              >
                <Dot color={c.color} size={12} />
              </button>
              {colorFor === c.id && (
                <div className="absolute left-0 top-full mt-1 z-10 grid gap-1.5 p-2 rounded-lg card shadow-xl w-max" style={{ gridTemplateColumns: 'repeat(9, 20px)' }}>
                  {CATEGORY_COLORS.map((col) => (
                    <button
                      key={col}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                      style={{ background: col, outline: col === c.color ? '2px solid var(--primary)' : undefined, outlineOffset: 2 }}
                      onClick={() => {
                        setColorFor(null)
                        setDraft(c.name)
                        void save({ ...c, name: c.name }, col)
                      }}
                      aria-label={`Use color ${col}`}
                    />
                  ))}
                </div>
              )}
            </div>
            {editing === c.id ? (
              <input
                type="text"
                value={draft}
                autoFocus
                maxLength={40}
                className="flex-1 !py-1"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => save(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save(c)
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button
                className="flex-1 text-left hover:text-accent-2"
                onClick={() => {
                  setEditing(c.id)
                  setDraft(c.name)
                }}
              >
                {c.name}
              </button>
            )}
            <button
              className="btn btn-ghost !p-1.5"
              aria-label="Delete category"
              onClick={async () => {
                await window.api.deleteCategory(c.id)
                onChanged()
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={newName}
          maxLength={40}
          placeholder="New category"
          className="flex-1 !py-1.5"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <button className="btn !py-1.5 inline-flex items-center gap-1.5" onClick={add} disabled={!newName.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </Card>
  )
}
