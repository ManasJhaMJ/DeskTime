import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { AppInfo, AppLimit, LimitMode } from '../../../shared/types'
import { usePoll } from '@/lib/hooks'
import { fmtDuration, today } from '@/lib/format'
import { AppIcon, Card, Empty, Meter, Page, PageHeader, Segmented } from '@/components/ui'

const MODES: { value: LimitMode; label: string; hint: string }[] = [
  { value: 'warn', label: 'Warning only', hint: 'One notification when the limit is reached.' },
  { value: 'remind', label: 'Reminder', hint: 'Notifies again every 15 minutes while you keep using it.' },
  { value: 'block', label: 'Strict', hint: 'Minimizes the app whenever it comes to the front.' }
]

export function Limits(): JSX.Element {
  const limits = usePoll<AppLimit[]>(() => window.api.listLimits(today()), [], 10_000)
  const apps = usePoll<AppInfo[]>(() => window.api.listApps(), [], 60_000, ['apps:changed'])
  const [appId, setAppId] = useState<number | ''>('')
  const [minutes, setMinutes] = useState(60)
  const [mode, setMode] = useState<LimitMode>('warn')

  const add = async (): Promise<void> => {
    if (appId === '') return
    await window.api.setLimit(Number(appId), Math.max(1, minutes), mode)
    setAppId('')
    limits.refresh()
  }
  const remove = async (id: number): Promise<void> => {
    await window.api.removeLimit(id)
    limits.refresh()
  }
  const update = async (l: AppLimit, patch: Partial<Pick<AppLimit, 'dailyMinutes' | 'mode'>>): Promise<void> => {
    await window.api.setLimit(l.appId, patch.dailyMinutes ?? l.dailyMinutes, patch.mode ?? l.mode)
    limits.refresh()
  }

  const used = new Set((limits.data ?? []).map((l) => l.appId))
  const candidates = (apps.data ?? []).filter((a) => !used.has(a.id) && !a.hidden && a.mergedInto === null)

  return (
    <Page>
      <PageHeader title="App limits" subtitle="Daily caps on active time. Limits reset at midnight." />

      <Card title="App limits" className="mb-3">
        {!limits.data?.length ? (
          <Empty title="No limits set" hint="Add one below to get a heads-up when you have used an app enough for the day." />
        ) : (
          <ul className="flex flex-col gap-5">
            {limits.data.map((l) => {
              const cap = l.dailyMinutes * 60_000
              const over = l.usedMs >= cap
              return (
                <li key={l.id}>
                  <div className="flex items-center gap-3 mb-2">
                    <AppIcon icon={l.icon} name={l.appName} appId={l.appId} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] truncate">{l.appName}</div>
                      <div className={`text-[12px] num ${over ? 'text-danger' : 'text-secondary'}`}>
                        {fmtDuration(l.usedMs)} / {fmtDuration(cap)}
                        {over && ' · limit reached'}
                      </div>
                    </div>
                    <select
                      value={l.dailyMinutes}
                      onChange={(e) => update(l, { dailyMinutes: Number(e.target.value) })}
                      className="text-[12.5px] !py-1.5"
                    >
                      {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].map((m) => (
                        <option key={m} value={m}>
                          {fmtDuration(m * 60_000)}
                        </option>
                      ))}
                      {![15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].includes(l.dailyMinutes) && (
                        <option value={l.dailyMinutes}>{fmtDuration(l.dailyMinutes * 60_000)}</option>
                      )}
                    </select>
                    <select value={l.mode} onChange={(e) => update(l, { mode: e.target.value as LimitMode })} className="text-[12.5px] !py-1.5">
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-ghost !p-2" onClick={() => remove(l.id)} aria-label="Remove limit">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <Meter value={l.usedMs} max={cap} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Add a limit">
        <div className="grid grid-cols-[1fr_140px] gap-3 mb-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-secondary">Application</span>
            <select value={appId} onChange={(e) => setAppId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Choose an application</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-secondary">Minutes per day</span>
            <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 mb-4">
          <span className="text-[12.5px] text-secondary">When the limit is reached</span>
          <Segmented options={MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} />
          <span className="text-[12px] text-muted">{MODES.find((m) => m.value === mode)?.hint}</span>
        </div>
        <button className="btn btn-accent" onClick={add} disabled={appId === ''}>
          Add limit
        </button>
      </Card>
    </Page>
  )
}
