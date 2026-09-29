import { useEffect, useMemo, useState } from 'react'
import { Flame, Trash2 } from 'lucide-react'
import type { AppInfo, Category, DailyPoint, StreakDay, StreakKind, StreakStatus } from '../../../shared/types'
import { STREAK_KINDS } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { fmtDuration, today } from '@/lib/format'
import { fmtMinutes } from '@/lib/duration'
import { AppIcon, Card, Dot, Empty, Page, PageHeader, Segmented, Select } from '@/components/ui'
import { DurationField } from '@/components/DurationField'
import { YearGraph } from '@/components/YearGraph'

/** Human name for a streak, e.g. "Screen time under 6h" or "At least 2h of Work". */
export function streakName(s: { kind: StreakKind; target: number; refName: string | null }): string {
  const t = fmtMinutes(s.target)
  const ref = s.refName ?? '?'
  switch (s.kind) {
    case 'screenUnder':
      return `Screen time under ${t}`
    case 'activeAtLeast':
      return `At least ${t} active`
    case 'categoryAtLeast':
      return `At least ${t} of ${ref}`
    case 'categoryUnder':
      return `${ref} under ${t}`
    case 'appUnder':
      return `${ref} under ${t}`
    case 'focusAtLeast':
      return `${t} of focus a day`
  }
}

export function Streaks(): JSX.Element {
  const t = today()
  const year = Number(t.slice(0, 4))
  const from = `${year}-01-01`
  const streaks = usePoll<StreakStatus[]>(() => window.api.listStreaks(), [t], 60_000, ['data:changed'])
  const activity = usePoll<DailyPoint[]>(() => window.api.yearActivity(from, t), [t], 120_000, ['data:changed'])
  const cats = usePoll<Category[]>(() => window.api.listCategories(), [], 120_000, ['apps:changed'])
  const apps = usePoll<AppInfo[]>(() => window.api.listApps(), [], 120_000, ['apps:changed'])
  const [view, setView] = useState<number | 'screen'>('screen')
  const screen = useMemo(() => new Map((activity.data ?? []).map((d) => [d.day, d.screenMs])), [activity.data])
  const list = streaks.data ?? []
  useEffect(() => {
    if (view !== 'screen' && !list.some((s) => s.id === view)) setView('screen')
  }, [list, view])
  const viewed = view === 'screen' ? null : list.find((s) => s.id === view) ?? null

  const remove = async (id: number): Promise<void> => {
    await window.api.removeStreak(id)
    streaks.refresh()
  }
  const toggleFreeze = async (s: StreakStatus, d: { day: string; ok: boolean | null; frozen?: boolean }): Promise<void> => {
    if (d.frozen) await window.api.unfreezeStreakDay(s.id, d.day)
    else if (d.ok === false && d.day < t && s.freezesLeft > 0) await window.api.freezeStreakDay(s.id, d.day)
    else return
    streaks.refresh()
  }

  return (
    <Page>
      <PageHeader title="Streaks" subtitle="Daily goals you keep, and a year of your days at a glance." />

      <Card
        title={`${year}`}
        className="mb-3"
        right={
          list.length > 0 ? (
            <Segmented
              options={[{ value: 'screen' as const, label: 'Screen time' }, ...list.map((s) => ({ value: s.id, label: streakName(s) }))]}
              value={view}
              onChange={setView}
            />
          ) : undefined
        }
      >
        <YearGraph year={year} screen={screen} streak={viewed} />
      </Card>

      <Card title="Your streaks" className="mb-3">
        {list.length === 0 ? (
          <Empty title="No streaks yet" hint="Set one below. Streaks count every recorded day, so a habit you already keep shows up right away. Each streak gets three freeze days a month to cover a miss." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {list.map((s) => (
              <StreakRow key={s.id} s={s} onRemove={() => remove(s.id)} onView={() => setView(s.id)} onToggleFreeze={(d) => toggleFreeze(s, d)} active={view === s.id} />
            ))}
          </ul>
        )}
      </Card>

      <AddStreak cats={cats.data ?? []} apps={(apps.data ?? []).filter((a) => !a.hidden && a.mergedInto === null)} onAdded={() => streaks.refresh()} />
    </Page>
  )
}

