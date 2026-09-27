import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { DaySummary, TimelineSegment } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { fmtDuration, fmtTime, today } from '@/lib/format'
import { assignSlots, colorForApp, NEUTRAL } from '@/lib/palette'
import { Card, Page, PageHeader, StatTile, AppIcon } from '@/components/ui'
import { DayNav } from '@/components/DayNav'
import { DayTimeline } from '@/components/DayTimeline'

export function Timeline(): JSX.Element {
  const [day, setDay] = useState(today())
  const [selected, setSelected] = useState<TimelineSegment | null>(null)
  const segments = usePoll<TimelineSegment[]>(() => window.api.timeline(day), [day], day === today() ? 10_000 : 120_000)
  const summary = usePoll<DaySummary>(() => window.api.daySummary(day), [day], day === today() ? 10_000 : 120_000)

  useEffect(() => setSelected(null), [day])
  useEffect(() => {
    if (segments.data) {
      const totals = new Map<number, number>()
      for (const s of segments.data) if (!s.isIdle) totals.set(s.appId, (totals.get(s.appId) ?? 0) + s.end - s.start)
      assignSlots([...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id))
    }
  }, [segments.data])

  const log = useMemo(() => {
    const list = (segments.data ?? []).filter((s) => s.end - s.start >= 60_000)
    return list.slice().reverse().slice(0, 60)
  }, [segments.data])

  const s = summary.data

  return (
    <Page>
      <PageHeader title="Timeline" subtitle="How the day unfolded, hour by hour." right={<DayNav day={day} onChange={setDay} />} />

      <div className="grid grid-cols-4 gap-3 mb-3">
        <StatTile label="Screen time" value={s ? fmtDuration(s.screenMs) : '—'} />
        <StatTile label="Active" value={s ? fmtDuration(s.activeMs) : '—'} />
        <StatTile label="Idle" value={s ? fmtDuration(s.idleMs) : '—'} />
        <StatTile
          label="Active window"
          value={s?.firstActivity ? fmtTime(s.firstActivity) : '—'}
          sub={s?.lastActivity ? `to ${fmtTime(s.lastActivity)}` : undefined}
        />
      </div>

      <Card className="mb-3">
        <DayTimeline segments={segments.data ?? []} day={day} selected={selected} onSelect={setSelected} />
      </Card>

      {selected && (
        <Card className="mb-3">
          <div className="flex items-start gap-4">
            {selected.isIdle ? (
              <span className="w-9 h-9 rounded-md hatch shrink-0" />
            ) : (
              <AppIcon icon={selected.icon} name={selected.appName} appId={selected.appId} size={36} />
            )}
            <div className="flex-1">
              <div className="text-[16px] font-medium">{selected.isIdle ? `Idle · ${selected.appName}` : selected.appName}</div>
              <div className="text-secondary num mt-0.5">
                {fmtTime(selected.start)} to {fmtTime(selected.end)}
              </div>
              <div className="text-secondary num">Duration {fmtDuration(selected.end - selected.start, { seconds: true })}</div>
            </div>
            <button className="btn btn-ghost !p-1.5" onClick={() => setSelected(null)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </Card>
      )}

      <Card title="Activity log" right={<span className="text-[12px] text-muted">Blocks of a minute or longer, newest first</span>}>
        {log.length === 0 ? (
          <div className="text-secondary text-[13px] py-6 text-center">No activity recorded for this day.</div>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((seg) => (
              <li
                key={seg.id}
                className={`flex items-center gap-3 py-2 cursor-pointer -mx-2 px-2 rounded-md hover:bg-card-2 ${selected?.id === seg.id ? 'bg-card-2' : ''}`}
                onClick={() => setSelected(seg)}
              >
                <span className={`w-1.5 h-6 rounded-full ${seg.isIdle ? 'hatch' : ''}`} style={{ background: seg.isIdle ? undefined : colorForApp(seg.appId) || NEUTRAL }} />
                <span className="num text-secondary w-[150px] text-[13px]">
                  {fmtTime(seg.start)} to {fmtTime(seg.end)}
                </span>
                <span className="flex-1 truncate text-[13.5px]">{seg.isIdle ? `Idle · ${seg.appName}` : seg.appName}</span>
                <span className="num text-[13px] text-secondary">{fmtDuration(seg.end - seg.start)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  )
}
