import { Fragment, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ImagePlus } from 'lucide-react'
import { BotAvatar } from 'bot-avatars'
import type { Appearance, CompactResult, Diagnostics, LoginStatus, Settings as SettingsT, TrackerStatus, UpdateStatus } from '../../../shared/types'
import { AVATAR_BOTS, AVATAR_NAMES, DAY_START_OPTIONS, FONT_OPTIONS, RETENTION_OPTIONS } from '../../../shared/types'
import { ACCENT_PRESETS, DARK_BASES, LIGHT_BASES, accentForMode, applyAppearance } from '@/lib/theme'
import { fmtTime, setDayStartHour } from '@/lib/format'
import { useEvent, usePoll } from '@/lib/hooks'
import { fmtDayShort } from '@/lib/format'
import { Card, Page, PageHeader, Row, Segmented, Toggle } from '@/components/ui'
import { ColorPicker } from '@/components/ColorPicker'

/** Settings whose change only applies once the app has been started again. */
const NEEDS_RESTART: (keyof SettingsT)[] = ['hardwareAcceleration', 'windowMaterial']

/** Emphasised note used in hints for settings that need a restart. */
function Restart({ children = 'Takes effect after restarting the app.' }: { children?: string }): JSX.Element {
  return <strong className="font-semibold text-primary">{children}</strong>
}

export function Settings({ status, onRestartNeeded }: { status: TrackerStatus | null; onRestartNeeded: () => void }): JSX.Element {
  const [s, setS] = useState<SettingsT | null>(null)
  const [version, setVersion] = useState('')
  const info = usePoll(() => window.api.dataInfo(), [], 30_000)
  const [compacting, setCompacting] = useState(false)
  const [compacted, setCompacted] = useState<CompactResult | null>(null)
  const compactNow = async (): Promise<void> => {
    setCompacting(true)
    try {
      setCompacted(await window.api.compactData())
      info.refresh()
    } finally {
      setCompacting(false)
    }
  }
  const [login, setLogin] = useState<LoginStatus | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
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
    if (NEEDS_RESTART.some((k) => k in p && p[k] !== s[k])) onRestartNeeded()
    const saved = await window.api.setSettings(next)
    setDayStartHour(saved.dayStartHour)
    setS(saved)
    if ('launchAtStartup' in p) setTimeout(refreshLogin, 300)
  }

  if (!s) return <Page>{null}</Page>

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Everything stays on this PC. No account, no cloud. The only network call is an optional update check." />

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
        <Row
          label="Day starts at"
          hint="Anything you do before this hour counts toward the previous day, so a late night stays on the evening it belongs to. Changing it re-files what has been recorded so far."
        >
          <Segmented options={DAY_START_OPTIONS} value={s.dayStartHour} onChange={(v) => patch({ dayStartHour: v })} />
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
          label="Record background audio"
          hint="Apps that play sound while another app is in front (music, podcasts, a video in a background tab) are recorded as listening time for that app and shown under its idle time. It overlaps the app you are using and is never added to the day's screen time."
        >
          <Toggle checked={s.backgroundAudio} onChange={(v) => patch({ backgroundAudio: v })} />
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
        <Row label="Notifications" hint="Master switch for every Windows notification the app sends: limits, focus, breaks, digests, streak reminders and update notices.">
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
        <Row label="Streak reminder" hint="Once a day at this time, if a streak is not met yet or is within 15% of its limit.">
          <input
            type="time"
            value={s.streakReminderTime}
            onChange={(e) => e.target.value && patch({ streakReminderTime: e.target.value })}
            className="!py-1.5 num"
            disabled={!s.streakRemindersEnabled}
          />
          <Toggle checked={s.streakRemindersEnabled} onChange={(v) => patch({ streakRemindersEnabled: v })} />
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
      <CompanionCard s={s} patch={patch} />

      <Card title="Performance" className="mb-3">
        <Row
          label="Hardware acceleration"
          hint={
            <>
              Off by default to keep memory and GPU use low (about 110 MB resident instead of 190 MB). Turn on for smoother animations. <Restart />
            </>
          }
        >
          <Toggle checked={s.hardwareAcceleration} onChange={(v) => patch({ hardwareAcceleration: v })} />
        </Row>
        <Row
          label="Window glass"
          hint={
            <>
              Windows 11 draws Mica or Acrylic behind the window with no cost to the app. <Restart /> Best with the Neutral or Navy base.
            </>
          }
        >
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
              ? `${info.data.sessions.toLocaleString()} sessions across ${info.data.apps} apps${info.data.firstDay ? ` since ${fmtDayShort(info.data.firstDay)}` : ''} · ${fmtBytes(info.data.bytes)}${
                  info.data.compactedDays ? ` · ${info.data.compactedDays} older ${info.data.compactedDays === 1 ? 'day' : 'days'} kept as daily totals` : ''
                }`
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
        <Row
          label="Keep full detail for"
          hint="Older days are folded into per-app daily totals, so reports, averages and categories keep working while the database stays small and fast. Minute-by-minute timelines for those days are removed. Runs a few times a day, or right away with Compact."
        >
          <Segmented options={RETENTION_OPTIONS} value={s.retentionMonths} onChange={(v) => patch({ retentionMonths: v })} />
          <button className="btn" disabled={s.retentionMonths === 0 || compacting} onClick={() => void compactNow()} title="Fold days outside the window now">
            {compacting ? 'Compacting…' : 'Compact'}
          </button>
        </Row>
        {compacted && (
          <div className="text-[12.5px] text-secondary py-2">
            {compacted.days > 0
              ? `Folded ${compacted.days} ${compacted.days === 1 ? 'day' : 'days'} into daily totals (${compacted.sessions.toLocaleString()} sessions).`
              : 'Nothing is older than the retention window yet.'}
          </div>
        )}
        <Row label="Delete usage data" hint="Removes all recorded sessions and focus history. Settings and limits stay.">
          <button className="btn btn-danger" onClick={() => window.api.clearData().then((ok) => ok && info.refresh())}>
            Delete
          </button>
        </Row>
      </Card>

      <DiagnosticsCard />

      <Card title="About" className="mb-3">
        <Row label={`DeskTime ${version}`} hint="Screen time for Windows. Logs hold only app health (start, errors, crashes), never your activity. Attach the newest log when reporting a problem.">
          <button className="btn" onClick={() => window.api.openLogs()}>
            Open logs
          </button>
        </Row>
        <UpdateRows s={s} patch={patch} />
      </Card>

      <Card title="Quit">
        <Row label="Quit DeskTime" hint="Close this window and keep tracking from the tray, or quit completely, tray icon included.">
          {confirmQuit ? (
            <>
              <button className="btn" onClick={() => window.api.closeWindow()}>
                Keep running in background
              </button>
              <button className="btn btn-danger" onClick={() => window.api.quit()}>
                Complete quit
              </button>
            </>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmQuit(true)}>
              Quit DeskTime
            </button>
          )}
        </Row>
        {confirmQuit && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px]" style={{ background: 'rgba(183, 121, 31, 0.1)', color: 'var(--warning)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-px" />
            <div>
              <div className="font-semibold">A complete quit stops all monitoring.</div>
              <div className="mt-0.5 opacity-90">
                Screen time, background audio, limits, streaks and reminders all stop until you start DeskTime again, and the time in between is not recorded. Keeping it in the
                background closes this window only; the tracker stays in the tray.
              </div>
            </div>
          </div>
        )}
      </Card>
    </Page>
  )
}

