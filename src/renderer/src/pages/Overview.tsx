import { useEffect } from 'react'
import type { AppUsage, CategoryUsage, DaySummary, TimelineSegment, TrackerStatus, Transition } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { addDays, deltaText, fmtDay, fmtDuration, fmtTime, greeting, MINOR_APP_MS, pct, today } from '@/lib/format'
import { assignSlots, colorForApp, NEUTRAL } from '@/lib/palette'
import { Card, StatTile, AppIcon, Page, Empty, Dot, CountUp } from '@/components/ui'
import { DayTimeline } from '@/components/DayTimeline'

export function Overview({
  status,
  onOpenApps,
  onOpenTimeline
}: {
  status: TrackerStatus | null
  onOpenApps: () => void
  onOpenTimeline: () => void
}): JSX.Element {
  const day = today()
  const summary = usePoll<DaySummary>(() => window.api.daySummary(day), [day], 5000)
  const yesterday = usePoll<DaySummary>(() => window.api.daySummary(addDays(day, -1)), [day], 60_000)
  const apps = usePoll<AppUsage[]>(() => window.api.dayApps(day), [day], 5000, ['data:changed', 'apps:changed'])
  const timeline = usePoll<TimelineSegment[]>(() => window.api.timeline(day), [day], 10_000)
  const transitions = usePoll<Transition[]>(() => window.api.transitions(day, 4), [day], 30_000)
  const categories = usePoll<CategoryUsage[]>(() => window.api.dayCategories(day), [day], 15_000, ['data:changed', 'apps:changed'])

  useEffect(() => {
    if (apps.data) assignSlots(apps.data.map((a) => a.id))
  }, [apps.data])

  const s = summary.data
  const y = yesterday.data
  const delta = s && y ? deltaText(s.screenMs, y.screenMs) : null
  const allApps = apps.data ?? []
  const majorApps = allApps.filter((a) => a.activeMs + a.idleMs >= MINOR_APP_MS)
  const minorApps = allApps.filter((a) => a.activeMs + a.idleMs < MINOR_APP_MS)
  const topApps = majorApps.slice(0, 8)
  const otherMs = [...majorApps.slice(8), ...minorApps].reduce((s, a) => s + a.activeMs + a.idleMs, 0)
  const otherCount = majorApps.slice(8).length + minorApps.length
  const maxApp = topApps[0] ? topApps[0].activeMs + topApps[0].idleMs : otherMs || 1

  return (
    <Page>
      <div className="pt-2 mb-6">
        <div className="text-secondary text-[13px]">
          {greeting()} · {fmtDay(day)}
        </div>
        <div className="flex items-end gap-4 mt-2">
          <div className="hero num text-[56px] leading-none">{s ? <CountUp value={s.screenMs} format={fmtDuration} /> : '—'}</div>
          <div className="pb-1.5 text-secondary text-[13px]">
            Screen time today
            {delta && (
              <span className={`ml-2 ${delta.dir === 'down' ? 'text-success' : delta.dir === 'up' ? 'text-warning' : 'text-secondary'}`}>
                {delta.text}
              </span>
            )}
          </div>
        </div>
        {status?.currentApp && status.tracking && (
          <div className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-secondary">
            <Dot color={status.idle ? 'var(--warning)' : 'var(--success)'} live={!status.idle} />
            {status.media ? 'Watching in' : status.call ? 'In a call in' : status.passive ? 'Reading in' : status.idle ? 'Idle in' : 'Using'}{' '}
            <span className="text-primary">{status.currentApp.displayName}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <StatTile
          label="Active time"
          ms={s?.activeMs}
          format={fmtDuration}
          sub={s ? `${pct(s.activeMs, s.screenMs)}% of screen time${s.passiveMs >= 60_000 ? ` · ${fmtDuration(s.passiveMs)} passive` : ''}` : undefined}
        />
        <StatTile
          label="Idle time"
          ms={s?.idleMs}
          format={fmtDuration}
          sub={s ? `${pct(s.idleMs, s.screenMs)}% of screen time` : undefined}
        />
        <StatTile
          label="Focus"
          ms={s?.focusMs}
          format={fmtDuration}
          sub={s ? `${s.focusSessions} session${s.focusSessions === 1 ? '' : 's'}` : undefined}
          subTone="accent"
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <StatTile
          label="Sessions"
          value={s ? String(s.sessions) : '—'}
          sub={
            s && s.longestSessionStart !== null
              ? `Longest ${fmtDuration(s.longestSessionMs)} · ${fmtTime(s.longestSessionStart)}`
              : 'Continuous stretches of activity'
          }
        />
        <StatTile
          label="App switches"
          value={s ? String(s.switches) : '—'}
          sub={
            transitions.data?.[0]
              ? `Most common ${transitions.data[0].fromApp} to ${transitions.data[0].toApp}`
              : 'Between applications today'
          }
        />
        <StatTile
          label="Active window"
          value={s?.firstActivity ? `${fmtTime(s.firstActivity)}` : '—'}
          sub={s?.lastActivity ? `First activity · last ${fmtTime(s.lastActivity)}` : 'First activity of the day'}
        />
      </div>

      <Card
        title="24h timeline"
        className="mb-3"
        right={
          <button className="btn btn-ghost !py-1 !px-2 text-[12.5px]" onClick={onOpenTimeline}>
            Open timeline
          </button>
        }
      >
        <DayTimeline segments={timeline.data ?? []} day={day} compact maxLanes={5} />
      </Card>

      <CategoryCard cats={categories.data ?? []} />

      <Card
        title="Today's applications"
        right={
          <button className="btn btn-ghost !py-1 !px-2 text-[12.5px]" onClick={onOpenApps}>
            View all
          </button>
        }
      >
        {allApps.length === 0 ? (
          <Empty title="No application usage yet" hint="Usage appears here as you use your PC." />
        ) : (
          <ul className="flex flex-col gap-1">
            {topApps.map((a) => (
              <li key={a.id} className="lift flex items-center gap-3 py-1.5 -mx-2 px-2 rounded-lg hover:bg-[var(--control)]">
                <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={24} />
                <div className="w-[190px] truncate text-[13.5px]">{a.displayName}</div>
                <div className="flex-1 h-[6px] rounded-full bg-[var(--card-2)] overflow-hidden">
                  <div
                    className="bar-in h-full rounded-full"
                    style={{ width: `${((a.activeMs + a.idleMs) / maxApp) * 100}%`, background: colorForApp(a.id) }}
                  />
                </div>
                <div className="w-[70px] text-right num text-[13.5px]">{fmtDuration(a.activeMs + a.idleMs)}</div>
              </li>
            ))}
            {otherCount > 0 && (
              <li className="flex items-center gap-3 py-1.5 -mx-2 px-2 text-secondary">
                <span className="w-6 h-6 rounded-md shrink-0" style={{ background: NEUTRAL }} />
                <div className="w-[190px] truncate text-[13.5px]">
                  Other <span className="text-muted text-[12px]">· {otherCount} app{otherCount === 1 ? '' : 's'}</span>
                </div>
                <div className="flex-1 h-[6px] rounded-full bg-[var(--card-2)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (otherMs / maxApp) * 100)}%`, background: NEUTRAL }} />
                </div>
                <div className="w-[70px] text-right num text-[13.5px]">{fmtDuration(otherMs)}</div>
              </li>
            )}
          </ul>
        )}
      </Card>
    </Page>
  )
}

/** Active time by category: one stacked bar (2px surface gaps) plus a legend with values. */
function CategoryCard({ cats }: { cats: CategoryUsage[] }): JSX.Element | null {
  const total = cats.reduce((s, c) => s + c.activeMs, 0)
  if (total < 60_000) return null
  return (
    <Card title="Time by category" className="mb-3">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] bg-[var(--card-2)]">
        {cats.map((c) => (
          <div key={c.id} style={{ width: `${(c.activeMs / total) * 100}%`, background: c.color }} title={`${c.name} ${fmtDuration(c.activeMs)}`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1.5">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-[13px]">
            <Dot color={c.color} />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="num text-secondary">{fmtDuration(c.activeMs)}</span>
            <span className="num text-muted text-[11.5px] w-9 text-right">{pct(c.activeMs, total)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
