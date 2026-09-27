import { useEffect, useState } from 'react'
import { Check, ShieldOff } from 'lucide-react'
import type { AppInfo, FocusSession, FocusStats } from '../../../shared/types'
import { useEvent, useNow, usePoll } from '@/lib/hooks'
import { fmtClock, fmtDuration, fmtTime, today } from '@/lib/format'
import { AppIcon, Card, Empty, Page, PageHeader, Ring, Segmented, StatTile } from '@/components/ui'
import { AppPicker } from '@/components/AppPicker'

const DURATIONS = [25, 45, 60, 90, 120]

export function Focus(): JSX.Element {
  const [focus, setFocus] = useState<FocusSession | null | undefined>(undefined)
  const [label, setLabel] = useState('Deep work')
  const [minutes, setMinutes] = useState(60)
  const [custom, setCustom] = useState('')
  const [allowed, setAllowed] = useState<number[]>([])
  const [restricted, setRestricted] = useState<number[]>([])
  const apps = usePoll<AppInfo[]>(() => window.api.listApps(), [], 60_000, ['apps:changed'])
  const stats = usePoll<FocusStats>(() => window.api.focusStats(today()), [focus?.id ?? 0], 15_000)
  const history = usePoll<FocusSession[]>(() => window.api.focusHistory(12), [focus?.id ?? 0], 60_000)
  const now = useNow()

  useEffect(() => {
    void window.api.focusState().then(setFocus)
  }, [])
  useEvent<FocusSession | null>('focus:update', (f) => {
    setFocus(f)
    stats.refresh()
    history.refresh()
  })

  const appById = new Map((apps.data ?? []).map((a) => [a.id, a]))

  const start = async (): Promise<void> => {
    const mins = custom ? Math.max(1, parseInt(custom, 10) || minutes) : minutes
    setFocus(await window.api.focusStart(label, mins, allowed, restricted))
  }
  const end = async (): Promise<void> => {
    await window.api.focusEnd()
    setFocus(null)
  }

  const st = stats.data

  return (
    <Page>
      <PageHeader title="Focus" subtitle="Block distractions for a stretch of time, and see how it went." />

      <div className="grid grid-cols-4 gap-3 mb-3">
        <StatTile label="Focus today" value={st ? fmtDuration(st.todayMs) : '—'} />
        <StatTile label="Sessions" value={st ? String(st.todaySessions) : '—'} sub={st ? `${st.completed} completed · ${st.interrupted} ended early` : undefined} />
        <StatTile label="Longest" value={st ? fmtDuration(st.longestMs) : '—'} />
        <StatTile label="Status" value={focus ? 'In session' : 'Ready'} sub={focus ? focus.label : 'No active session'} subTone={focus ? 'accent' : 'muted'} />
      </div>

      {focus === undefined ? null : focus ? (
        <Card className="mb-3">
          <div className="flex flex-col items-center py-6">
            <Ring progress={(now - focus.startTs) / (focus.plannedSec * 1000)} size={280}>
              <div className="label">Focus</div>
              <div className="hero num text-[56px] leading-none mt-2">{fmtClock(focus.startTs + focus.plannedSec * 1000 - now)}</div>
              <div className="mt-2 text-secondary text-[13px]">{focus.label}</div>
            </Ring>
            <div className="mt-1 text-[12.5px] text-muted num">
              Started {fmtTime(focus.startTs)} · {fmtDuration(focus.plannedSec * 1000)} planned · {focus.interruptions} interruption
              {focus.interruptions === 1 ? '' : 's'}
            </div>
            <div className="grid grid-cols-2 gap-8 mt-8 w-full max-w-[520px]">
              <div>
                <div className="label mb-2">Allowed</div>
                {focus.allowedApps.length === 0 && <div className="text-[13px] text-muted">Anything not restricted</div>}
                {focus.allowedApps.map((id) => (
                  <div key={id} className="flex items-center gap-2 py-1 text-[13.5px]">
                    <Check size={14} className="text-success" />
                    <AppIcon icon={appById.get(id)?.icon ?? null} name={appById.get(id)?.displayName ?? '?'} appId={id} size={18} />
                    {appById.get(id)?.displayName ?? 'Unknown'}
                  </div>
                ))}
              </div>
              <div>
                <div className="label mb-2">Restricted</div>
                {focus.restrictedApps.length === 0 && <div className="text-[13px] text-muted">Nothing restricted</div>}
                {focus.restrictedApps.map((id) => (
                  <div key={id} className="flex items-center gap-2 py-1 text-[13.5px]">
                    <ShieldOff size={14} className="text-danger" />
                    <AppIcon icon={appById.get(id)?.icon ?? null} name={appById.get(id)?.displayName ?? '?'} appId={id} size={18} />
                    {appById.get(id)?.displayName ?? 'Unknown'}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn mt-8" onClick={end}>
              End session
            </button>
          </div>
        </Card>
      ) : (
        <Card className="mb-3" title="New session">
          <div className="grid grid-cols-[1fr_1fr] gap-6">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-secondary">What are you working on?</span>
                <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="DSA preparation" />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-secondary">Duration</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Segmented
                    options={DURATIONS.map((m) => ({ value: m, label: m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m` }))}
                    value={custom ? -1 : minutes}
                    onChange={(v) => {
                      setMinutes(v)
                      setCustom('')
                    }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Custom (min)"
                    className="w-[120px]"
                  />
                </div>
              </div>
              <div className="text-[12.5px] text-muted leading-relaxed">
                Restricted applications are minimized the moment they come to the front, with a reminder. Allowed applications are
                a note to yourself and are never blocked.
              </div>
              <button className="btn btn-accent self-start mt-auto" onClick={start} disabled={!apps.data}>
                Start focus session
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-secondary">Allowed</span>
                <AppPicker apps={apps.data ?? []} selected={allowed} onChange={setAllowed} exclude={restricted} emptyHint="No apps seen yet." />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-secondary">Restricted</span>
                <AppPicker apps={apps.data ?? []} selected={restricted} onChange={setRestricted} exclude={allowed} emptyHint="No apps seen yet." />
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Recent sessions">
        {!history.data?.length ? (
          <Empty title="No sessions yet" hint="Completed and interrupted sessions show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {history.data.map((f) => {
              const dur = (f.endTs ?? now) - f.startTs
              return (
                <li key={f.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                  <span className={`w-2 h-2 rounded-full ${f.completed ? 'bg-success' : 'bg-warning'}`} />
                  <span className="flex-1 truncate">{f.label}</span>
                  <span className="text-secondary num text-[12.5px]">{fmtTime(f.startTs)}</span>
                  <span className="text-secondary num w-[88px] text-right">{fmtDuration(dur)}</span>
                  <span className="text-muted num w-[210px] text-right text-[12.5px] whitespace-nowrap">
                    {f.completed ? 'Completed' : 'Ended early'} · {f.interruptions} interruption{f.interruptions === 1 ? '' : 's'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </Page>
  )
}