/** Shrinks a picked image to a small square data URL so it stores comfortably in settings. */
async function photoToDataUrl(file: File, size = 128): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const side = Math.min(bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

/** Companion picker: one round button per bot, the user's picture, or off; plus when it sleeps. */
function CompanionCard({ s, patch }: { s: SettingsT; patch: (p: Partial<SettingsT>) => Promise<void> }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const spring = { type: 'spring' as const, stiffness: 420, damping: 34 }
  const onPhotoButton = (): void => {
    if (!s.avatarPhoto || s.avatar === 'photo') fileRef.current?.click()
    else void patch({ avatar: 'photo' })
  }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await patch({ avatar: 'photo', avatarPhoto: await photoToDataUrl(file) })
    } catch (err) {
      void window.api.reportError(`avatar photo: ${String(err)}`)
    }
  }
  const highlight = <motion.span layoutId="avatar-choice" transition={spring} className="absolute inset-0 rounded-full" style={{ background: 'var(--control)', boxShadow: '0 0 0 1px var(--border-2)' }} />
  return (
    <Card title="Companion" className="mb-3">
      <Row label="Avatar" hint="A small character on the Overview that reacts to your day: it hops when you switch apps and dozes off at night. Pick one, use your own picture, or turn it off.">
        <div className="flex items-center gap-0.5">
          {AVATAR_BOTS.map((bot) => (
            <button
              key={bot}
              type="button"
              aria-label={AVATAR_NAMES[bot]}
              aria-pressed={s.avatar === bot}
              onClick={() => patch({ avatar: bot })}
              className="has-tip relative grid h-[32px] w-[32px] place-items-center rounded-full"
            >
              <span className="tip" aria-hidden>
                {AVATAR_NAMES[bot]}
              </span>
              {s.avatar === bot && highlight}
              <span className={`relative transition-opacity ${s.avatar === bot ? '' : 'opacity-55 hover:opacity-100'}`}>
                <BotAvatar type={bot} size={22} interactive={false} paused={s.avatar !== bot} />
              </span>
            </button>
          ))}
          <button type="button" aria-label="Your picture" aria-pressed={s.avatar === 'photo'} onClick={onPhotoButton} className="relative grid h-[32px] w-[32px] place-items-center rounded-full" title={s.avatarPhoto ? 'Click again to choose another picture' : 'Choose a picture'}>
            {s.avatar === 'photo' && highlight}
            {s.avatarPhoto ? (
              <img src={s.avatarPhoto} alt="" className="relative h-[22px] w-[22px] rounded-full object-cover" />
            ) : (
              <ImagePlus size={15} className="relative text-secondary" />
            )}
          </button>
          <button type="button" aria-pressed={s.avatar === 'none'} onClick={() => patch({ avatar: 'none' })} className="relative grid h-[32px] px-2.5 place-items-center rounded-full text-[12.5px] text-secondary">
            {s.avatar === 'none' && highlight}
            <span className="relative">Off</span>
          </button>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp" className="hidden" onChange={(e) => void onFile(e)} />
        </div>
      </Row>
      <Row label="Sleeps" hint="When the companion dozes off.">
        <Segmented
          options={[
            { value: 'time', label: '23:00 – 06:00' },
            { value: 'idle', label: 'When idle' },
            { value: 'never', label: 'Never' }
          ]}
          value={s.avatarSleeps}
          onChange={(v) => patch({ avatarSleeps: v })}
        />
      </Row>
    </Card>
  )
}