function StreakRow({
  s,
  onRemove,
  onView,
  onToggleFreeze,
  active
}: {
  s: StreakStatus
  onRemove: () => void
  onView: () => void
  onToggleFreeze: (d: StreakDay) => void
  active: boolean
}): JSX.Element {
  const last = s.days.slice(-14)
  const state =
    s.todayState === 'done' ? { text: 'Done today', tone: 'text-success' } : s.todayState === 'failed' ? { text: 'Missed today', tone: 'text-danger' } : { text: 'Today in progress', tone: 'text-secondary' }
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="grid place-items-center w-10 h-10 rounded-full shrink-0" style={{ background: 'rgba(var(--accent-rgb), 0.14)' }}>
        <Flame size={18} className={s.current > 0 ? 'text-accent' : 'text-muted'} />
      </span>
      <div className="min-w-0 flex-1">
        <button className="text-[14px] text-left hover:text-accent transition-colors" onClick={onView} title="Show on the year graph">
          {streakName(s)}
          {active && <span className="ml-2 text-[11px] text-accent">on graph</span>}
        </button>
        <div className={`text-[12.5px] mt-0.5 ${state.tone}`}>
          {state.text}
          {s.days.length > 0 && <span className="text-muted"> · {fmtDuration(s.days[s.days.length - 1].value * 60_000)} so far</span>}
          <span className="text-muted"> · {s.freezesLeft} freeze{s.freezesLeft === 1 ? '' : 's'} left this month</span>
        </div>
      </div>
      <div className="flex items-center gap-[3px]" title="Last 14 days. Click a missed day to spend a freeze on it.">
        {last.map((d) => {
          const canFreeze = d.ok === false && !d.frozen && s.freezesLeft > 0 && d.day < today()
          return (
            <button
              key={d.day}
              type="button"
              className={`w-[10px] h-[10px] rounded-full ${canFreeze || d.frozen ? 'cursor-pointer hover:scale-125 transition-transform' : 'cursor-default'}`}
              style={{
                background: d.frozen
                  ? 'color-mix(in srgb, var(--accent) 45%, var(--card-2))'
                  : d.ok === true
                    ? 'var(--accent)'
                    : d.ok === false
                      ? 'color-mix(in srgb, var(--danger) 45%, var(--card-2))'
                      : 'var(--card-2)',
                outline: d.ok === null ? '1.5px solid var(--accent)' : undefined,
                outlineOffset: -1
              }}
              aria-label={`${d.day}: ${d.frozen ? 'frozen, click to unfreeze' : d.ok === false ? (canFreeze ? 'missed, click to freeze' : 'missed') : d.ok ? 'hit' : 'today'}`}
              onClick={() => onToggleFreeze(d)}
            />
          )
        })}
      </div>
      <div className="text-right w-[92px]">
        <div className="hero num text-[22px] leading-none">
          {s.current} <span className="text-[12px] text-secondary font-medium">day{s.current === 1 ? '' : 's'}</span>
        </div>
        <div className="text-[11.5px] text-muted num mt-0.5">best {s.best}</div>
      </div>
      <button className="btn btn-ghost !p-2" onClick={onRemove} aria-label="Remove streak">
        <Trash2 size={15} />
      </button>
    </li>
  )
}

function AddStreak({ cats, apps, onAdded }: { cats: Category[]; apps: AppInfo[]; onAdded: () => void }): JSX.Element {
  const [kind, setKind] = useState<StreakKind>('screenUnder')
  const [target, setTarget] = useState(360)
  const [refId, setRefId] = useState<number | ''>('')
  const def = STREAK_KINDS.find((k) => k.value === kind)!
  const refName = def.needs === 'category' ? cats.find((c) => c.id === refId)?.name ?? null : def.needs === 'app' ? apps.find((a) => a.id === refId)?.displayName ?? null : null
  const ready = def.needs === 'none' || refId !== ''

  useEffect(() => {
    setRefId('')
    setTarget(kind === 'focusAtLeast' ? 25 : kind === 'activeAtLeast' || kind === 'categoryAtLeast' ? 120 : kind === 'appUnder' || kind === 'categoryUnder' ? 60 : 360)
  }, [kind])

  const add = async (): Promise<void> => {
    if (!ready) return
    await window.api.addStreak(kind, target, refId === '' ? null : Number(refId))
    onAdded()
  }

  return (
    <Card title="Set a streak">
      <div className="grid grid-cols-[1fr_160px] gap-3 mb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-secondary">Goal</span>
          <Select<StreakKind> aria-label="Goal" value={kind} options={STREAK_KINDS} onChange={setKind} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-secondary">{def.needs === 'none' && kind.endsWith('Under') ? 'Stay under' : kind.endsWith('Under') ? 'Stay under' : 'Reach'}</span>
          <DurationField minutes={target} onCommit={setTarget} live label="Streak target" />
        </label>
      </div>
      {def.needs !== 'none' && (
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="text-[12.5px] text-secondary">{def.needs === 'category' ? 'Category' : 'Application'}</span>
          <Select<number>
            aria-label={def.needs === 'category' ? 'Category' : 'Application'}
            placeholder={`Choose ${def.needs === 'category' ? 'a category' : 'an application'}`}
            value={refId === '' ? null : refId}
            options={
              def.needs === 'category'
                ? cats.map((c) => ({ value: c.id, label: c.name, icon: <Dot color={c.color} /> }))
                : apps.map((a) => ({ value: a.id, label: a.displayName, icon: <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={18} /> }))
            }
            onChange={setRefId}
          />
        </label>
      )}
      <div className="flex items-center gap-4">
        <button className="btn btn-accent" onClick={add} disabled={!ready}>
          Start streak
        </button>
        <span className="text-[12.5px] text-muted">{ready ? streakName({ kind, target, refName }) : def.hint}</span>
      </div>
    </Card>
  )
}
