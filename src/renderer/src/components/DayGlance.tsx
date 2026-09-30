import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { AppUsage, DaySummary } from '../../../shared/types'
import { fmtDay, fmtDuration, MINOR_APP_MS, pct } from '@/lib/format'
import { STATIC } from '@/lib/motion'
import { AppIcon } from '@/components/ui'

/**
 * One day at a glance, shown when a day is clicked in a graph: screen, active and idle time, sessions,
 * and the three most used applications. Fetched once per day shown; not a live view.
 */
export function DayGlance({ day, onClose }: { day: string; onClose: () => void }): JSX.Element {
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [apps, setApps] = useState<AppUsage[] | null>(null)
  useEffect(() => {
    let alive = true
    setSummary(null)
    setApps(null)
    void Promise.all([window.api.daySummary(day), window.api.dayApps(day)]).then(([s, a]) => {
      if (!alive) return
      setSummary(s)
      setApps(a)
    })
    return () => {
      alive = false
    }
  }, [day])

  const top = (apps ?? []).filter((a) => a.activeMs + a.idleMs - a.listeningMs >= MINOR_APP_MS).slice(0, 3)
  const empty = summary !== null && summary.screenMs < 60_000

  return (
    <motion.div
      key={day}
      initial={STATIC ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="card mb-3 px-5 py-3.5 flex items-center gap-6"
    >
      <div className="min-w-[110px]">
        <div className="text-[13.5px] font-medium">{fmtDay(day)}</div>
        <div className="text-[11.5px] text-muted num">{day}</div>
      </div>
      {!summary ? (
        <div className="text-[12.5px] text-muted flex-1">Loading…</div>
      ) : empty ? (
        <div className="text-[12.5px] text-muted flex-1">Nothing recorded on this day.</div>
      ) : (
        <>
          <dl className="flex items-center gap-5 text-[12.5px] num">
            <Stat label="Screen" value={fmtDuration(summary.screenMs)} />
            <Stat label="Active" value={fmtDuration(summary.activeMs)} sub={`${pct(summary.activeMs, summary.screenMs)}%`} />
            <Stat label="Idle" value={fmtDuration(summary.idleMs)} />
            <Stat label="Sessions" value={String(summary.sessions)} />
          </dl>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
            {top.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[12px] max-w-[220px]" style={{ background: 'var(--card-2)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                <AppIcon icon={a.icon} name={a.displayName} appId={a.id} size={18} />
                <span className="truncate">{a.displayName}</span>
                <span className="num text-secondary shrink-0">{fmtDuration(a.activeMs + a.idleMs - a.listeningMs)}</span>
              </span>
            ))}
          </div>
        </>
      )}
      <button className="btn btn-ghost !p-1.5 shrink-0" onClick={onClose} aria-label="Close">
        <X size={14} />
      </button>
    </motion.div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div>
      <dt className="label !text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-[13.5px]">
        {value}
        {sub && <span className="text-muted text-[11.5px] ml-1">{sub}</span>}
      </dd>
    </div>
  )
}
