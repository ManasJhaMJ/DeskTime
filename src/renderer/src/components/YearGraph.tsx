import { useMemo, useState } from 'react'
import type { StreakStatus } from '../../../shared/types'
import { addDays, dayStart, fmtDay, fmtDuration, today } from '@/lib/format'

const CELL = 11
const GAP = 3
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FROZEN = 'color-mix(in srgb, var(--accent) 45%, var(--card-2))'
const MISSED = 'color-mix(in srgb, var(--danger) 45%, var(--card-2))'

/**
 * GitHub-style graph of one calendar year: week columns from the Monday on or before Jan 1 to Dec 31, Monday at the
 * top. In screen mode cells shade by screen time; in streak mode they show hits, misses, frozen days and today.
 */
export function YearGraph({
  year,
  screen,
  streak,
  onSelectDay
}: {
  year: number
  screen: Map<string, number>
  streak?: StreakStatus | null
  /** Makes recorded days clickable. */
  onSelectDay?: (day: string) => void
}): JSX.Element {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null)
  const t = today()
  const first = `${year}-01-01`
  const last = `${year}-12-31`
  const start = useMemo(() => {
    const dow = (new Date(dayStart(first)).getDay() + 6) % 7
    return addDays(first, -dow)
  }, [first])
  const columns = useMemo(() => {
    const cols: string[][] = []
    for (let d = start; d <= last; ) {
      const col: string[] = []
      for (let i = 0; i < 7; i++) {
        col.push(d)
        d = addDays(d, 1)
      }
      cols.push(col)
    }
    return cols
  }, [start, last])
  const max = useMemo(() => Math.max(1, ...screen.values()), [screen])
  const streakDays = useMemo(() => new Map((streak?.days ?? []).map((d) => [d.day, d])), [streak])

  // Month label above the first column that contains the 1st of a month.
  const monthLabels = columns.map((col) => {
    const firstOfMonth = col.find((d) => d.endsWith('-01') && d >= first && d <= last)
    return firstOfMonth ? MONTHS[Number(firstOfMonth.slice(5, 7)) - 1] : ''
  })

  const cellStyle = (day: string): { background: string; outline?: string; opacity?: number } => {
    if (day > t || day < first || day > last) return { background: 'transparent' }
    if (streak) {
      const d = streakDays.get(day)
      if (!d) return { background: 'var(--card-2)', opacity: 0.6 }
      if (d.frozen) return { background: FROZEN }
      if (d.ok === true) return { background: 'var(--accent)' }
      if (d.ok === false) return { background: MISSED }
      return { background: 'var(--card-2)', outline: '1.5px solid var(--accent)' }
    }
    const ms = screen.get(day) ?? 0
    if (ms <= 0) return { background: 'var(--card-2)' }
    const level = Math.min(4, Math.max(1, Math.ceil((ms / max) * 4)))
    return { background: `rgba(var(--accent-rgb), ${[0, 0.28, 0.5, 0.74, 1][level]})` }
  }

  const width = columns.length * (CELL + GAP) - GAP
  const hoverText = (day: string): string => {
    if (streak) {
      const d = streakDays.get(day)
      if (!d) return 'No data'
      const v = fmtDuration(d.value * 60_000)
      if (d.frozen) return `Frozen · ${v}`
      return d.ok === true ? `Hit · ${v}` : d.ok === false ? `Missed · ${v}` : `Today so far · ${v}`
    }
    const ms = screen.get(day) ?? 0
    return ms > 0 ? `${fmtDuration(ms)} screen time` : 'No screen time'
  }

  return (
    <div className="relative select-none" data-year-graph onMouseLeave={() => setHover(null)}>
      <div className="flex gap-2">
        <div className="flex flex-col text-[10.5px] text-muted pt-[18px]" style={{ gap: GAP }}>
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((l, i) => (
            <div key={i} style={{ height: CELL, lineHeight: `${CELL}px` }} className="w-6">
              {l}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div style={{ width }}>
            <div className="relative h-[14px] text-[10.5px] text-muted">
              {monthLabels.map(
                (m, i) =>
                  m && (
                    <span key={i} className="absolute" style={{ left: i * (CELL + GAP) }}>
                      {m}
                    </span>
                  )
              )}
            </div>
            <div className="flex" style={{ gap: GAP }}>
              {columns.map((col, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }}>
                  {col.map((day) => (
                    <div
                      key={day}
                      className={`rounded-[2.5px] ${onSelectDay && day <= t && day >= first ? 'cursor-pointer' : ''}`}
                      style={{ width: CELL, height: CELL, outlineOffset: -1, ...cellStyle(day) }}
                      onClick={() => onSelectDay && day <= t && day >= first && onSelectDay(day)}
                      onMouseEnter={(e) => {
                        const root = e.currentTarget.closest('[data-year-graph]') as HTMLElement | null
                        const r = root?.getBoundingClientRect()
                        const c = e.currentTarget.getBoundingClientRect()
                        if (r) setHover({ day, x: c.left - r.left, y: c.top - r.top })
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted">
        {streak ? (
          <>
            <span className="inline-block w-[10px] h-[10px] rounded-[2px]" style={{ background: 'var(--accent)' }} /> hit
            <span className="inline-block w-[10px] h-[10px] rounded-[2px] ml-2" style={{ background: FROZEN }} /> frozen
            <span className="inline-block w-[10px] h-[10px] rounded-[2px] ml-2" style={{ background: MISSED }} /> missed
            <span className="inline-block w-[10px] h-[10px] rounded-[2px] ml-2" style={{ background: 'var(--card-2)', outline: '1.5px solid var(--accent)', outlineOffset: -1 }} /> today
          </>
        ) : (
          <>
            less
            {[0, 0.28, 0.5, 0.74, 1].map((a, i) => (
              <span key={i} className="inline-block w-[10px] h-[10px] rounded-[2px]" style={{ background: i === 0 ? 'var(--card-2)' : `rgba(var(--accent-rgb), ${a})` }} />
            ))}
            more
          </>
        )}
      </div>
      {hover && hover.day <= t && hover.day >= first && (
        <div className="pointer-events-none absolute z-10 card px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-xl" style={{ left: Math.min(hover.x + 34, width - 150), top: hover.y + 32 }}>
          <div className="text-secondary">{fmtDay(hover.day)}</div>
          <div>{hoverText(hover.day)}</div>
        </div>
      )}
    </div>
  )
}
