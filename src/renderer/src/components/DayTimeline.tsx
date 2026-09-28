import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineSegment } from '../../../shared/types'
import { colorForApp, NEUTRAL } from '@/lib/palette'
import { dayStart, fmtDuration, fmtHour, fmtTime, getDayStartHour, MINOR_APP_MS, today } from '@/lib/format'
import { AppIcon } from './ui'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** Smallest window the wheel can zoom into, in hours. */
const MIN_SPAN_H = 0.25
const ZOOM_STEP = 1.25

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

/** Visible window in hours from the start of the day. */
interface View {
  from: number
  to: number
}
const FULL_DAY: View = { from: 0, to: 24 }

/** Tick spacing (hours) that keeps roughly 6 to 10 labels on screen at the given span. */
function tickStep(spanH: number): number {
  if (spanH > 12) return 3
  if (spanH > 6) return 1
  if (spanH > 3) return 0.5
  if (spanH > 1.5) return 0.25
  if (spanH > 0.6) return 1 / 12
  return 1 / 30
}

function tickLabel(dayStartMs: number, h: number): string {
  return Number.isInteger(h) ? fmtHour(h + getDayStartHour()) : fmtTime(dayStartMs + h * HOUR_MS)
}

export function DayTimeline({
  segments,
  day,
  compact = false,
  maxLanes = 10,
  selected,
  onSelect,
  zoomable = false
}: {
  segments: TimelineSegment[]
  day: string
  compact?: boolean
  maxLanes?: number
  selected?: TimelineSegment | null
  onSelect?: (seg: TimelineSegment | null) => void
  /** Mouse wheel over the lanes zooms around the cursor; shift+wheel pans. */
  zoomable?: boolean
}): JSX.Element {
  const [hover, setHover] = useState<{ seg: TimelineSegment; x: number; y: number } | null>(null)
  const [view, setView] = useState<View>(FULL_DAY)
  const ref = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const start = dayStart(day)
  const isToday = day === today()

  useEffect(() => setView(FULL_DAY), [day])

  // Native listener: React registers wheel as passive, so preventDefault (to stop the page scrolling) needs this.
  // Re-attached when data arrives, because the lanes element does not exist while the day is empty.
  const hasData = segments.length > 0
  useEffect(() => {
    const el = lanesRef.current
    if (!zoomable || !el) return
    const onWheel = (e: WheelEvent): void => {
      const v = viewRef.current
      const span = v.to - v.from
      const rect = el.getBoundingClientRect()
      const labelW = Number(el.dataset.labelW ?? 0)
      const trackW = rect.width - labelW
      if (trackW <= 0) return
      if (e.shiftKey || (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0)) {
        // Pan: a full wheel notch moves about a fifth of the window.
        if (span >= 24) return
        const delta = (e.deltaX || e.deltaY) > 0 ? span / 5 : -span / 5
        const from = Math.max(0, Math.min(24 - span, v.from + delta))
        e.preventDefault()
        setView({ from, to: from + span })
        return
      }
      const zoomIn = e.deltaY < 0
      if (!zoomIn && span >= 24) return // fully zoomed out: let the page scroll
      e.preventDefault()
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - labelW) / trackW))
      const anchor = v.from + frac * span
      const nextSpan = Math.max(MIN_SPAN_H, Math.min(24, zoomIn ? span / ZOOM_STEP : span * ZOOM_STEP))
      let from = anchor - frac * nextSpan
      from = Math.max(0, Math.min(24 - nextSpan, from))
      setView(nextSpan >= 24 ? FULL_DAY : { from, to: from + nextSpan })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomable, hasData])

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

  const span = view.to - view.from
  const zoomed = span < 24
  const viewStart = start + view.from * HOUR_MS
  const viewMs = span * HOUR_MS
  const pct = (ts: number): number => ((ts - viewStart) / viewMs) * 100

  const ticks = useMemo<number[]>(() => {
    if (!zoomed) return compact ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]
    const step = tickStep(span)
    const out: number[] = []
    for (let h = Math.ceil(view.from / step) * step; h <= view.to + 1e-9; h += step) out.push(Math.round(h * 3600) / 3600)
    return out
  }, [zoomed, compact, span, view.from, view.to])

  const labelW = compact ? 120 : 160
  const rowH = compact ? 22 : 28
  const nowPct = isToday ? pct(Date.now()) : null

  if (!segments.length) {
    return (
      <div className="py-10 text-center text-secondary text-[13px]">
        Nothing recorded for this day yet.
      </div>
    )
  }

  return (
    <div className="relative select-none" ref={ref}>
      {zoomable && zoomed && (
        <div className="flex items-center justify-end gap-2 mb-1 text-[11.5px] text-muted">
          <span className="num">
            Showing {fmtTime(viewStart)} to {fmtTime(viewStart + viewMs)}
          </span>
          <button className="btn btn-ghost !py-0.5 !px-2 text-[11.5px]" onClick={() => setView(FULL_DAY)}>
            Reset
          </button>
        </div>
      )}

      {/* hour axis */}
      <div className="flex" style={{ paddingLeft: labelW }}>
        <div className="relative flex-1 h-5 text-[11px] text-muted num overflow-hidden">
          {ticks.map((h) => {
            const x = ((h - view.from) / span) * 100
            const atStart = x < 0.5
            const atEnd = x > 99.5
            return (
              <span
                key={h}
                className="absolute whitespace-nowrap"
                style={{ left: `${x}%`, transform: atStart ? 'none' : atEnd ? 'translateX(-100%)' : 'translateX(-50%)' }}
              >
                {tickLabel(start, h)}
              </span>
            )
          })}
        </div>
      </div>

      <div className="relative" ref={lanesRef} data-label-w={labelW}>
        {/* grid */}
        <div className="absolute inset-y-0 right-0 pointer-events-none overflow-hidden" style={{ left: labelW }}>
          {ticks.map((h) => (
            <div key={h} className="absolute inset-y-0 w-px bg-border" style={{ left: `${((h - view.from) / span) * 100}%` }} />
          ))}
          {nowPct !== null && nowPct >= 0 && nowPct <= 100 && (
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
            <div className="relative flex-1 overflow-hidden" style={{ height: rowH }}>
              {lane.segments.map((s) => {
                if (s.end <= viewStart || s.start >= viewStart + viewMs) return null
                const left = Math.max(0, pct(s.start))
                const right = Math.min(100, pct(s.end))
                const isSel = selected?.id === s.id
                return (
                  <div
                    key={s.id}
                    className={`seg-in absolute top-[3px] bottom-[3px] rounded-[3px] ${lane.idle ? 'hatch' : ''} ${
                      onSelect ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${right - left}%`,
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
