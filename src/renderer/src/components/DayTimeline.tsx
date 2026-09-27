import { useMemo, useRef, useState } from 'react'
import type { TimelineSegment } from '../../../shared/types'
import { colorForApp, NEUTRAL } from '@/lib/palette'
import { dayStart, fmtDuration, fmtHour, fmtTime, MINOR_APP_MS, today } from '@/lib/format'
import { AppIcon } from './ui'

const DAY_MS = 86_400_000

interface Lane {
  key: string
  appId: number | null
  name: string
  icon: string | null
  color: string
  idle: boolean
  segments: TimelineSegment[]
  totalMs: number
}

export function DayTimeline({
  segments,
  day,
  compact = false,
  maxLanes = 10,
  selected,
  onSelect
}: {
  segments: TimelineSegment[]
  day: string
  compact?: boolean
  maxLanes?: number
  selected?: TimelineSegment | null
  onSelect?: (seg: TimelineSegment | null) => void
}): JSX.Element {
  const [hover, setHover] = useState<{ seg: TimelineSegment; x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const start = dayStart(day)
  const isToday = day === today()
  const nowPct = isToday ? ((Date.now() - start) / DAY_MS) * 100 : null

  const lanes = useMemo<Lane[]>(() => {
    const byApp = new Map<number, Lane>()
    const idle: Lane = { key: 'idle', appId: null, name: 'Idle', icon: null, color: NEUTRAL, idle: true, segments: [], totalMs: 0 }
    for (const s of segments) {
      const dur = s.end - s.start
      if (s.isIdle) {
        idle.segments.push(s)
        idle.totalMs += dur
        continue
      }
      let lane = byApp.get(s.appId)
      if (!lane) {
        lane = { key: String(s.appId), appId: s.appId, name: s.appName, icon: s.icon, color: '', idle: false, segments: [], totalMs: 0 }
        byApp.set(s.appId, lane)
      }
      lane.segments.push(s)
      lane.totalMs += dur
    }
    const sorted = [...byApp.values()].sort((a, b) => b.totalMs - a.totalMs)
    const major = sorted.filter((l) => l.totalMs >= MINOR_APP_MS)
    const top = major.slice(0, maxLanes)
    const rest = sorted.filter((l) => !top.includes(l))
    for (const l of top) l.color = colorForApp(l.appId!)
    const out: Lane[] = [...top]
    if (rest.length) {
      const other: Lane = { key: 'other', appId: null, name: `Other (${rest.length})`, icon: null, color: NEUTRAL, idle: false, segments: [], totalMs: 0 }
      for (const r of rest) {
        other.segments.push(...r.segments)
        other.totalMs += r.totalMs
      }
      out.push(other)
    }
    if (idle.segments.length) out.push(idle)
    return out
  }, [segments, maxLanes])

  const hours = compact ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]
  const labelW = compact ? 120 : 160
  const rowH = compact ? 22 : 28

  if (!segments.length) {
    return (
      <div className="py-10 text-center text-secondary text-[13px]">
        Nothing recorded for this day yet.
      </div>
    )
  }

  return (
    <div className="relative select-none" ref={ref}>
      {/* hour axis */}
      <div className="flex" style={{ paddingLeft: labelW }}>
        <div className="relative flex-1 h-5 text-[11px] text-muted num">
          {hours.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : undefined }}
            >
              {h === 24 ? '12 AM' : fmtHour(h)}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* grid */}
        <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: labelW }}>
          {hours.map((h) => (
            <div key={h} className="absolute inset-y-0 w-px bg-border" style={{ left: `${(h / 24) * 100}%` }} />
          ))}
          {nowPct !== null && (
            <div className="absolute inset-y-0 w-px" style={{ left: `${nowPct}%`, background: 'var(--accent)', opacity: 0.7 }} />
          )}
        </div>

        {lanes.map((lane) => (
          <div key={lane.key} className="flex items-center" style={{ height: rowH + 6 }}>
            <div className="flex items-center gap-2 pr-3 shrink-0 min-w-0" style={{ width: labelW }}>
              {lane.idle ? (
                <span className="w-[18px] h-[18px] rounded hatch shrink-0" />
              ) : lane.appId !== null ? (
                <AppIcon icon={lane.icon} name={lane.name} appId={lane.appId} size={18} />
              ) : (
                <span className="w-[18px] h-[18px] rounded shrink-0" style={{ background: NEUTRAL }} />
              )}
              <span className="truncate text-[12.5px] text-secondary">{lane.name}</span>
            </div>
            <div className="relative flex-1" style={{ height: rowH }}>
              {lane.segments.map((s) => {
                const left = ((s.start - start) / DAY_MS) * 100
                const width = ((s.end - s.start) / DAY_MS) * 100
                const isSel = selected?.id === s.id
                return (
                  <div
                    key={s.id}
                    className={`seg-in absolute top-[3px] bottom-[3px] rounded-[3px] ${lane.idle ? 'hatch' : ''} ${
                      onSelect ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 2,
                      background: lane.idle ? undefined : lane.color,
                      outline: isSel ? '2px solid var(--primary)' : undefined,
                      outlineOffset: 1,
                      opacity: (hover && hover.seg.id !== s.id && !isSel ? 0.75 : 1) * (s.passive ? 0.5 : 1)
                    }}
                    onMouseEnter={(e) => {
                      const r = ref.current?.getBoundingClientRect()
                      if (r) setHover({ seg: s, x: e.clientX - r.left, y: e.clientY - r.top })
                    }}
                    onMouseMove={(e) => {
                      const r = ref.current?.getBoundingClientRect()
                      if (r) setHover({ seg: s, x: e.clientX - r.left, y: e.clientY - r.top })
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect?.(selected?.id === s.id ? null : s)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 card px-3 py-2 text-[12.5px] shadow-xl"
          style={{
            left: Math.min(hover.x + 12, (ref.current?.clientWidth ?? 400) - 200),
            top: hover.y + 14,
            minWidth: 170
          }}
        >
          <div className="font-medium">
            {hover.seg.isIdle ? `Idle · ${hover.seg.appName}` : hover.seg.passive ? `Passive · ${hover.seg.appName}` : hover.seg.appName}
          </div>
          <div className="text-secondary num mt-0.5">
            {fmtTime(hover.seg.start)} to {fmtTime(hover.seg.end)}
          </div>
          <div className="text-secondary num">Duration {fmtDuration(hover.seg.end - hover.seg.start, { seconds: true })}</div>
        </div>
      )}
    </div>
  )
}
