import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CategoryUsage, DaySummary, Insights, MonthlyReport, Transition, WeeklyReport } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { addDays, addMonths, fmtDay, fmtDayShort, fmtDuration, fmtHour, fmtMonth, fmtTime, monthOf, today, weekStart, weekdayShort } from '@/lib/format'
import { AppIcon, Card, Empty, Page, PageHeader, Segmented, StatTile } from '@/components/ui'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'
import { DayNav } from '@/components/DayNav'
import { CompareBars, HourlyStrip, UsageBars } from '@/components/UsageBars'
import { MonthHeatmap } from '@/components/MonthHeatmap'

type Tab = 'daily' | 'weekly' | 'monthly'

export function Reports(): JSX.Element {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') as Tab | null) ?? 'weekly')
  const [day, setDay] = useState(today())
  const [week, setWeek] = useState(weekStart(today()))
  const weekEnd = addDays(week, 6)
  const isCurrentWeek = week === weekStart(today())
  const [month, setMonth] = useState(monthOf(today()))
  const isCurrentMonth = month === monthOf(today())
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  const monthly = usePoll<MonthlyReport>(() => window.api.monthly(month), [month], isCurrentMonth ? 60_000 : 600_000)
  const prevMonth = usePoll<MonthlyReport>(() => window.api.monthly(addMonths(month, -1)), [month], 600_000)
  const monthCats = usePoll<CategoryUsage[]>(
    () => window.api.rangeCategories(`${month}-01`, `${month}-${String(monthDays).padStart(2, '0')}`),
    [month],
    isCurrentMonth ? 120_000 : 600_000
  )
  const monthInsights = usePoll<Insights>(
    () => window.api.insights(`${month}-01`, `${month}-${String(monthDays).padStart(2, '0')}`),
    [month],
    isCurrentMonth ? 120_000 : 600_000
  )

  const weekly = usePoll<WeeklyReport>(() => window.api.weekly(week), [week], isCurrentWeek ? 30_000 : 300_000)
  const lastWeek = usePoll<WeeklyReport>(() => window.api.weekly(addDays(week, -7)), [week], 300_000)
  const weekInsights = usePoll<Insights>(() => window.api.insights(week, weekEnd), [week], isCurrentWeek ? 60_000 : 300_000)
  const daily = usePoll<DaySummary>(() => window.api.daySummary(day), [day], day === today() ? 10_000 : 300_000)
  const dayInsights = usePoll<Insights>(() => window.api.insights(day, day), [day], day === today() ? 30_000 : 300_000)
  const transitions = usePoll<Transition[]>(() => window.api.transitions(day, 6), [day], 30_000)

  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle="Patterns, not scores."
        right={
          <div className="flex items-center gap-3">
            <Segmented<Tab>
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' }
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'daily' ? (
              <DayNav day={day} onChange={setDay} />
            ) : tab === 'monthly' ? (
              <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <button className="min-w-[150px] text-center text-[13px] px-2 py-1.5 rounded-md hover:bg-card-2" onClick={() => setMonth(monthOf(today()))}>
                  {fmtMonth(month)}
                </button>
                <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => setMonth(addMonths(month, 1))} disabled={isCurrentMonth} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
                  <ChevronLeft size={16} />
                </button>
                <button className="min-w-[150px] text-center text-[13px] px-2 py-1.5 rounded-md hover:bg-card-2" onClick={() => setWeek(weekStart(today()))}>
                  {fmtDayShort(week)} to {fmtDayShort(weekEnd)}
                </button>
                <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => setWeek(addDays(week, 7))} disabled={isCurrentWeek} aria-label="Next week">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        }
      />

      {tab === 'monthly' ? (
        <>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <StatTile label="Monthly total" value={monthly.data ? fmtDuration(monthly.data.totalMs) : '—'} sub="Screen time" />
            <StatTile
              label="Daily average"
              value={monthly.data ? fmtDuration(monthly.data.activeDays ? Math.round(monthly.data.totalMs / monthly.data.activeDays) : 0) : '—'}
              sub={monthly.data ? `Across ${monthly.data.activeDays} active day${monthly.data.activeDays === 1 ? '' : 's'}` : undefined}
            />
            <StatTile label="Active" value={monthly.data ? fmtDuration(monthly.data.activeMs) : '—'} sub={monthly.data ? `${fmtDuration(monthly.data.idleMs)} idle` : undefined} />
            <StatTile
              label="Busiest day"
              value={monthly.data?.busiestDay ? fmtDuration(monthly.data.busiestDay.screenMs) : '—'}
              sub={monthly.data?.busiestDay ? fmtDay(monthly.data.busiestDay.day) : 'No activity yet'}
            />
          </div>
          <MonthCompare current={monthly.data} previous={prevMonth.data} isCurrentMonth={isCurrentMonth} />
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <Card title={fmtMonth(month)}>
              <MonthHeatmap days={monthly.data?.days ?? []} />
            </Card>
            <Card title="Top applications">
              {!monthly.data?.topApps.length ? (
                <Empty title="No usage this month" />
              ) : (
                <ul className="text-[13.5px]">
                  {monthly.data.topApps.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 py-[7px] border-b border-border last:border-b-0">
                      <AppIcon icon={a.icon} name={a.name} appId={a.id} size={20} />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="num text-secondary">{fmtDuration(a.activeMs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <MonthWeeks report={monthly.data} />
            <CategoryBreakdown cats={monthCats.data ?? []} />
          </div>
          <InsightsCard insights={monthInsights.data} period="this month" />
        </>
      ) : tab === 'weekly' ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatTile label="Weekly total" value={weekly.data ? fmtDuration(weekly.data.totalMs) : '—'} sub="Screen time" />
            <StatTile label="Active" value={weekly.data ? fmtDuration(weekly.data.activeMs) : '—'} sub={weekly.data ? `${fmtDuration(Math.round(weekly.data.activeMs / 7))} per day` : undefined} />
            <StatTile label="Idle" value={weekly.data ? fmtDuration(weekly.data.idleMs) : '—'} />
          </div>
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <Card title="This week">
              <UsageBars data={weekly.data?.days ?? []} height={230} />
            </Card>
            <Card title="By day">
              <ul className="text-[13.5px]">
                {(weekly.data?.days ?? []).map((d) => (
                  <li key={d.day} className="flex items-center justify-between py-[7px] border-b border-border last:border-b-0">
                    <span className={d.day === today() ? 'text-primary' : 'text-secondary'}>
                      {weekdayShort(d.day)} <span className="text-muted text-[12px] ml-1">{fmtDayShort(d.day)}</span>
                    </span>
                    <span className="num">{fmtDuration(d.screenMs)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <CompareWeeks current={weekly.data} previous={lastWeek.data} isCurrentWeek={isCurrentWeek} />
          <InsightsCard insights={weekInsights.data} period="this week" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatTile label="Screen time" value={daily.data ? fmtDuration(daily.data.screenMs) : '—'} />
            <StatTile label="Active time" value={daily.data ? fmtDuration(daily.data.activeMs) : '—'} />
            <StatTile label="Idle time" value={daily.data ? fmtDuration(daily.data.idleMs) : '—'} />
            <StatTile label="Sessions" value={daily.data ? String(daily.data.sessions) : '—'} />
            <StatTile label="App switches" value={daily.data ? String(daily.data.switches) : '—'} />
            <StatTile label="Focus time" value={daily.data ? fmtDuration(daily.data.focusMs) : '—'} sub={daily.data ? `${daily.data.focusSessions} sessions` : undefined} />
          </div>
          <div className="grid grid-cols-[1fr_360px] gap-3 mb-3">
            <Card title="Active time by hour">
              {dayInsights.data ? <HourlyStrip hourly={dayInsights.data.hourly} /> : null}
            </Card>
            <Card title="Most common transitions">
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
          <InsightsCard insights={dayInsights.data} period="today" />
        </>
      )}
    </Page>
  )
}

function InsightsCard({ insights, period }: { insights: Insights | null; period: string }): JSX.Element {
  const i = insights
  const items: { title: string; value: string; icon?: { src: string | null; name: string } }[] = []
  if (i?.longestFocusPeriod && i.longestFocusPeriod.end - i.longestFocusPeriod.start >= 60_000)
    items.push({
      title: 'Longest focus period',
      value: `${fmtTime(i.longestFocusPeriod.start)} to ${fmtTime(i.longestFocusPeriod.end)} · ${fmtDuration(i.longestFocusPeriod.end - i.longestFocusPeriod.start)}`
    })
  if (i?.highestUsageBlock && i.highestUsageBlock.activeMs >= 60_000)
    items.push({
      title: 'Highest usage period',
      value: `${fmtHour(i.highestUsageBlock.startHour)} to ${fmtHour(i.highestUsageBlock.endHour)} · ${fmtDuration(i.highestUsageBlock.activeMs)} active`
    })
  if (i?.mostUsedApp && i.mostUsedApp.ms >= 60_000)
    items.push({
      title: 'Most used application',
      value: `${i.mostUsedApp.name}, ${fmtDuration(i.mostUsedApp.ms)} ${period}`,
      icon: { src: i.mostUsedApp.icon, name: i.mostUsedApp.name }
    })
  if (i?.mostFrequentSwitch)
    items.push({ title: 'Most frequent switch', value: `${i.mostFrequentSwitch.fromApp} to ${i.mostFrequentSwitch.toApp} · ${i.mostFrequentSwitch.count} times` })
  if (i && i.lateNightMs >= 60_000) items.push({ title: 'Late-night usage', value: `${fmtDuration(i.lateNightMs)} ${period} between 11 PM and 5 AM` })

  return (
    <Card title="Usage insights">
      {!i || items.length === 0 ? (
        <Empty title="Not enough activity yet" hint="Insights appear once there is some recorded usage." />
      ) : (
        <div className="grid grid-cols-2 gap-x-8">
          {items.map((it) => (
            <div key={it.title} className="py-3 border-b border-border flex items-start gap-3">
              {it.icon && <AppIcon icon={it.icon.src} name={it.icon.name} size={22} />}
              <div>
                <div className="text-[13.5px] font-medium">{it.title}</div>
                <div className="text-[13px] text-secondary mt-0.5 num">{it.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function deltaLine(cur: number, prev: number, what: string, period = 'that period'): { text: string; tone: 'good' | 'bad' | 'muted' } {
  if (prev < 60_000) return { text: `Nothing recorded ${period} to compare with`, tone: 'muted' }
  const d = cur - prev
  if (Math.abs(d) < 60_000) return { text: `Same as ${what}`, tone: 'muted' }
  const pctv = Math.round((Math.abs(d) / prev) * 100)
  return d > 0 ? { text: `${fmtDuration(d)} more (${pctv}%) than ${what}`, tone: 'bad' } : { text: `${fmtDuration(-d)} less (${pctv}%) than ${what}`, tone: 'good' }
}

/** This week against last week: grouped bars per weekday and the headline deltas. */
function CompareWeeks({ current, previous, isCurrentWeek }: { current: WeeklyReport | null; previous: WeeklyReport | null; isCurrentWeek: boolean }): JSX.Element | null {
  if (!current || !previous) return null
  const labels = current.days.map((d) => weekdayShort(d.day))
  // For the running week only compare the days that have happened so far.
  const elapsed = isCurrentWeek ? current.days.filter((d) => d.day <= today()).length : 7
  const curSoFar = current.days.slice(0, elapsed).reduce((s, d) => s + d.screenMs, 0)
  const prevSoFar = previous.days.slice(0, elapsed).reduce((s, d) => s + d.screenMs, 0)
  const total = deltaLine(curSoFar, prevSoFar, isCurrentWeek ? 'the same days last week' : 'last week', 'last week')
  const active = deltaLine(
    current.days.slice(0, elapsed).reduce((s, d) => s + d.activeMs, 0),
    previous.days.slice(0, elapsed).reduce((s, d) => s + d.activeMs, 0),
    'last week',
    'last week'
  )
  const tone = { good: 'text-success', bad: 'text-warning', muted: 'text-secondary' }
  return (
    <Card title="This week vs last week" className="mb-3">
      <div className="grid grid-cols-[1fr_260px] gap-6 items-start">
        <CompareBars current={current.days.map((d) => ({ label: d.day, ms: d.screenMs }))} previous={previous.days.map((d) => ({ label: d.day, ms: d.screenMs }))} labels={labels} height={200} />
        <div className="flex flex-col gap-4 pt-1">
          <div>
            <div className="label">Screen time</div>
            <div className="num text-[22px] font-semibold mt-1">{fmtDuration(curSoFar)}</div>
            <div className={`text-[12.5px] mt-1 ${tone[total.tone]}`}>{total.text}</div>
          </div>
          <div>
            <div className="label">Active time</div>
            <div className={`text-[12.5px] mt-1 ${tone[active.tone]}`}>{active.text}</div>
          </div>
          <div>
            <div className="label">Daily average</div>
            <div className="text-[12.5px] mt-1 text-secondary num">
              {fmtDuration(Math.round(curSoFar / Math.max(1, elapsed)))} now · {fmtDuration(Math.round(previous.totalMs / 7))} last week
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Month against the previous month, on the same number of elapsed days when the month is still running. */
function MonthCompare({ current, previous, isCurrentMonth }: { current: MonthlyReport | null; previous: MonthlyReport | null; isCurrentMonth: boolean }): JSX.Element | null {
  if (!current || !previous) return null
  const elapsed = isCurrentMonth ? current.days.filter((d) => d.day <= today()).length : current.days.length
  const cur = current.days.slice(0, elapsed).reduce((s, d) => s + d.screenMs, 0)
  const prev = previous.days.slice(0, Math.min(elapsed, previous.days.length)).reduce((s, d) => s + d.screenMs, 0)
  const total = deltaLine(cur, prev, isCurrentMonth ? 'the same days last month' : 'last month', 'last month')
  const curAvg = Math.round(cur / Math.max(1, current.days.slice(0, elapsed).filter((d) => d.screenMs > 0).length))
  const prevAvg = Math.round(previous.totalMs / Math.max(1, previous.activeDays))
  const avg = deltaLine(curAvg, prevAvg, 'last month', 'last month')
  const tone = { good: 'text-success', bad: 'text-warning', muted: 'text-secondary' }
  if (prev < 60_000 && cur < 60_000) return null
  return (
    <Card title="Compared with last month" className="mb-3">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="label">Screen time</div>
          <div className={`text-[13px] mt-1 ${tone[total.tone]}`}>{total.text}</div>
        </div>
        <div>
          <div className="label">Per active day</div>
          <div className={`text-[13px] mt-1 ${tone[avg.tone]}`}>{avg.text}</div>
        </div>
      </div>
    </Card>
  )
}

/** Weeks of the month as bars, plus weekday versus weekend averages. */
function MonthWeeks({ report }: { report: MonthlyReport | null }): JSX.Element {
  if (!report) return <Card title="By week">{null}</Card>
  const weeks: { label: string; ms: number }[] = []
  let bucket = 0
  let start = report.days[0]?.day ?? ''
  report.days.forEach((d, i) => {
    bucket += d.screenMs
    const dow = new Date(dayStartLocal(d.day)).getDay()
    const last = i === report.days.length - 1
    if (dow === 0 || last) {
      weeks.push({ label: `${fmtDayShort(start)}–${fmtDayShort(d.day)}`, ms: bucket })
      bucket = 0
      start = report.days[i + 1]?.day ?? ''
    }
  })
  const wd = report.days.filter((d) => ![0, 6].includes(new Date(dayStartLocal(d.day)).getDay()) && d.screenMs > 0)
  const we = report.days.filter((d) => [0, 6].includes(new Date(dayStartLocal(d.day)).getDay()) && d.screenMs > 0)
  const avg = (xs: typeof wd): number => (xs.length ? Math.round(xs.reduce((s, d) => s + d.screenMs, 0) / xs.length) : 0)
  const max = Math.max(...weeks.map((w) => w.ms), 1)
  return (
    <Card title="By week">
      <ul className="flex flex-col gap-2.5">
        {weeks.map((w) => (
          <li key={w.label} className="flex items-center gap-3 text-[13px]">
            <span className="w-[120px] text-secondary num truncate">{w.label}</span>
            <div className="flex-1 h-[6px] rounded-full bg-[var(--card-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(w.ms / max) * 100}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-[64px] text-right num">{fmtDuration(w.ms)}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-border">
        <div>
          <div className="label">Weekday average</div>
          <div className="num text-[20px] font-semibold mt-1">{fmtDuration(avg(wd))}</div>
        </div>
        <div>
          <div className="label">Weekend average</div>
          <div className="num text-[20px] font-semibold mt-1">{fmtDuration(avg(we))}</div>
        </div>
      </div>
    </Card>
  )
}

function dayStartLocal(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