function fmtBytes(b: number): string {
  if (b < 1_048_576) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / 1_048_576).toFixed(1)} MB`
}

/** Update check toggle plus the current updater state with the matching action. */
function UpdateRows({ s, patch }: { s: SettingsT; patch: (p: Partial<SettingsT>) => Promise<void> }): JSX.Element {
  const [u, setU] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    void window.api.updateStatus().then(setU)
  }, [])
  useEvent<UpdateStatus>('update:status', setU)

  const text = !u
    ? ''
    : u.state === 'disabled'
      ? (u.reason ?? 'Automatic checks are off.')
      : u.state === 'checking'
        ? 'Checking GitHub Releases…'
        : u.state === 'available'
          ? `DeskTime ${u.version} is available.`
          : u.state === 'downloading'
            ? `Downloading ${u.version}… ${u.percent}%`
            : u.state === 'downloaded'
              ? `DeskTime ${u.version} is downloaded. It installs when the app restarts.`
              : u.state === 'error'
                ? `Last check failed: ${u.error ?? 'unknown error'}`
                : u.state === 'not-available'
                  ? `You are on the latest version${u.checkedAt ? `. Checked ${fmtTime(u.checkedAt)}` : ''}.`
                  : 'Checks at startup and every six hours.'
  const busy = u?.state === 'checking' || u?.state === 'downloading'

  return (
    <>
      <Row
        label="Check for updates automatically"
        hint="The only network request DeskTime makes: it asks GitHub Releases for the newest version number at startup and every six hours. Nothing about you or your usage is sent. Downloads only start when you ask."
      >
        <Toggle checked={s.autoUpdateCheck} onChange={(v) => patch({ autoUpdateCheck: v })} />
      </Row>
      <Row label="Updates" hint={text}>
        {u?.state === 'available' && (
          <button className="btn btn-accent" onClick={() => window.api.downloadUpdate().then(setU)}>
            Download {u.version}
          </button>
        )}
        {u?.state === 'downloaded' && (
          <button className="btn btn-accent" onClick={() => window.api.installUpdate()}>
            Restart to update
          </button>
        )}
        {u && !busy && u.state !== 'downloaded' && (
          <button className="btn" onClick={() => window.api.checkForUpdates().then(setU)}>
            Check now
          </button>
        )}
      </Row>
    </>
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
        ['Attributed to', d.currentApp ?? 'nothing'],
        ['Display kept awake', yes(d.displayRequired)],
        ['Mic / camera in use', d.devicesInUse.length ? d.devicesInUse.join(', ') : 'none'],
        ['Playing audio', d.audio.length ? d.audio.map((a) => `${a.name} (${Math.round(a.peak * 100)}%)`).join(', ') : 'nothing'],
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
  const [customOpen, setCustomOpen] = useState(false)

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
          <div className="relative ml-1">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12.5px]"
              style={{ borderColor: isPreset ? 'var(--border)' : 'var(--accent)' }}
              aria-expanded={customOpen}
              onClick={() => setCustomOpen((v) => !v)}
            >
              <span className="w-4 h-4 rounded-full border border-border" style={{ background: customHex ? accentForMode(customHex, dark) : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
              Custom
            </button>
            {customOpen && (
              <div className="absolute right-0 top-full mt-2 z-20">
                <ColorPicker value={customHex || (dark ? '#ff7a6b' : '#d9503f')} onChange={(hex) => set({ accent: hex })} onClose={() => setCustomOpen(false)} />
              </div>
            )}
          </div>
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
      <Row label="Font" hint="System is Segoe UI Variable, the Windows 11 font. The others are bundled and work offline.">
        <Segmented
          options={FONT_OPTIONS}
          value={a.font}
          onChange={(v) => set({ font: v })}
        />
      </Row>
    </Card>
  )
}
