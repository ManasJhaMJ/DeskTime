import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CategoryUsage, DayTypeMix, Insights, MonthlyReport, Records, WeeklyReport, YearlyReport } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { addDays, addMonths, fmtDay, fmtDayShort, fmtDuration, fmtHour, fmtMonth, fmtTime, monthOf, today, weekStart, weekdayShort } from '@/lib/format'
import { AppIcon, Card, Empty, Page, PageHeader, Segmented, StatTile, Tooltip } from '@/components/ui'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'
import { CompareBars, UsageBars } from '@/components/UsageBars'
import { MonthHeatmap } from '@/components/MonthHeatmap'
import { DayGlance } from '@/components/DayGlance'

type Tab = 'weekly' | 'monthly' | 'yearly'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Weekly, monthly and yearly patterns. The day-level view lives on the Timeline. */
export function Reports(): JSX.Element {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | 'daily' | null
    return t && t !== 'daily' ? t : 'weekly'
  })
  const [week, setWeek] = useState(weekStart(today()))
  const weekEnd = addDays(week, 6)
  const isCurrentWeek = week === weekStart(today())
  const [month, setMonth] = useState(monthOf(today()))
  const isCurrentMonth = month === monthOf(today())
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  const thisYear = Number(today().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const isCurrentYear = year === thisYear
  /** Day opened at a glance from one of the graphs. */
  const [glance, setGlanceState] = useState<{ day: string; at: 'graph' | 'records' } | null>(null)
  const setGlance = (day: string | null, at: 'graph' | 'records' = 'graph'): void => setGlanceState(day ? { day, at } : null)
  const glanceDay = glance?.day ?? null
  useEffect(() => setGlanceState(null), [tab, week, month, year])
  /** The glance is its own full-width box under the block it was opened from, so graphs keep their size. */
  const glanceBox = (at: 'graph' | 'records'): JSX.Element | null => (glance && glance.at === at ? <DayGlance day={glance.day} onClose={() => setGlance(null)} /> : null)

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

  const yearly = usePoll<YearlyReport>(() => window.api.yearly(year), [year], isCurrentYear ? 120_000 : 600_000)
  const prevYear = usePoll<YearlyReport>(() => window.api.yearly(year - 1), [year], 600_000)
  const yearCats = usePoll<CategoryUsage[]>(() => window.api.rangeCategories(`${year}-01-01`, `${year}-12-31`), [year], isCurrentYear ? 300_000 : 600_000)
  const yearMix = usePoll<DayTypeMix>(() => window.api.dayTypeMix(`${year}-01-01`, `${year}-12-31`), [year], isCurrentYear ? 300_000 : 600_000)
  const monthMix = usePoll<DayTypeMix>(
    () => window.api.dayTypeMix(`${month}-01`, `${month}-${String(monthDays).padStart(2, '0')}`),
    [month],
    isCurrentMonth ? 120_000 : 600_000
  )
  const records = usePoll<Records>(() => window.api.records(), [], 300_000)

  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle="Patterns, not scores. Click a day in any graph to see it at a glance."
        right={
          <div className="flex items-center gap-3">
            <Segmented<Tab>
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' }
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'yearly' ? (
              <PeriodNav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} onReset={() => setYear(thisYear)} atEnd={isCurrentYear} unit="year" />
            ) : tab === 'monthly' ? (
              <PeriodNav label={fmtMonth(month)} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onReset={() => setMonth(monthOf(today()))} atEnd={isCurrentMonth} unit="month" />
            ) : (
              <PeriodNav
                label={`${fmtDayShort(week)} to ${fmtDayShort(weekEnd)}`}
                onPrev={() => setWeek(addDays(week, -7))}
                onNext={() => setWeek(addDays(week, 7))}
                onReset={() => setWeek(weekStart(today()))}
                atEnd={isCurrentWeek}
                unit="week"
              />
            )}
          </div>
        }
      />

      {tab === 'yearly' ? (
        <>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <StatTile label="Year total" value={yearly.data ? fmtDuration(yearly.data.totalMs) : '—'} sub="Screen time" />
            <StatTile
              label="Daily average"
              value={yearly.data ? fmtDuration(yearly.data.activeDays ? Math.round(yearly.data.totalMs / yearly.data.activeDays) : 0) : '—'}
              sub={yearly.data ? `Across ${yearly.data.activeDays} active day${yearly.data.activeDays === 1 ? '' : 's'}` : undefined}
            />
            <StatTile label="Active" value={yearly.data ? fmtDuration(yearly.data.activeMs) : '—'} sub={yearly.data ? `${fmtDuration(yearly.data.idleMs)} idle` : undefined} />
            <StatTile
              label="Busiest month"
              value={yearly.data?.busiestMonth ? fmtDuration(yearly.data.busiestMonth.screenMs) : '—'}
              sub={yearly.data?.busiestMonth ? fmtMonth(yearly.data.busiestMonth.month) : 'No activity yet'}
            />
          </div>
          <Card title="Month by month" className="mb-3">
            <CompareBars
              current={(yearly.data?.months ?? []).map((m) => ({ label: m.month, ms: m.screenMs }))}
              previous={(prevYear.data?.months ?? []).map((m) => ({ label: m.month, ms: m.screenMs }))}
              labels={MONTHS}
              height={240}
              legend={[String(year), String(year - 1)]}
            />
          </Card>
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <WeekdayPattern report={yearly.data} onSelectDay={(d) => setGlance(d)} />
            <Card title="Top applications">
              {!yearly.data?.topApps.length ? (
                <Empty title="No usage this year" />
              ) : (
                <ul className="text-[13.5px]">
                  {yearly.data.topApps.map((a) => (
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
          {glanceBox('graph')}
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <YearCompare current={yearly.data} previous={prevYear.data} isCurrentYear={isCurrentYear} />
            <CategoryBreakdown cats={yearCats.data ?? []} />
          </div>
          <DayTypeCard mix={yearMix.data} className="mb-3" />
          <RecordsCard records={records.data} glance={glanceDay} onSelectDay={(d) => setGlance(d, 'records')} />
          <div className="mt-3">{glanceBox('records')}</div>
        </>
      ) : tab === 'monthly' ? (
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
              <MonthHeatmap days={monthly.data?.days ?? []} onSelectDay={(d) => setGlance(d)} />
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
          {glanceBox('graph')}
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <MonthWeeks report={monthly.data} />
            <CategoryBreakdown cats={monthCats.data ?? []} />
          </div>
          <DayTypeCard mix={monthMix.data} className="mb-3" />
          <InsightsCard insights={monthInsights.data} period="this month" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatTile label="Weekly total" value={weekly.data ? fmtDuration(weekly.data.totalMs) : '—'} sub="Screen time" />
            <StatTile label="Active" value={weekly.data ? fmtDuration(weekly.data.activeMs) : '—'} sub={weekly.data ? `${fmtDuration(Math.round(weekly.data.activeMs / 7))} per day` : undefined} />
            <StatTile label="Idle" value={weekly.data ? fmtDuration(weekly.data.idleMs) : '—'} />
          </div>
          <div className="grid grid-cols-[1fr_320px] gap-3 mb-3">
            <Card title="This week">
              <UsageBars data={weekly.data?.days ?? []} height={230} onSelectDay={(d) => setGlance(d)} />
            </Card>
            <Card title="By day">
              <ul className="text-[13.5px]">
                {(weekly.data?.days ?? []).map((d) => (
                  <li key={d.day}>
                    <button
                      className={`w-full flex items-center justify-between py-[7px] border-b border-border last:border-b-0 text-left hover:text-accent transition-colors ${glanceDay === d.day ? 'text-accent' : ''}`}
                      onClick={() => setGlance(glanceDay === d.day ? null : d.day)}
                      disabled={d.day > today()}
                    >
                      <span className={d.day === today() ? 'text-primary' : d.day > today() ? 'text-muted' : 'text-secondary'}>
                        {weekdayShort(d.day)} <span className="text-muted text-[12px] ml-1">{fmtDayShort(d.day)}</span>
                      </span>
                      <span className="num">{fmtDuration(d.screenMs)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {glanceBox('graph')}
          <CompareWeeks current={weekly.data} previous={lastWeek.data} isCurrentWeek={isCurrentWeek} />
          <InsightsCard insights={weekInsights.data} period="this week" />
        </>
      )}
    </Page>
  )
}

/** Previous / label / next control shared by the three tabs. */
function PeriodNav({ label, onPrev, onNext, onReset, atEnd, unit }: { label: string; onPrev: () => void; onNext: () => void; onReset: () => void; atEnd: boolean; unit: string }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <button className="btn btn-ghost !px-2 !py-1.5" onClick={onPrev} aria-label={`Previous ${unit}`}>
        <ChevronLeft size={16} />
      </button>
      <Tooltip text={`Jump to this ${unit}`}>
        <button className="min-w-[150px] text-center text-[13px] px-2 py-1.5 rounded-md hover:bg-card-2" onClick={onReset}>
          {label}
        </button>
      </Tooltip>
      <button className="btn btn-ghost !px-2 !py-1.5" onClick={onNext} disabled={atEnd} aria-label={`Next ${unit}`}>
        <ChevronRight size={16} />
      </button>
    </div>
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
const TONE = { good: 'text-success', bad: 'text-warning', muted: 'text-secondary' }

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
  return (
    <Card title="This week vs last week" className="mb-3">
      <div className="grid grid-cols-[1fr_260px] gap-6 items-start">
        <CompareBars current={current.days.map((d) => ({ label: d.day, ms: d.screenMs }))} previous={previous.days.map((d) => ({ label: d.day, ms: d.screenMs }))} labels={labels} height={200} />
        <div className="flex flex-col gap-4 pt-1">
          <div>
            <div className="label">Screen time</div>
            <div className="num text-[22px] font-semibold mt-1">{fmtDuration(curSoFar)}</div>
            <div className={`text-[12.5px] mt-1 ${TONE[total.tone]}`}>{total.text}</div>
          </div>
          <div>
            <div className="label">Active time</div>
            <div className={`text-[12.5px] mt-1 ${TONE[active.tone]}`}>{active.text}</div>
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
  if (prev < 60_000 && cur < 60_000) return null
  return (
    <Card title="Compared with last month" className="mb-3">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="label">Screen time</div>
          <div className={`text-[13px] mt-1 ${TONE[total.tone]}`}>{total.text}</div>
        </div>
        <div>
          <div className="label">Per active day</div>
          <div className={`text-[13px] mt-1 ${TONE[avg.tone]}`}>{avg.text}</div>
        </div>
      </div>
    </Card>
  )
}

/** Year against the previous year, on the same elapsed part of the year while it is still running. */
function YearCompare({ current, previous, isCurrentYear }: { current: YearlyReport | null; previous: YearlyReport | null; isCurrentYear: boolean }): JSX.Element {
  if (!current || !previous) return <Card title="Compared with last year">{null}</Card>
  const cutoff = isCurrentYear ? `${previous.year}-${today().slice(5)}` : `${previous.year}-12-31`
  const prevDays = previous.days.filter((d) => d.day <= cutoff)
  const cur = current.totalMs
  const prev = prevDays.reduce((s, d) => s + d.screenMs, 0)
  const total = deltaLine(cur, prev, isCurrentYear ? 'the same part of last year' : 'last year', 'last year')
  const curAvg = Math.round(cur / Math.max(1, current.activeDays))
  const prevAvg = Math.round(prev / Math.max(1, prevDays.filter((d) => d.screenMs > 0).length))
  const avg = deltaLine(curAvg, prevAvg, 'last year', 'last year')
  const busiest = current.busiestDay
  return (
    <Card title="Compared with last year">
      {prev < 60_000 && cur < 60_000 ? (
        <Empty title="Nothing to compare yet" />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="label">Screen time</div>
            <div className={`text-[13px] mt-1 ${TONE[total.tone]}`}>{total.text}</div>
          </div>
          <div>
            <div className="label">Per active day</div>
            <div className={`text-[13px] mt-1 ${TONE[avg.tone]}`}>{avg.text}</div>
          </div>
          <div>
            <div className="label">Active days</div>
            <div className="text-[13px] mt-1 text-secondary num">
              {current.activeDays} this year · {prevDays.filter((d) => d.screenMs > 0).length} last year
            </div>
          </div>
          {busiest && (
            <div className="col-span-3 text-[12.5px] text-secondary num">
              Busiest day {fmtDay(busiest.day)} · {fmtDuration(busiest.screenMs)}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/** Average screen time per weekday over the year, and the busiest day as a shortcut to its glance. */
function WeekdayPattern({ report, onSelectDay }: { report: YearlyReport | null; onSelectDay: (day: string) => void }): JSX.Element {
  if (!report) return <Card title="By weekday">{null}</Card>
  const max = Math.max(...report.weekdayAvg, 1)
  // Averages over the days that actually had use, not over the seven per-weekday figures: with only a few days of
  // data, weekdays without any would otherwise drag the mean down.
  const isWeekend = (day: string): boolean => [0, 6].includes(new Date(dayStartLocal(day)).getDay())
  const avgOf = (days: typeof report.days): number => (days.length ? Math.round(days.reduce((s, d) => s + d.screenMs, 0) / days.length) : 0)
  const wd = avgOf(report.days.filter((d) => d.screenMs > 0 && !isWeekend(d.day)))
  const we = avgOf(report.days.filter((d) => d.screenMs > 0 && isWeekend(d.day)))
  return (
    <Card title="By weekday" right={<span className="text-[12px] text-muted">Average screen time on days you used the PC</span>}>
      <ul className="flex flex-col gap-2.5">
        {report.weekdayAvg.map((ms, i) => (
          <li key={i} className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-secondary">{WEEKDAYS[i]}</span>
            <div className="flex-1 h-[6px] rounded-full bg-[var(--card-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(ms / max) * 100}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-[64px] text-right num">{fmtDuration(ms)}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-border">
        <div>
          <div className="label">Weekday average</div>
          <div className="num text-[20px] font-semibold mt-1">{fmtDuration(wd)}</div>
        </div>
        <div>
          <div className="label">Weekend average</div>
          <div className="num text-[20px] font-semibold mt-1">{fmtDuration(we)}</div>
        </div>
        <div>
          <div className="label">Busiest day</div>
          {report.busiestDay ? (
            <button className="num text-[20px] font-semibold mt-1 hover:text-accent transition-colors text-left" onClick={() => onSelectDay(report.busiestDay!.day)}>
              {fmtDuration(report.busiestDay.screenMs)}
              <span className="block text-[11.5px] text-muted font-normal">{fmtDay(report.busiestDay.day)}</span>
            </button>
          ) : (
            <div className="num text-[20px] font-semibold mt-1">—</div>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Top applications on weekdays beside weekends, as an average per day of each type. */
function DayTypeCard({ mix, className = '' }: { mix: DayTypeMix | null; className?: string }): JSX.Element {
  const col = (title: string, days: number, apps: DayTypeMix['weekday']): JSX.Element => {
    const max = Math.max(...apps.map((a) => a.perDayMs), 1)
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13.5px] font-medium">{title}</span>
          <span className="text-[11.5px] text-muted num">
            {days} day{days === 1 ? '' : 's'} · average per day
          </span>
        </div>
        {apps.length === 0 ? (
          <div className="text-[12.5px] text-muted py-3">Nothing recorded.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 text-[13px]">
                <AppIcon icon={a.icon} name={a.name} appId={a.id} size={20} />
                <span className="w-[130px] truncate">{a.name}</span>
                <div className="flex-1 h-[6px] rounded-full bg-[var(--card-2)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(a.perDayMs / max) * 100}%`, background: 'var(--accent)' }} />
                </div>
                <span className="w-[56px] text-right num text-secondary">{fmtDuration(a.perDayMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <Card title="Weekdays vs weekends" className={className} right={<span className="text-[12px] text-muted">What you reach for on a work day, and what on a day off</span>}>
      {!mix ? null : mix.weekdayDays + mix.weekendDays === 0 ? (
        <Empty title="No usage in this period" />
      ) : (
        <div className="grid grid-cols-2 gap-8">
          {col('Weekdays', mix.weekdayDays, mix.weekday)}
          {col('Weekends', mix.weekendDays, mix.weekend)}
        </div>
      )}
    </Card>
  )
}

/** All-time bests, each with the day it happened on; clicking the day opens it at a glance. */
function RecordsCard({ records, glance, onSelectDay }: { records: Records | null; glance: string | null; onSelectDay: (day: string) => void }): JSX.Element {
  const r = records
  const items: { title: string; value: string; day: string; sub?: string }[] = []
  if (r?.longestDay) items.push({ title: 'Longest day', value: fmtDuration(r.longestDay.value), day: r.longestDay.day, sub: 'screen time' })
  if (r?.mostActiveDay) items.push({ title: 'Most active day', value: fmtDuration(r.mostActiveDay.value), day: r.mostActiveDay.day, sub: 'active time' })
  if (r?.longestSession) items.push({ title: 'Longest session', value: fmtDuration(r.longestSession.value), day: r.longestSession.day, sub: `from ${fmtTime(r.longestSession.start)}` })
  if (r?.mostSwitches) items.push({ title: 'Most app switches', value: String(r.mostSwitches.value), day: r.mostSwitches.day, sub: 'in one day' })
  if (r?.earliestStart) items.push({ title: 'Earliest start', value: fmtTime(r.earliestStart.value), day: r.earliestStart.day, sub: 'first activity' })
  if (r?.latestFinish) items.push({ title: 'Latest finish', value: fmtTime(r.latestFinish.value), day: r.latestFinish.day, sub: 'last activity' })
  return (
    <Card title="Personal records" right={<span className="text-[12px] text-muted">All time · click a date to see the day</span>}>
      {!r ? null : items.length === 0 ? (
        <Empty title="No records yet" hint="They appear after the first recorded day." />
      ) : (
        <div className="grid grid-cols-3 gap-x-8">
          {items.map((it) => (
            <div key={it.title} className="py-3 border-b border-border">
              <div className="label">{it.title}</div>
              <div className="num text-[22px] font-semibold mt-1.5 leading-none">
                {it.value}
                {it.sub && <span className="ml-2 text-[11.5px] text-muted font-normal">{it.sub}</span>}
              </div>
              <button className={`mt-1.5 text-[12.5px] transition-colors ${glance === it.day ? 'text-accent' : 'text-secondary hover:text-accent'}`} onClick={() => onSelectDay(it.day)}>
                {fmtDay(it.day)}
              </button>
            </div>
          ))}
        </div>
      )}
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
