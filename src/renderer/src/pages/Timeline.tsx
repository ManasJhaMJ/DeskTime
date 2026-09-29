import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { AppUsage, CategoryUsage, DaySummary, Insights, TimelineSegment, Transition } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { addDays, deltaText, fmtDuration, fmtHour, fmtTime, MINOR_APP_MS, pct, today } from '@/lib/format'
import { assignSlots, colorForApp, NEUTRAL } from '@/lib/palette'
import { AppIcon, Card, Empty, Page, PageHeader, StatTile } from '@/components/ui'
import { DayNav } from '@/components/DayNav'
import { DayTimeline } from '@/components/DayTimeline'
import { HourlyStrip } from '@/components/UsageBars'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'

/** A pause between two stretches of activity counts as a break from this length on. */
const BREAK_MS = 5 * 60_000
/** Applications listed on this page before the link to the full list. */
const TOP_APPS = 8

/**
 * The detailed view of one day: every figure the Overview hints at, plus the lanes, the hourly shape,
 * category and application breakdowns, the most common switches and the raw activity log.
 */
export function Timeline({ onOpenApps }: { onOpenApps: () => void }): JSX.Element {
  const [day, setDay] = useState(today())
  const [selected, setSelected] = useState<TimelineSegment | null>(null)
  const live = day === today()
  const fast = live ? 10_000 : 120_000
  const slow = live ? 30_000 : 120_000
  const segments = usePoll<TimelineSegment[]>(() => window.api.timeline(day), [day], fast)
  const summary = usePoll<DaySummary>(() => window.api.daySummary(day), [day], fast)
  const previous = usePoll<DaySummary>(() => window.api.daySummary(addDays(day, -1)), [day], 120_000)
  const apps = usePoll<AppUsage[]>(() => window.api.dayApps(day), [day], fast, ['data:changed', 'apps:changed'])
  const categories = usePoll<CategoryUsage[]>(() => window.api.dayCategories(day), [day], slow, ['data:changed', 'apps:changed'])
  const transitions = usePoll<Transition[]>(() => window.api.transitions(day, 6), [day], slow)
  const insights = usePoll<Insights>(() => window.api.insights(day, day), [day], slow)

  useEffect(() => setSelected(null), [day])
  // Same slot order as the Overview and Applications pages, so an app keeps its color everywhere.
  useEffect(() => {
    if (apps.data) assignSlots(apps.data.map((a) => a.id))
  }, [apps.data])

  const log = useMemo(() => {
    const list = (segments.data ?? []).filter((s) => s.end - s.start >= 60_000)
    return list.slice().reverse().slice(0, 60)
  }, [segments.data])

  /** Gaps between stretches of activity (idle or away from the PC) of at least BREAK_MS. */
  const breaks = useMemo(() => {
    const segs = (segments.data ?? []).slice().sort((a, b) => a.start - b.start)
    let lastActiveEnd: number | null = null
    let count = 0
    let longest = 0
    let longestStart: number | null = null
    for (const s of segs) {
      if (s.isIdle) continue
      if (lastActiveEnd !== null) {
        const gap = s.start - lastActiveEnd
        if (gap >= BREAK_MS) {
          count++
          if (gap > longest) {
            longest = gap
            longestStart = lastActiveEnd
          }
        }
      }
      lastActiveEnd = Math.max(lastActiveEnd ?? 0, s.end)
    }
    return { count, longest, longestStart }
  }, [segments.data])

  const s = summary.data
  const y = previous.data
  const delta = s && y ? deltaText(s.screenMs, y.screenMs, live ? 'yesterday' : 'the day before') : null
  const topSwitch = transitions.data?.[0]
  const block = insights.data?.highestUsageBlock && insights.data.highestUsageBlock.activeMs >= 60_000 ? insights.data.highestUsageBlock : null
  const hasHourly = !!insights.data && insights.data.hourly.some((v) => v > 0)

  const allApps = apps.data ?? []
  // Listening overlaps other apps' time, so it is left out of the share denominator.
  const appsTotal = allApps.reduce((sum, a) => sum + a.activeMs + a.idleMs - a.listeningMs, 0)
  const majorApps = allApps.filter((a) => a.activeMs + a.idleMs >= MINOR_APP_MS)
  const topApps = majorApps.slice(0, TOP_APPS)
  const restApps = allApps.filter((a) => !topApps.includes(a))
  const restMs = restApps.reduce((sum, a) => sum + a.activeMs + a.idleMs, 0)

  return (
    <Page>
      <PageHeader title="Timeline" subtitle="How the day unfolded, hour by hour. Scroll over the lanes to zoom, shift+scroll to pan." right={<DayNav day={day} onChange={setDay} />} />

      <div className="grid grid-cols-4 gap-3 mb-3">
        <StatTile
          label="Screen time"
          value={s ? fmtDuration(s.screenMs) : '—'}
          sub={delta?.text ?? 'Active plus idle time'}
          subTone={delta ? (delta.dir === 'down' ? 'good' : delta.dir === 'up' ? 'bad' : 'muted') : 'muted'}
        />
        <StatTile
          label="Active"
          value={s ? fmtDuration(s.activeMs) : '—'}
          sub={s && s.passiveMs >= 60_000 ? `${fmtDuration(s.passiveMs)} passive (reading, watching)` : 'Hands-on plus passive time'}
        />
        <StatTile
          label="Idle"
          value={s ? fmtDuration(s.idleMs) : '—'}
          sub={
            s && s.listeningMs >= 60_000
              ? `Plus ${fmtDuration(s.listeningMs)} of background audio`
              : s && s.screenMs > 0
                ? `${pct(s.idleMs, s.screenMs)}% of screen time`
                : 'No input while the screen stayed on'
          }
        />
        <StatTile
          label="Focus"
          value={s ? fmtDuration(s.focusMs) : '—'}
          sub={s ? (s.focusSessions ? `${s.focusSessions} focus session${s.focusSessions === 1 ? '' : 's'}` : 'No focus sessions') : undefined}
        />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
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
          label="Breaks"
          value={segments.data ? String(breaks.count) : '—'}
          sub={breaks.longestStart !== null ? `Longest ${fmtDuration(breaks.longest)} · ${fmtTime(breaks.longestStart)}` : 'Pauses of five minutes or more'}
        />
        <StatTile
          label="App switches"
          value={s ? String(s.switches) : '—'}
          sub={topSwitch ? `Most common ${topSwitch.fromApp} to ${topSwitch.toApp}` : 'Between applications'}
        />
        <StatTile
          label="Day span"
          value={s?.firstActivity && s.lastActivity ? fmtDuration(s.lastActivity - s.firstActivity) : '—'}
          sub={s?.firstActivity && s.lastActivity ? `${fmtTime(s.firstActivity)} to ${fmtTime(s.lastActivity)}` : 'First to last activity'}
        />
      </div>

      <Card className="mb-3">
        <DayTimeline segments={segments.data ?? []} day={day} selected={selected} onSelect={setSelected} zoomable />
      </Card>

      {selected && (
        <Card className="mb-3">
          <div className="flex items-start gap-4">
            {selected.isIdle ? (
              <span className="w-9 h-9 rounded-md hatch shrink-0" />
            ) : (
              <AppIcon icon={selected.icon} name={selected.appName} appId={selected.appId} size={36} />
            )}
            <div className="flex-1">
              <div className="text-[16px] font-medium">
                {selected.listening ? `Listening · ${selected.appName}` : selected.isIdle ? `Idle · ${selected.appName}` : selected.appName}
              </div>
              <div className="text-secondary num mt-0.5">
                {fmtTime(selected.start)} to {fmtTime(selected.end)}
              </div>
              <div className="text-secondary num">Duration {fmtDuration(selected.end - selected.start, { seconds: true })}</div>
            </div>
            <button className="btn btn-ghost !p-1.5" onClick={() => setSelected(null)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3 mb-3">
        <Card
          title="Active time by hour"
          right={
            block ? (
              <span className="text-[12px] text-muted num">
                Busiest {fmtHour(block.startHour)} to {fmtHour(block.endHour)} · {fmtDuration(block.activeMs)}
              </span>
            ) : undefined
          }
        >
          {hasHourly && insights.data ? <HourlyStrip hourly={insights.data.hourly} /> : <Empty title="No activity recorded" />}
        </Card>
        <CategoryBreakdown cats={categories.data ?? []} hint="Assign categories on the Applications page." />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3 mb-3">
        <Card
          title="By application"
          right={
            <button className="text-[12.5px] text-secondary hover:text-primary transition-colors" onClick={onOpenApps}>
              All applications →
            </button>
          }
        >
          {allApps.length === 0 ? (
            <Empty title="No applications recorded" />
          ) : (
            <ul className="divide-y divide-border">
              {topApps.map((a) => {
                const total = a.activeMs + a.idleMs
                const share = pct(total, appsTotal)
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13.5px]">{a.displayName}</span>
                        <span className="num text-[13.5px]">{fmtDuration(total)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 h-[4px] rounded-full bg-[var(--card-2)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${share}%`, background: colorForApp(a.id) }} />
                        </div>
                        <span className="text-[11.5px] text-muted num whitespace-nowrap">
                          {share}% · {fmtDuration(a.activeMs)} active · {a.sessions} session{a.sessions === 1 ? '' : 's'}
                          {a.listeningMs >= 60_000 ? ` · ${fmtDuration(a.listeningMs)} listening` : ''}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
              {restApps.length > 0 && (
                <li>
                  <button className="w-full flex items-center justify-between py-2.5 text-[12.5px] text-secondary hover:text-primary transition-colors" onClick={onOpenApps}>
                    <span>
                      +{restApps.length} more application{restApps.length === 1 ? '' : 's'}
                    </span>
                    <span className="num">{fmtDuration(restMs)}</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Most common switches">
          {!transitions.data?.length ? (
            <Empty title="No switches recorded" />
          ) : (
            <ul className="text-[13.5px]">
              {transitions.data.map((t, i) => (
                <li key={i} className="flex items-center justify-between py-[7px] border-b border-border last:border-b-0">
                  <span className="truncate">
                    {t.fromApp} <span className="text-muted">to</span> {t.toApp}
                  </span>
                  <span className="num text-secondary ml-3">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Activity log" right={<span className="text-[12px] text-muted">Blocks of a minute or longer, newest first</span>}>
        {log.length === 0 ? (
          <div className="text-secondary text-[13px] py-6 text-center">No activity recorded for this day.</div>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((seg) => (
              <li
                key={seg.id}
                className={`flex items-center gap-3 py-2 cursor-pointer -mx-2 px-2 rounded-md hover:bg-card-2 ${selected?.id === seg.id ? 'bg-card-2' : ''}`}
                onClick={() => setSelected(seg)}
              >
                <span className={`w-1.5 h-6 rounded-full ${seg.isIdle ? 'hatch' : ''}`} style={{ background: seg.isIdle ? undefined : colorForApp(seg.appId) || NEUTRAL }} />
                <span className="num text-secondary w-[150px] text-[13px]">
                  {fmtTime(seg.start)} to {fmtTime(seg.end)}
                </span>
                <span className="flex-1 truncate text-[13.5px]">
                  {seg.listening ? `Listening · ${seg.appName}` : seg.isIdle ? `Idle · ${seg.appName}` : seg.passive ? `Passive · ${seg.appName}` : seg.appName}
                </span>
                <span className="num text-[13px] text-secondary">{fmtDuration(seg.end - seg.start)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  )
}
