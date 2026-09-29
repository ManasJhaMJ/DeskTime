import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { AppUsage, CategoryUsage, DaySummary, Settings, TimelineSegment, TrackerStatus } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { addDays, dayStart, deltaText, fmtDay, fmtDuration, fmtHour, getDayStartHour, greeting, MINOR_APP_MS, pct, today } from '@/lib/format'
import { assignSlots, colorForApp } from '@/lib/palette'
import { STATIC } from '@/lib/motion'
import { AppIcon, Page, Dot, CountUp } from '@/components/ui'
import { Companion } from '@/components/Companion'

/**
 * The first screen answers one question, "how is today going?", in a single calm column: one big number with a
 * category strip beneath it, a three-arc ring, a heat strip for the shape of the day and a row of app chips.
 * Anything analytical (lanes, sessions, switches, logs) lives on the Timeline and Applications pages.
 */
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
  const categories = usePoll<CategoryUsage[]>(() => window.api.dayCategories(day), [day], 15_000, ['data:changed', 'apps:changed'])

  useEffect(() => {
    if (apps.data) assignSlots(apps.data.map((a) => a.id))
  }, [apps.data])
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void window.api.getSettings().then(setSettings)
  }, [])

  const s = summary.data
  const y = yesterday.data
  const delta = s && y ? deltaText(s.screenMs, y.screenMs) : null
  const allApps = apps.data ?? []
  const majorApps = allApps.filter((a) => a.activeMs + a.idleMs >= MINOR_APP_MS)
  const topApps = majorApps.slice(0, 3)
  const moreCount = allApps.length - topApps.length

  return (
    <Page>
      <div className="max-w-[820px] mx-auto pt-8 pb-6 flex flex-col gap-16 min-h-[calc(100vh-120px)] justify-center">
        {/* hero + ring */}
        <Rise index={0} className="flex items-center justify-between gap-10">
          <div className="min-w-0 flex-1 flex items-center gap-5">
            {settings && settings.avatar !== 'none' && (
              <Companion avatar={settings.avatar} photo={settings.avatarPhoto} sleeps={settings.avatarSleeps} status={status} variant="bare" />
            )}
            <div className="min-w-0 flex-1">
            <div className="text-secondary text-[13px]">
              {greeting()} · {fmtDay(day)}
            </div>
            <div className="hero num text-[84px] leading-[0.95] mt-3 tracking-tight">{s ? <CountUp value={s.screenMs} format={fmtDuration} /> : '—'}</div>
            <div className="mt-3 text-secondary text-[13.5px]">
              Screen time today
              {delta && (
                <motion.span
                  key={delta.text}
                  initial={STATIC ? false : { opacity: 0.2, filter: 'brightness(1.9)' }}
                  animate={{ opacity: 1, filter: 'brightness(1)' }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className={`ml-2 inline-block ${delta.dir === 'down' ? 'text-success' : delta.dir === 'up' ? 'text-warning' : 'text-secondary'}`}
                >
                  {delta.text}
                </motion.span>
              )}
            </div>
            <CategoryStrip cats={categories.data ?? []} />
            {status?.currentApp && status.tracking && (
              <div className="mt-5 inline-flex items-center gap-2 text-[12.5px] text-secondary">
                <Dot color={status.idle ? 'var(--warning)' : 'var(--success)'} live={!status.idle} />
                {status.media ? 'Watching in' : status.call ? 'In a call in' : status.passive ? 'Reading in' : status.idle ? 'Idle in' : 'Using'}{' '}
                <span className="text-primary">{status.currentApp.displayName}</span>
              </div>
            )}
            {status && status.listening.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-secondary">
                <Dot color="var(--accent-2)" />
                Listening to <span className="text-primary">{status.listening.join(', ')}</span>
              </div>
            )}
            </div>
          </div>
          <SplitRing summary={s} />
        </Rise>

        {/* shape of the day */}
        <Rise index={1}>
          <SectionLabel title="Today, hour by hour" action="Open timeline" onAction={onOpenTimeline} />
          <HeatStrip segments={timeline.data ?? []} day={day} onClick={onOpenTimeline} />
        </Rise>

        {/* top apps */}
        <Rise index={2}>
          <SectionLabel title="Most used" action="All applications" onAction={onOpenApps} />
          {allApps.length === 0 ? (
            <div className="text-[13px] text-muted">Applications appear here as you use your PC.</div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {topApps.map((a, i) => {
                const color = colorForApp(a.id)
                return (
                  <motion.button
                    key={a.id}
                    initial={STATIC ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.25 + i * 0.06, ease: EASE }}
                    className="lift inline-flex items-center gap-3 pl-1.5 pr-4 py-1.5 rounded-full text-left"
                    style={{
                      background: `color-mix(in srgb, ${color} 10%, var(--control))`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, var(--border))`
                    }}
                    onClick={onOpenApps}
                  >
                    <span className="grid place-items-center w-10 h-10 rounded-full" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}>
                      <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={26} />
                    </span>
                    <span className="text-[14px] max-w-[200px] truncate">{a.displayName}</span>
                    <span className="num text-[13px] text-secondary">{fmtDuration(a.activeMs + a.idleMs)}</span>
                  </motion.button>
                )
              })}
              {moreCount > 0 && (
                <motion.button
                  initial={STATIC ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.25 + topApps.length * 0.06, ease: EASE }}
                  className="lift inline-flex items-center px-4 py-2.5 rounded-full border border-dashed border-border text-[13.5px] text-secondary"
                  onClick={onOpenApps}
                >
                  +{moreCount} more
                </motion.button>
              )}
            </div>
          )}
        </Rise>
      </div>
    </Page>
  )
}

const EASE = [0.2, 0.8, 0.2, 1] as const

/** A page section that fades and rises in, 80 ms after the previous one. */
function Rise({ index, className, children }: { index: number; className?: string; children: React.ReactNode }): JSX.Element {
  return (
    <motion.section
      className={className}
      initial={STATIC ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: EASE }}
    >
      {children}
    </motion.section>
  )
}

function SectionLabel({ title, action, onAction }: { title: string; action: string; onAction: () => void }): JSX.Element {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="label">{title}</span>
      <button className="text-[12.5px] text-secondary hover:text-primary transition-colors" onClick={onAction}>
        {action} →
      </button>
    </div>
  )
}

/** Active time by category as a thin strip under the hero. Names show on hover so the strip stays quiet. */
function CategoryStrip({ cats }: { cats: CategoryUsage[] }): JSX.Element | null {
  const [hover, setHover] = useState<CategoryUsage | null>(null)
  const total = cats.reduce((s, c) => s + c.activeMs, 0)
  if (total < 60_000) return null
  return (
    <div className="mt-5 max-w-[420px]">
      <div className="flex h-[6px] rounded-full overflow-hidden gap-[2px]" onMouseLeave={() => setHover(null)}>
          {cats.map((c) => (
            <div
              key={c.id}
              className="h-full transition-opacity"
              style={{ width: `${(c.activeMs / total) * 100}%`, background: c.color, opacity: hover && hover.id !== c.id ? 0.35 : 1 }}
              onMouseEnter={() => setHover(c)}
            />
          ))}
        </div>
      <div className="mt-1.5 text-[11.5px] text-muted num h-4">
        {hover ? (
          <>
            <span className="text-secondary">{hover.name}</span> · {fmtDuration(hover.activeMs)} · {pct(hover.activeMs, total)}%
          </>
        ) : (
          'Active time by category'
        )}
      </div>
    </div>
  )
}

/** Active, passive and idle time as three arcs of one ring, the active share in the middle. */
function SplitRing({ summary }: { summary: DaySummary | null | undefined }): JSX.Element {
  const size = 168
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const hands = summary ? summary.activeMs - summary.passiveMs : 0
  const passive = summary?.passiveMs ?? 0
  const idle = summary?.idleMs ?? 0
  const total = hands + passive + idle
  const gap = total > 0 ? 3 : 0 // px between arcs
  const parts = [
    { key: 'active', ms: hands, color: 'var(--accent)', label: 'Active' },
    { key: 'passive', ms: passive, color: 'var(--accent-2)', label: 'Passive' },
    { key: 'idle', ms: idle, color: 'var(--idle)', label: 'Idle' }
  ]
  const shown = parts.filter((p) => p.ms > 0)
  let offset = 0
  const arcs = shown.map((p) => {
    const len = Math.max(0, (p.ms / total) * c - (shown.length > 1 ? gap : 0))
    const arc = { ...p, len, offset }
    offset += (p.ms / total) * c
    return arc
  })
  const activePct = summary && summary.screenMs > 0 ? pct(summary.activeMs, summary.screenMs) : 0

  return (
    <div className="shrink-0 flex flex-col items-center gap-4">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: 'var(--card-2)' }} strokeWidth={stroke} fill="none" />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              style={{ stroke: a.color, transition: STATIC ? 'none' : 'stroke-dasharray 700ms var(--ease-out), stroke-dashoffset 700ms var(--ease-out)' }}
              strokeWidth={stroke}
              strokeLinecap={shown.length > 1 ? 'butt' : 'round'}
              fill="none"
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </svg>
        <div className="relative z-10 text-center">
          <div className="hero num text-[30px] leading-none">{summary ? `${activePct}%` : '—'}</div>
          <div className="mt-1 text-[11px] label">active</div>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-[12.5px] w-full">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-secondary flex-1">{p.label}</span>
            <span className="num">{fmtDuration(p.ms)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 48 half-hour cells shaded by how much of each slot was active; idle shows faintly; the current slot is outlined. */
function HeatStrip({ segments, day, onClick }: { segments: TimelineSegment[]; day: string; onClick: () => void }): JSX.Element {
  const SLOTS = 48
  const SLOT_MS = 1_800_000
  const start = dayStart(day)
  const cells = useMemo(() => {
    const active = new Array<number>(SLOTS).fill(0)
    const idle = new Array<number>(SLOTS).fill(0)
    for (const seg of segments) {
      let t = seg.start
      while (t < seg.end) {
        const i = Math.floor((t - start) / SLOT_MS)
        if (i < 0 || i >= SLOTS) break
        const slotEnd = start + (i + 1) * SLOT_MS
        const ms = Math.min(seg.end, slotEnd) - t
        if (seg.isIdle) idle[i] += ms
        else active[i] += seg.passive ? ms * 0.6 : ms
        t = slotEnd
      }
    }
    return active.map((a, i) => ({ active: Math.min(1, a / SLOT_MS), idle: Math.min(1, idle[i] / SLOT_MS) }))
  }, [segments, start])
  const nowSlot = day === today() ? Math.floor((Date.now() - start) / SLOT_MS) : -1
  const [hover, setHover] = useState<number | null>(null)
  const hasAny = cells.some((c) => c.active > 0 || c.idle > 0)

  return (
    <div>
      <button className="w-full block text-left" onClick={onClick} aria-label="Open the timeline">
        <div key={hasAny ? 'data' : 'empty'} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
          {cells.map((cell, i) => {
            const isNow = i === nowSlot
            const future = nowSlot >= 0 && i > nowSlot
            const alpha = cell.active > 0 ? 0.18 + cell.active * 0.82 : 0
            const opacity = cell.active > 0 ? 1 : cell.idle > 0 ? 0.55 : future ? 0.35 : 1
            return (
              <motion.div
                key={i}
                initial={STATIC ? false : { opacity: 0, scaleY: 0.35 }}
                animate={{ opacity, scaleY: 1 }}
                transition={{ duration: 0.35, delay: (i / SLOTS) * 0.6, ease: EASE }}
                className="h-12 rounded-[5px] relative origin-bottom"
                style={{
                  background: cell.active > 0 ? `rgba(var(--accent-rgb), ${alpha.toFixed(2)})` : cell.idle > 0 ? 'var(--idle)' : 'var(--card-2)',
                  outline: isNow ? '2px solid var(--accent)' : hover === i ? '2px solid var(--border-2)' : undefined,
                  outlineOffset: 1
                }}
                onMouseEnter={() => setHover(i)}
              />
            )
          })}
        </div>
      </button>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted num">
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className="absolute whitespace-nowrap"
            style={{ left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)' }}
          >
            {fmtHour(h + getDayStartHour())}
          </span>
        ))}
        {hover !== null && (
          <span className="absolute right-0 top-4 text-secondary">
            {fmtHour(Math.floor(hover / 2) + getDayStartHour()).replace(' ', hover % 2 ? ':30 ' : ':00 ')}
            {' · '}
            {cells[hover].active > 0 ? `${Math.round(cells[hover].active * 30)} min active` : cells[hover].idle > 0 ? 'idle' : hasAny ? 'nothing' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
