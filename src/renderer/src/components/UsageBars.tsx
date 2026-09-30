import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint } from '../../../shared/types'
import { fmtDuration, fmtHour, today, weekdayShort } from '@/lib/format'
import { ACCENT, IDLE } from '@/lib/palette'
import { useThemeColors } from '@/lib/hooks'

function hoursTick(ms: number): string {
  const h = ms / 3_600_000
  if (h === 0) return '0'
  return h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h * 10) / 10}h`
}

function niceMax(maxMs: number): number {
  const h = maxMs / 3_600_000
  if (h <= 0) return 3_600_000
  const steps = [0.5, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24]
  const top = steps.find((s) => s >= h) ?? Math.ceil(h)
  return top * 3_600_000
}

export function UsageBars({
  data,
  height = 200,
  showIdle = true,
  onSelectDay
}: {
  data: DailyPoint[]
  height?: number
  showIdle?: boolean
  /** Makes the bars clickable; called with the day of the clicked bar. */
  onSelectDay?: (day: string) => void
}): JSX.Element {
  const pick = (d: unknown): void => {
    const day = (d as { payload?: { day?: string } } | null)?.payload?.day
    if (day && onSelectDay) onSelectDay(day)
  }
  const c = useThemeColors()
  const accent = c(ACCENT)
  const idle = c(IDLE)
  const grid = c('var(--border)')
  const tick = c('var(--secondary)')
  const surface = c('var(--card)')
  const rows = data.map((d) => ({ ...d, name: weekdayShort(d.day), isToday: d.day === today() }))
  const max = niceMax(Math.max(...rows.map((r) => (showIdle ? r.screenMs : r.activeMs)), 0))
  const ticks = [0, max / 2, max]
  return (
    <div style={{ height, cursor: onSelectDay ? 'pointer' : undefined }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={grid} strokeWidth={1} />
          <XAxis dataKey="name" tick={{ fill: tick, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={hoursTick}
            ticks={ticks}
            domain={[0, max]}
            tick={{ fill: c('var(--muted)'), fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip
            cursor={{ fill: c('var(--control)') }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof rows)[number]
              return (
                <div className="card px-3 py-2 text-[12.5px] shadow-xl">
                  <div className="font-medium">{p.isToday ? 'Today' : p.name}</div>
                  <div className="text-secondary num mt-0.5">Active {fmtDuration(p.activeMs)}</div>
                  {showIdle && <div className="text-secondary num">Idle {fmtDuration(p.idleMs)}</div>}
                </div>
              )
            }}
          />
          <Bar dataKey="activeMs" stackId="a" fill={accent} maxBarSize={24} radius={showIdle ? 0 : [4, 4, 0, 0]} isAnimationActive={false} onClick={pick} />
          {showIdle && (
            <Bar dataKey="idleMs" stackId="a" fill={idle} maxBarSize={24} radius={[4, 4, 0, 0]} stroke={surface} strokeWidth={2} isAnimationActive={false} onClick={pick} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {showIdle && (
        <div className="flex gap-4 mt-1 text-[11.5px] text-secondary justify-end">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: accent }} /> Active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: idle }} /> Idle
          </span>
        </div>
      )}
    </div>
  )
}

/** 24 bars of active time per clock hour, single hue. Hover a bar for the hour and its total. */
export function HourlyStrip({ hourly, height = 56 }: { hourly: number[]; height?: number }): JSX.Element {
  const max = Math.max(...hourly, 1)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div>
      {/* Columns stretch to the row height so the bars' percentage heights have something to resolve against. */}
      <div className="flex gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {hourly.map((v, h) => (
          <div key={h} className="flex-1 flex items-end h-full" onMouseEnter={() => setHover(h)}>
            <div
              className="w-full rounded-t-[3px] transition-opacity"
              style={{
                height: `${Math.max(v > 0 ? 4 : 2, (v / max) * 100)}%`,
                background: v > 0 ? ACCENT : 'var(--border-2)',
                opacity: hover !== null && hover !== h ? 0.45 : 1
              }}
            />
          </div>
        ))}
      </div>
      <div className="relative flex justify-between text-[10.5px] text-muted mt-1 num h-4">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
        {hover !== null && (
          <span className="absolute right-0 top-4 text-secondary">
            {fmtHour(hover)} · {hourly[hover] > 0 ? `${fmtDuration(hourly[hover])} active` : 'nothing'}
          </span>
        )}
      </div>
    </div>
  )
}

/** Two periods side by side (screen time per slot). Current period in the accent, previous in the neutral tone. */
export function CompareBars({
  current,
  previous,
  labels,
  height = 220,
  legend = ['This week', 'Last week']
}: {
  current: { label: string; ms: number }[]
  previous: { label: string; ms: number }[]
  labels?: string[]
  height?: number
  legend?: [string, string]
}): JSX.Element {
  const c = useThemeColors()
  const accent = c(ACCENT)
  const prev = c('var(--neutral)')
  const rows = current.map((d, i) => ({ name: labels?.[i] ?? d.label, cur: d.ms, prev: previous[i]?.ms ?? 0 }))
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.cur, r.prev)), 0))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid vertical={false} stroke={c('var(--border)')} strokeWidth={1} />
          <XAxis dataKey="name" tick={{ fill: c('var(--secondary)'), fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={hoursTick} ticks={[0, max / 2, max]} domain={[0, max]} tick={{ fill: c('var(--muted)'), fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
          <Tooltip
            cursor={{ fill: c('var(--control)') }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof rows)[number]
              return (
                <div className="card px-3 py-2 text-[12.5px] shadow-xl">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-secondary num mt-0.5">
                    {legend[0]} {fmtDuration(p.cur)}
                  </div>
                  <div className="text-secondary num">
                    {legend[1]} {fmtDuration(p.prev)}
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="prev" fill={prev} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="cur" fill={accent} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-1 text-[11.5px] text-secondary justify-end">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: accent }} /> {legend[0]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: prev }} /> {legend[1]}
        </span>
      </div>
    </div>
  )
}
