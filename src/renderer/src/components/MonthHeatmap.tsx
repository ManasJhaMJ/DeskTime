import { useState } from 'react'
import type { DailyPoint } from '../../../shared/types'
import { dayStart, fmtDay, fmtDuration, today } from '@/lib/format'

// Sequential ramp: one hue (the accent), stepped from near-surface to full. Zero uses the border tone.
const STEPS = [0.18, 0.34, 0.52, 0.74, 1].map((a) => `rgba(var(--accent-rgb), ${a})`)
const ZERO = 'var(--card-2)'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function step(ms: number, max: number): string {
  if (ms <= 0 || max <= 0) return ZERO
  const r = ms / max
  return STEPS[Math.min(STEPS.length - 1, Math.floor(r * STEPS.length))]
}

export function MonthHeatmap({ days, onSelectDay }: { days: DailyPoint[]; onSelectDay?: (day: string) => void }): JSX.Element {
  const [hover, setHover] = useState<DailyPoint | null>(null)
  if (!days.length) return <div className="text-secondary text-[13px] py-6 text-center">No data.</div>
  const max = Math.max(...days.map((d) => d.screenMs))
  const t = today()
  // Monday-first offset for the first day of the month
  const lead = (new Date(dayStart(days[0].day)).getDay() + 6) % 7
  const cells: (DailyPoint | null)[] = [...Array<null>(lead).fill(null), ...days]
  while (cells.length % 7) cells.push(null)

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-[11px] text-muted mb-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) =>
          c === null ? (
            <div key={`e${i}`} />
          ) : (
            <div
              key={c.day}
              className={`relative aspect-[1.6] rounded-md flex items-start justify-end p-1.5 text-[11.5px] num ${onSelectDay && c.day <= t ? 'cursor-pointer hover:brightness-110' : ''}`}
              onClick={() => onSelectDay && c.day <= t && onSelectDay(c.day)}
              style={{
                background: step(c.screenMs, max),
                color: c.screenMs / max > 0.6 ? '#fff' : 'var(--secondary)',
                opacity: c.day > t ? 0.35 : 1,
                outline: c.day === t ? '1px solid var(--accent)' : undefined,
                outlineOffset: 1
              }}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              title=""
            >
              {Number(c.day.slice(8))}
              {c.screenMs > 0 && (
                <span className="absolute left-1.5 bottom-1 text-[10.5px]" style={{ color: c.screenMs / max > 0.6 ? 'rgba(255,255,255,0.85)' : 'var(--secondary)' }}>
                  {fmtDuration(c.screenMs)}
                </span>
              )}
            </div>
          )
        )}
      </div>
      <div className="flex items-center justify-between mt-3 text-[11.5px] text-secondary">
        <div className="num min-h-[16px]">
          {hover && hover.screenMs > 0
            ? `${fmtDay(hover.day)} · ${fmtDuration(hover.screenMs)} screen · ${fmtDuration(hover.activeMs)} active · ${fmtDuration(hover.idleMs)} idle`
            : hover
              ? `${fmtDay(hover.day)} · nothing recorded`
              : onSelectDay
              ? 'Hover a day for details, click for its applications'
              : 'Hover a day for details'}
        </div>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {[ZERO, ...STEPS].map((c) => (
            <span key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
