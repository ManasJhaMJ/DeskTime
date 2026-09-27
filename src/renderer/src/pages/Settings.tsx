import { Fragment, useEffect, useState } from 'react'
import type { Appearance, Diagnostics, LoginStatus, Settings as SettingsT, TrackerStatus } from '../../../shared/types'
import { ACCENT_PRESETS, DARK_BASES, LIGHT_BASES, accentForMode, applyAppearance } from '@/lib/theme'
import { fmtTime } from '@/lib/format'
import { usePoll } from '@/lib/hooks'
import { fmtDayShort } from '@/lib/format'
import { Card, Page, PageHeader, Row, Segmented, Toggle } from '@/components/ui'

export function Settings({ status }: { status: TrackerStatus | null }): JSX.Element {
  const [s, setS] = useState<SettingsT | null>(null)
  const [version, setVersion] = useState('')
  const info = usePoll(() => window.api.dataInfo(), [], 30_000)
  const [login, setLogin] = useState<LoginStatus | null>(null)
  const refreshLogin = (): void => {
    void window.api.loginStatus().then(setLogin)
  }

  useEffect(() => {
    void window.api.getSettings().then(setS)
    void window.api.version().then(setVersion)
    refreshLogin()
  }, [])

  const patch = async (p: Partial<SettingsT>): Promise<void> => {
    if (!s) return
    const next = { ...s, ...p }
    setS(next)
    setS(await window.api.setSettings(next))
    if ('launchAtStartup' in p) setTimeout(refreshLogin, 300)
  }

  if (!s) return <Page>{null}</Page>

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Everything stays on this PC. No account, no cloud, no internet required." />

      <Card title="Tracking" className="mb-3">
        <Row label="Idle after" hint="Time without keyboard or mouse input before you count as idle.">
          <Segmented
            options={[
              { value: 30, label: '30s' },
              { value: 60, label: '1m' },
              { value: 120, label: '2m' },
              { value: 300, label: '5m' }
            ]}
            value={s.idleThresholdSec}
            onChange={(v) => patch({ idleThresholdSec: v })}
          />
        </Row>
        <Row label="Tracking" hint={status?.paused ? 'Paused. Nothing is being recorded.' : 'Foreground application and idle state, once per second.'}>
          {status?.paused ? (
            <button className="btn" onClick={() => window.api.resumeTracking()}>
              Resume
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => window.api.pauseTracking(30)}>
                Pause 30 min
              </button>
              <button className="btn" onClick={() => window.api.pauseTracking()}>
                Pause
              </button>
            </>
          )}
        </Row>
        <Row label="Passive band" hint="No input for this long still counts as passive use (reading, thinking). Longer than that is idle. Passive time is included in active totals and shown separately.">
          <Segmented
            options={[
              { value: 0, label: 'Off' },
              { value: 2, label: '2 min' },
              { value: 5, label: '5 min' },
              { value: 10, label: '10 min' }
            ]}
            value={s.passiveMinutes}
            onChange={(v) => patch({ passiveMinutes: v })}
          />
        </Row>
        <Row label="Stop at display sleep" hint="Once you have been idle longer than your power plan's display timeout the screen is off, so nothing after that counts as screen time.">
          <Toggle checked={s.capAtDisplayOff} onChange={(v) => patch({ capAtDisplayOff: v })} />
        </Row>
        <Row label="Count calls as active" hint="While an app is using the microphone or camera, time stays active even with no input.">
          <Toggle checked={s.callsCountActive} onChange={(v) => patch({ callsCountActive: v })} />
        </Row>
        <Row label="Count media as active" hint="Watching a video or a fullscreen app with no keyboard or mouse input still counts as active time.">
          <Toggle checked={s.mediaCountsActive} onChange={(v) => patch({ mediaCountsActive: v })} />
        </Row>
        <Row
          label="Record window titles"
          hint="Off by default. When on, DeskTime stores the title of the active window (browser tab, document, project) so you can see what you did inside an app. Titles never leave this PC."
        >
          {s.trackWindowTitles && (
            <button className="btn btn-ghost text-[12.5px]" onClick={() => window.api.clearContexts()}>
              Delete titles
            </button>
          )}
          <Toggle checked={s.trackWindowTitles} onChange={(v) => patch({ trackWindowTitles: v })} />
        </Row>
        <Row label="Show screen time in tray" hint="Today's total appears in the tray tooltip and menu.">
          <Toggle checked={s.showTrayScreenTime} onChange={(v) => patch({ showTrayScreenTime: v })} />
        </Row>
      </Card>

      <Card title="Startup" className="mb-3">
        <Row
          label="Launch at Windows startup"
          hint={
            login === null
              ? 'Starts quietly in the tray.'
              : login.openAtLogin
                ? 'Registered with Windows. Starts quietly in the tray at sign-in.'
                : 'Not registered with Windows.'
          }
        >
          <Toggle checked={s.launchAtStartup} onChange={(v) => patch({ launchAtStartup: v })} />
        </Row>
        <Row label="Start minimized" hint="Do not open the dashboard when launched at startup.">
          <Toggle checked={s.startMinimized} onChange={(v) => patch({ startMinimized: v })} />
        </Row>
      </Card>

      <Card title="Notifications and breaks" className="mb-3">
        <Row label="Notifications" hint="Limits, focus interruptions and break reminders.">
          <Toggle checked={s.notificationsEnabled} onChange={(v) => patch({ notificationsEnabled: v })} />
        </Row>
        <Row label="Break reminders" hint="Remind me after a long stretch of continuous activity.">
          <Toggle checked={s.breakRemindersEnabled} onChange={(v) => patch({ breakRemindersEnabled: v })} />
        </Row>
        <Row label="Remind me after">
          <Segmented
            options={[30, 60, 90, 120].map((m) => ({ value: m, label: `${m} min` }))}
            value={s.breakIntervalMin}
            onChange={(v) => patch({ breakIntervalMin: v })}
          />
        </Row>
        <Row label="Daily digest" hint="One notification with today's total, active time and most used app.">
          <input
            type="time"
            value={s.dailyDigestTime}
            onChange={(e) => e.target.value && patch({ dailyDigestTime: e.target.value })}
            className="!py-1.5 num"
            disabled={!s.dailyDigestEnabled}
          />
          <Toggle checked={s.dailyDigestEnabled} onChange={(v) => patch({ dailyDigestEnabled: v })} />
        </Row>
        <Row label="Weekly digest" hint="Monday morning: last week's total, daily average and the change from the week before.">
          <Toggle checked={s.weeklyDigestEnabled} onChange={(v) => patch({ weeklyDigestEnabled: v })} />
        </Row>
        <Row label="Break duration" hint="A pause at least this long resets the activity streak.">
          <Segmented
            options={[5, 10, 15].map((m) => ({ value: m, label: `${m} min` }))}
            value={s.breakDurationMin}
            onChange={(v) => patch({ breakDurationMin: v })}
          />
        </Row>
      </Card>

      <AppearanceCard s={s} patch={patch} />

      <Card title="Performance" className="mb-3">
        <Row label="Hardware acceleration" hint="Off by default to keep memory and GPU use low (about 110 MB resident instead of 190 MB). Turn on for smoother animations. Takes effect after restarting the app.">
          <Toggle checked={s.hardwareAcceleration} onChange={(v) => patch({ hardwareAcceleration: v })} />
        </Row>
        <Row label="Window glass" hint="Windows 11 draws Mica or Acrylic behind the window with no cost to the app. Takes effect after restarting. Best with the Neutral or Navy base.">
          <Segmented
            options={[
              { value: 'none', label: 'Off' },
              { value: 'mica', label: 'Mica' },
              { value: 'acrylic', label: 'Acrylic' }
            ]}
            value={s.windowMaterial}
            onChange={(v) => patch({ windowMaterial: v })}
          />
        </Row>
        <Row label="Background footprint" hint="Closing this window frees its memory. The tracker keeps running in the tray using a few cheap system calls per second." />
      </Card>

      <Card title="Your data" className="mb-3">
        <Row
          label="Local database"
          hint={
            info.data
              ? `${info.data.sessions.toLocaleString()} sessions across ${info.data.apps} apps${info.data.firstDay ? ` since ${fmtDayShort(info.data.firstDay)}` : ''}`
              : 'SQLite file in your user profile'
          }
        >
          <button className="btn" onClick={() => window.api.openDataFolder()}>
            Open folder
          </button>
          <button className="btn" onClick={() => window.api.exportData()}>
            Export JSON
          </button>
        </Row>
        <Row label="Delete usage data" hint="Removes all recorded sessions and focus history. Settings and limits stay.">
          <button className="btn btn-danger" onClick={() => window.api.clearData().then((ok) => ok && info.refresh())}>
            Delete
          </button>
        </Row>
      </Card>

      <DiagnosticsCard />

      <Card title="About">
        <Row label={`DeskTime ${version}`} hint="Screen time for Windows. Logs hold only app health (start, errors, crashes), never your activity. Attach the newest log when reporting a problem.">
          <button className="btn" onClick={() => window.api.openLogs()}>
            Open logs
          </button>
          <button className="btn btn-ghost" onClick={() => window.api.quit()}>
            Quit app
          </button>
        </Row>
      </Card>
    </Page>
  )
}

