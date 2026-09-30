import { useEffect, useState } from 'react'
import { LayoutDashboard, Pause, Play, Target } from 'lucide-react'
import type { TrackerStatus } from '../../shared/types'
import { useEvent } from '@/lib/hooks'
import { fmtDuration, pct } from '@/lib/format'
import { Dot } from '@/components/ui'

/** Compact tray popup: today's total, a one-line breakdown, and three actions. Nothing more. */
export default function Popup(): JSX.Element {
  const [status, setStatus] = useState<TrackerStatus | null>(null)

  useEffect(() => {
    void window.api.trackerStatus().then(setStatus)
    const t = setInterval(() => void window.api.trackerStatus().then(setStatus), 2000)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.api.closePopup()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  useEvent<TrackerStatus>('tracker:status', setStatus)

  const s = status
  const state = !s
    ? { color: 'var(--muted)', text: 'Connecting' }
    : s.paused
      ? { color: 'var(--muted)', text: 'Paused' }
      : s.locked
        ? { color: 'var(--muted)', text: 'Locked' }
        : s.media
          ? { color: 'var(--success)', text: 'Media' }
          : s.idle
            ? { color: 'var(--warning)', text: 'Idle' }
            : { color: 'var(--success)', text: 'Tracking' }

  const toggle = async (): Promise<void> => {
    if (!s) return
    if (s.paused) await window.api.resumeTracking()
    else await window.api.pauseTracking()
    setStatus(await window.api.trackerStatus())
  }

  return (
    <div className="h-full flex flex-col p-4 select-none">
      <div className="flex items-center justify-between text-[11.5px] text-secondary shrink-0">
        <span className="font-semibold tracking-[0.12em]">SCREENWISE</span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color={state.color} size={6} live={state.text === 'Tracking'} />
          {state.text}
        </span>
      </div>
      <div className="mt-2 hero num text-[34px] leading-none shrink-0">{s ? fmtDuration(s.todayScreenMs) : '—'}</div>
      <div className="mt-1.5 text-[12px] text-secondary num truncate shrink-0 min-h-[18px]">
        {s
          ? `${fmtDuration(s.todayActiveMs)} active · ${pct(s.todayActiveMs, s.todayScreenMs)}%${
              s.currentApp && s.tracking ? ` · ${s.currentApp.displayName}` : ''
            }`
          : 'Screen time today'}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5">
        <button className="btn !py-1.5 !px-2 text-[12px] inline-flex items-center justify-center gap-1.5" onClick={() => window.api.openDashboard()}>
          <LayoutDashboard size={13} /> Open
        </button>
        <button className="btn !py-1.5 !px-2 text-[12px] inline-flex items-center justify-center gap-1.5" onClick={() => window.api.openDashboard('focus')}>
          <Target size={13} /> Focus
        </button>
        <button className="btn !py-1.5 !px-2 text-[12px] inline-flex items-center justify-center gap-1.5" onClick={toggle} disabled={!s}>
          {s?.paused ? <Play size={13} /> : <Pause size={13} />} {s?.paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  )
}