/** Live view of what the tracker sees, refreshed every second while open. */
function DiagnosticsCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  const diag = usePoll<Diagnostics | null>(() => (open ? window.api.diagnostics() : Promise.resolve(null)), [open], 1000, [])
  const d = open ? diag.data : null
  const yes = (v: boolean): string => (v ? 'yes' : 'no')
  const rows: [string, string][] = d
    ? [
        ['State', d.state],
        ['Idle for', `${d.idleSec}s (threshold ${d.idleThresholdSec}s, passive band ${d.passiveMinutes ? d.passiveMinutes + ' min' : 'off'})`],
        ['Display sleeps after', d.displayTimeoutSec ? `${Math.round(d.displayTimeoutSec / 60)} min (${d.onBattery ? 'battery' : 'plugged in'})` : 'never'],
        ['Foreground exe', d.foreground?.exePath ?? 'none'],
        ['Process id', d.foreground ? String(d.foreground.pid) : ''],
        ['Package family', d.foreground?.packageFamily ?? 'classic app'],
        ['Real window', d.foreground ? `${yes(d.foreground.isRealWindow)}, fullscreen ${yes(d.foreground.fullscreen)}` : ''],
        ['Window title', d.foreground?.title ?? (d.foreground ? 'not recorded (titles off)' : '')],
        ['Attributed to', d.currentApp ?? 'nothing'],
        ['Display kept awake', yes(d.displayRequired)],
        ['Mic / camera in use', d.devicesInUse.length ? d.devicesInUse.join(', ') : 'none'],
        ['Live session', d.liveSession ? `${d.liveSession.kind} since ${fmtTime(d.liveSession.start)}` : 'none'],
        ['Database', d.dbPath],
        ['Versions', `DeskTime ${d.versions.app} · Electron ${d.versions.electron} · Node ${d.versions.node}`]
      ]
    : []
  return (
    <Card
      title="Diagnostics"
      className="mb-3"
      right={
        <button className="btn btn-ghost !py-1 !px-2 text-[12.5px]" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show live view'}
        </button>
      }
    >
      {!open ? (
        <div className="text-[12.5px] text-secondary">What the tracker sees right now: foreground window, idle timer, media and call flags. Use it when something looks misattributed.</div>
      ) : !d ? (
        <div className="text-[12.5px] text-muted">Loading…</div>
      ) : (
        <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-[12.5px] num">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-secondary">{k}</dt>
              <dd className="truncate" title={v}>
                {v}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </Card>
  )
}

/** Theme mode, surface families, accent, corners, motion and font. Every change previews instantly. */
function AppearanceCard({ s, patch }: { s: SettingsT; patch: (p: Partial<SettingsT>) => Promise<void> }): JSX.Element {
  const a = s.appearance
  const dark = document.documentElement.classList.contains('dark')
  const set = (p: Partial<Appearance>): void => {
    const next = { ...a, ...p }
    applyAppearance(next, document.documentElement.classList.contains('dark'))
    void patch({ appearance: next })
  }
  const isPreset = ACCENT_PRESETS.some((p) => p.id === a.accent)
  const customHex = isPreset ? '' : a.accent

  const Swatch = ({ color, on, label, hint, onClick }: { color: string; on: boolean; label: string; hint?: string; onClick: () => void }): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors"
      style={{ borderColor: on ? 'var(--accent)' : 'var(--border)', background: on ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent' }}
    >
      <span className="w-6 h-6 rounded-md border border-border shrink-0" style={{ background: color }} />
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight">{label}</span>
        {hint && <span className="block text-[11.5px] text-muted leading-tight mt-0.5">{hint}</span>}
      </span>
    </button>
  )

  return (
    <Card title="Appearance" className="mb-3">
      <Row label="Theme" hint="System follows the Windows light or dark setting and switches live.">
        <Segmented
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
          value={s.theme}
          onChange={(v) => patch({ theme: v })}
        />
      </Row>
      <div className="py-3.5 border-b border-border">
        <div className="text-[14px]">Dark surfaces</div>
        <div className="text-[12.5px] text-secondary mt-0.5 mb-3">The base family used whenever dark mode is active.</div>
        <div className="grid grid-cols-4 gap-2">
          {DARK_BASES.map((b) => (
            <Swatch key={b.id} color={b.swatch} on={a.darkBase === b.id} label={b.name} hint={b.hint} onClick={() => set({ darkBase: b.id })} />
          ))}
        </div>
      </div>
      <div className="py-3.5 border-b border-border">
        <div className="text-[14px]">Light surfaces</div>
        <div className="text-[12.5px] text-secondary mt-0.5 mb-3">The base family used whenever light mode is active.</div>
        <div className="grid grid-cols-4 gap-2">
          {LIGHT_BASES.map((b) => (
            <Swatch key={b.id} color={b.swatch} on={a.lightBase === b.id} label={b.name} hint={b.hint} onClick={() => set({ lightBase: b.id })} />
          ))}
        </div>
      </div>
      <div className="py-3.5 border-b border-border">
        <div className="text-[14px]">Accent</div>
        <div className="text-[12.5px] text-secondary mt-0.5 mb-3">
          Buttons, the active page, focus ring, meters and the heatmap. Presets have a tuned shade per mode; a custom color is adjusted so it stays readable.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => {
            const on = a.accent === p.id
            return (
              <button
                key={p.id}
                type="button"
                title={p.name}
                onClick={() => set({ accent: p.id })}
                className="w-7 h-7 rounded-full grid place-items-center"
                style={{ background: dark ? p.dark : p.light, outline: on ? '2px solid var(--primary)' : '2px solid transparent', outlineOffset: 2 }}
                aria-label={p.name}
              />
            )
          })}
          <label
            className="ml-1 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12.5px] cursor-pointer"
            style={{ borderColor: isPreset ? 'var(--border)' : 'var(--accent)' }}
          >
            <span className="w-4 h-4 rounded-full border border-border" style={{ background: customHex ? accentForMode(customHex, dark) : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
            Custom
            <input
              type="color"
              value={customHex || (dark ? '#ff7a6b' : '#d9503f')}
              onChange={(e) => set({ accent: e.target.value })}
              className="w-0 h-0 opacity-0 absolute"
            />
          </label>
        </div>
      </div>
      <Row label="Corners" hint="Card and control roundness.">
        <Segmented
          options={[
            { value: 'sharp', label: 'Sharp' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'soft', label: 'Soft' }
          ]}
          value={a.radius}
          onChange={(v) => set({ radius: v })}
        />
      </Row>
      <Row label="Motion" hint="Full keeps entrances, count-ups and pulses. Reduced keeps only page transitions. Off disables all animation.">
        <Segmented
          options={[
            { value: 'full', label: 'Full' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'off', label: 'Off' }
          ]}
          value={a.motion}
          onChange={(v) => set({ motion: v })}
        />
      </Row>
      <Row label="Font" hint="Manrope is bundled and rounded. System uses Segoe UI Variable, the Windows 11 font.">
        <Segmented
          options={[
            { value: 'manrope', label: 'Manrope' },
            { value: 'system', label: 'System' }
          ]}
          value={a.font}
          onChange={(v) => set({ font: v })}
        />
      </Row>
    </Card>
  )
}
