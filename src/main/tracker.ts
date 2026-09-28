// Background tracker: polls the foreground window once per second (a few cheap FFI calls),
// detects idle via Electron's powerMonitor, and records sessions to SQLite.
//
// Session kinds: 0 active (input), 2 passive (no input inside the passive band, e.g. reading),
// 1 idle (away). Media playback and calls keep time active with no input. Once idle exceeds the
// display-sleep timeout the screen is off and nothing is recorded until input returns.
import { EventEmitter } from 'events'
import { app as electronApp, nativeImage, powerMonitor } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { DB, dayStart, toDay } from './db'
import {
  friendlyName,
  getForeground,
  isDisplayRequired,
  isKnownFriendly,
  SYSTEM_PROCESSES,
  type ForegroundInfo
} from './win32'
import { appInCall, devicesInUse } from './consent'
import { displayTimeoutInfo, displayTimeoutSec, refreshDisplayTimeout } from './power'
import type { AppInfo, Diagnostics, Settings, TrackerStatus } from '../shared/types'

export interface TickInfo {
  now: number
  app: AppInfo
  fg: ForegroundInfo | null
  /** True only for real idle (away), not for passive use. */
  isIdle: boolean
  activeStreakMs: number
}

type Kind = 0 | 1 | 2
type State = 'active' | 'passive' | 'idle' | 'media' | 'call' | 'screen-off'

interface Live {
  id: number
  /** Raw app the session is recorded under (merges are applied at query time). */
  appId: number
  kind: Kind
  start: number
  end: number
  day: string
}

const TICK_MS = 1000
const FLUSH_MS = 15_000
const STATUS_MS = 5000
const STALL_MS = 10_000
/** A new foreground app must stay in front this long before it counts (kills alt-tab flicker and popups). */
const DEBOUNCE_MS = 2000
/** How long to keep attributing time to the previous app while a non-real window (broker, splash) is in front. */
const UNREAL_GRACE_MS = 15_000
/** A window title must persist this long before it is recorded (skips tab-cycling and loading titles). */

export class Tracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private live: Live | null = null
  private lastFlush = 0
  private lastTick = 0
  private lastStatus = 0
  private paused = false
  private pausedUntil: number | null = null
  private locked = false
  private state: State = 'active'
  private idleSince: number | null = null
  private currentApp: AppInfo | null = null
  private currentRawId: number | null = null
  private pending: { rawId: number; app: AppInfo; since: number } | null = null
  private unrealSince: number | null = null
  private sinceTs = Date.now()
  private streakStart: number | null = null
  private readonly appCache = new Map<string, AppInfo>()
  private lastDiag: Partial<Diagnostics> = {}

  constructor(
    private readonly db: DB,
    private readonly getSettings: () => Settings,
    private readonly dbPath: string
  ) {
    super()
  }

  /** Call after apps are renamed, hidden or merged so the next tick re-resolves them. */
  clearAppCache(): void {
    this.appCache.clear()
    if (this.currentApp) {
      const fresh = this.db.getApp(this.currentRawId ?? this.currentApp.id)
      this.currentApp = fresh ? this.db.effectiveApp(fresh) : this.currentApp
    }
  }

  start(): void {
    if (this.timer) return
    this.lastTick = Date.now()
    this.sinceTs = this.lastTick
    refreshDisplayTimeout(true)
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.closeLive(Date.now())
  }

  pause(minutes?: number): void {
    const now = Date.now()
    this.paused = true
    this.pausedUntil = minutes ? now + minutes * 60_000 : null
    this.closeLive(now)
    this.streakStart = null
    this.emitStatus(true)
  }

  resume(): void {
    this.paused = false
    this.pausedUntil = null
    this.sinceTs = Date.now()
    this.emitStatus(true)
  }

  isPaused(): boolean {
    return this.paused
  }

  setLocked(locked: boolean): void {
    if (this.locked === locked) return
    this.locked = locked
    if (locked) {
      this.closeLive(Date.now())
      this.streakStart = null
    } else {
      this.sinceTs = Date.now()
      refreshDisplayTimeout(true)
    }
    this.emitStatus(true)
  }

  /** Writes the in-memory end timestamp of the live session to the database. */
  flush(): void {
    if (this.live) this.db.updateSessionEnd(this.live.id, this.live.end)
    this.lastFlush = Date.now()
  }

  getStatus(): TrackerStatus {
    this.flush()
    const now = Date.now()
    const totals = this.db.dayTotals(toDay(now))
    return {
      tracking: !this.paused && !this.locked,
      media: this.state === 'media',
      call: this.state === 'call',
      passive: this.state === 'passive',
      screenOff: this.state === 'screen-off',
      paused: this.paused,
      pausedUntil: this.pausedUntil,
      idle: this.state === 'idle' || this.state === 'screen-off',
      locked: this.locked,
      currentApp: this.currentApp,
      sinceTs: this.sinceTs,
      todayScreenMs: totals.screenMs,
      todayActiveMs: totals.activeMs,
      activeStreakMs: this.streakMs(now)
    }
  }

  /** Snapshot for the diagnostics panel. */
  getDiagnostics(): Diagnostics {
    const s = this.getSettings()
    const power = displayTimeoutInfo()
    const d = this.lastDiag
    return {
      now: Date.now(),
      state: this.paused ? 'paused' : this.locked ? 'locked' : (d.state ?? 'none'),
      idleSec: d.idleSec ?? 0,
      idleThresholdSec: s.idleThresholdSec,
      passiveMinutes: s.passiveMinutes,
      displayTimeoutSec: displayTimeoutSec(),
      onBattery: power.onBattery,
      foreground: d.foreground ?? null,
      currentApp: this.currentApp?.displayName ?? null,
      displayRequired: d.displayRequired ?? false,
      devicesInUse: devicesInUse(),
      liveSession: this.live
        ? { kind: this.live.kind === 0 ? 'active' : this.live.kind === 1 ? 'idle' : 'passive', start: this.live.start }
        : null,
      dbPath: this.dbPath,
      versions: { app: electronApp.getVersion(), electron: process.versions.electron, node: process.versions.node }
    }
  }

  private streakMs(now: number): number {
    if (this.streakStart === null || this.state === 'idle' || this.state === 'screen-off') return 0
    return now - this.streakStart
  }

  private emitStatus(force: boolean): void {
    const now = Date.now()
    if (!force && now - this.lastStatus < STATUS_MS) return
    this.lastStatus = now
    this.emit('status')
  }

  private closeLive(end: number): void {
    if (!this.live) return
    this.live.end = Math.max(this.live.start, end)
    // Drop zero-length rows (e.g. instant switches) to keep the table lean.
    if (this.live.end - this.live.start < 300) this.db.deleteSession(this.live.id)
    else this.db.updateSessionEnd(this.live.id, this.live.end)
    this.live = null
  }

  private openLive(appId: number, kind: Kind, start: number): void {
    const day = toDay(start)
    const id = this.db.insertSession(appId, start, start, kind, day)
    this.live = { id, appId, kind, start, end: start, day }
  }

  private tick(): void {
    const now = Date.now()
    try {
      // Sleep / hibernate / stalled process / clock moved backwards: do not attribute the gap to the last app.
      if ((now - this.lastTick > STALL_MS || now < this.lastTick) && this.live) {
        this.closeLive(Math.min(now, this.lastTick + TICK_MS))
        this.streakStart = null
        this.sinceTs = now
      }
      this.lastTick = now

      if (this.paused) {
        if (this.pausedUntil && now >= this.pausedUntil) this.resume()
        else {
          this.emitStatus(false)
          return
        }
      }
      if (this.locked) {
        this.emitStatus(false)
        return
      }

      const settings = this.getSettings()
      refreshDisplayTimeout()
      const idleSec = powerMonitor.getSystemIdleTime()
      const idleByInput = idleSec >= settings.idleThresholdSec

      const fg = getForeground()
      this.lastDiag = {
        idleSec,
        foreground: fg
          ? {
              exePath: fg.exePath,
              exeName: fg.exeName,
              pid: fg.pid,
              packageFamily: fg.packageFamily,
              isRealWindow: fg.isRealWindow,
              fullscreen: fg.fullscreen
            }
          : null
      }

      let switchBoundary = now
      if (fg) {
        // Never track ourselves: time spent in this dashboard is not recorded.
        if (fg.pid === process.pid) {
          this.closeLive(now)
          this.currentApp = null
          this.currentRawId = null
          this.pending = null
          this.lastDiag.state = 'self'
          this.emitStatus(false)
          return
        }
        // The lock screen host is reported as a normal window; treat it as locked.
        if (fg.exeName.toLowerCase() === 'lockapp.exe') {
          this.closeLive(now)
          this.emitStatus(false)
          return
        }
        if (!fg.isRealWindow) {
          // A broker, splash or tool window is in front. Keep the previous app for a grace period.
          this.unrealSince ??= now
          if (now - this.unrealSince > UNREAL_GRACE_MS) {
            this.closeLive(this.unrealSince)
            this.currentApp = null
            this.currentRawId = null
          }
          this.pending = null
          this.lastDiag.state = 'unreal'
        } else {
          this.unrealSince = null
          const raw = this.resolveApp(fg)
          if (raw.id !== this.currentRawId) {
            // Debounce: the newcomer has to stay in front for DEBOUNCE_MS before we switch.
            if (this.pending && this.pending.rawId === raw.id) {
              if (now - this.pending.since >= DEBOUNCE_MS || this.currentRawId === null) {
                switchBoundary = this.pending.since
                this.currentRawId = raw.id
                this.currentApp = this.db.effectiveApp(raw)
                this.pending = null
              }
            } else {
              this.pending = { rawId: raw.id, app: raw, since: now }
              if (this.currentRawId === null) {
                // Nothing tracked yet: start immediately, no need to wait.
                this.currentRawId = raw.id
                this.currentApp = this.db.effectiveApp(raw)
                this.pending = null
              }
            }
          } else {
            this.pending = null
          }
        }
      }
      const app = this.currentApp
      const rawId = this.currentRawId
      if (!app || rawId === null) {
        this.emitStatus(false)
        return
      }

      // ---- classify this second ------------------------------------------------
      const idleStart = now - idleSec * 1000
      const displayRequired = idleByInput ? isDisplayRequired() : false
      const media = idleByInput && settings.mediaCountsActive && !!fg && fg.isRealWindow && (fg.fullscreen || displayRequired)
      const call =
        idleByInput && !media && settings.callsCountActive && (appInCall(app.exePath, app.packageFamily) || devicesInUse().length > 0)
      const displayOff = displayTimeoutSec()
      const screenOff = idleByInput && !media && !call && settings.capAtDisplayOff && displayOff > 0 && idleSec >= displayOff
      const passive = idleByInput && !media && !call && !screenOff && settings.passiveMinutes > 0 && idleSec < settings.passiveMinutes * 60

      let state: State
      if (!idleByInput) state = 'active'
      else if (media) state = 'media'
      else if (call) state = 'call'
      else if (screenOff) state = 'screen-off'
      else if (passive) state = 'passive'
      else state = 'idle'
      const kind: Kind = state === 'idle' ? 1 : state === 'passive' ? 2 : 0
      const prev = this.state
      this.state = state
      this.lastDiag.state = state
      this.lastDiag.displayRequired = displayRequired

      // ---- screen off: cap the session at the moment the display went dark ----------
      if (state === 'screen-off') {
        if (this.live) this.closeLive(Math.max(this.live.start, idleStart + displayOff * 1000))
        this.streakStart = null
        this.emitStatus(prev !== state)
        return
      }
      if (prev === 'screen-off') {
        // Input is back: the gap while the screen was dark is not screen time.
        this.sinceTs = now
        this.idleSince = null
      }

      // ---- boundaries for kind changes ------------------------------------------
      let boundary = switchBoundary
      if (idleByInput && this.idleSince === null) {
        // No-input stretch really began idleThreshold seconds ago; backdate the transition,
        // but never before tracking (re)started.
        this.idleSince = Math.max(this.live?.start ?? this.sinceTs, idleStart)
        boundary = this.idleSince
      } else if (!idleByInput && this.idleSince !== null) {
        // Returning from a no-input stretch. Only a real break (>= break duration) resets the active streak.
        const away = now - this.idleSince
        if (away >= settings.breakDurationMin * 60_000) this.streakStart = now
        this.idleSince = null
      }
      if ((state === 'active' || state === 'media' || state === 'call') && this.streakStart === null) this.streakStart = now

      const day = toDay(now)
      if (this.live && this.live.day !== day) {
        // Midnight rollover: split exactly at the day boundary.
        const ds = dayStart(day)
        this.closeLive(ds)
        this.openLive(rawId, kind, ds)
      }
      if (this.live && this.live.appId !== rawId) {
        this.closeLive(Math.max(this.live.start, boundary))
      }
      if (this.live && this.live.kind !== kind) {
        if (this.live.kind === 2 && kind === 1) {
          // Passive turned out to be a real absence: the whole stretch since input stopped was idle.
          this.db.setSessionKind(this.live.id, 1)
          this.live.kind = 1
        } else {
          this.closeLive(Math.max(this.live.start, boundary))
        }
      }
      if (!this.live) this.openLive(rawId, kind, Math.max(this.sinceTs, boundary))
      else this.live.end = now

      if (now - this.lastFlush >= FLUSH_MS) this.flush()

      const info: TickInfo = { now, app, fg, isIdle: kind === 1, activeStreakMs: this.streakMs(now) }
      this.emit('tick', info)
      this.emitStatus(prev !== state)
    } catch (err) {
      console.error('[tracker] tick failed', err)
    }
  }

  private resolveApp(fg: ForegroundInfo): AppInfo {
    const key = fg.packageFamily ?? fg.exePath
    const cached = this.appCache.get(key)
    if (cached) return cached
    const { app, created } = this.db.getOrCreateApp(fg.exePath, fg.exeName, friendlyName(fg.exeName), fg.packageFamily)
    if (created && SYSTEM_PROCESSES.has(fg.exeName.toLowerCase())) {
      this.db.setAppHidden(app.id, true)
      app.hidden = true
    }
    this.appCache.set(key, app)
    if (created || !app.icon) void this.enrichApp(app, fg.packageFamily)
    return app
  }

  /** Startup pass: look up names and icons for apps that still lack an icon, one at a time. */
  async enrichMissing(limit = 12): Promise<void> {
    const todo = this.db.listApps().filter((a) => !a.icon && !a.hidden).slice(0, limit)
    for (const app of todo) {
      await this.enrichApp(app, app.packageFamily)
      this.appCache.clear()
    }
  }

  /** Runs once per newly seen executable: grabs a proper product name and icon. */
  private async enrichApp(app: AppInfo, packageFamily: string | null): Promise<void> {
    let named = false
    if (packageFamily) {
      const pkg = await packageInfo(packageFamily)
      if (pkg) {
        if (pkg.displayName && !app.nameLocked) {
          this.db.setAppName(app.id, pkg.displayName)
          app.displayName = pkg.displayName
          named = true
        }
        if (pkg.logo) {
          const icon = loadLogo(pkg.logo)
          if (icon) {
            this.db.setAppIcon(app.id, icon)
            app.icon = icon
          }
        }
      }
    }
    if (!app.icon) {
      try {
        const img = await electronApp.getFileIcon(app.exePath, { size: 'normal' })
        if (!img.isEmpty()) {
          const icon = img.toDataURL()
          this.db.setAppIcon(app.id, icon)
          app.icon = icon
        }
      } catch {
        /* ignore */
      }
    }
    if (!named && !isKnownFriendly(app.exeName) && !app.nameLocked) {
      const desc = await fileDescription(app.exePath)
      if (desc && desc.length < 64 && desc.toLowerCase() !== app.exeName.toLowerCase()) {
        this.db.setAppName(app.id, desc)
        app.displayName = desc
      }
    }
    this.emit('apps-changed')
  }
}

function runPowerShell(command: string, timeout = 15_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        const s = String(stdout).trim()
        resolve(s.length ? s : null)
      }
    )
  })
}

function fileDescription(exePath: string): Promise<string | null> {
  const safe = exePath.replace(/'/g, "''")
  return runPowerShell(`(Get-Item -LiteralPath '${safe}').VersionInfo.FileDescription`, 10_000)
}

/** Display name and logo path of a Store / MSIX package, via the Windows package manager. */
async function packageInfo(family: string): Promise<{ displayName: string | null; logo: string | null } | null> {
  const safe = family.replace(/'/g, '')
  const out = await runPowerShell(
    `$null = [Windows.Management.Deployment.PackageManager,Windows.Management.Deployment,ContentType=WindowsRuntime];` +
      `$p = (New-Object Windows.Management.Deployment.PackageManager).FindPackagesForUser('', '${safe}') | Select-Object -First 1;` +
      `if ($p) { $p.DisplayName; $p.Logo.LocalPath }`
  )
  if (out) {
    const [displayName, logo] = out.split(/\r?\n/).map((s) => s.trim())
    return { displayName: displayName || null, logo: logo || null }
  }
  // Fallback: Start menu entries carry the friendly name; their AppID starts with the family name.
  const name = await runPowerShell(`(Get-StartApps | Where-Object { $_.AppID -like '${safe}!*' } | Select-Object -First 1).Name`)
  return name ? { displayName: name, logo: null } : null
}

/** Package logos are declared as e.g. Assets\\StoreLogo.png but stored as scale variants; pick a good one. */
function loadLogo(logoPath: string): string | null {
  try {
    let file: string | null = existsSync(logoPath) ? logoPath : null
    if (!file) {
      const dir = dirname(logoPath)
      const stem = basename(logoPath, extname(logoPath)).toLowerCase()
      const ext = extname(logoPath).toLowerCase()
      const candidates = readdirSync(dir).filter((f) => {
        const l = f.toLowerCase()
        return l.startsWith(stem + '.') && l.endsWith(ext) && !l.includes('contrast')
      })
      const score = (f: string): number => {
        const m = /scale-(\d+)/i.exec(f)
        const s = m ? Number(m[1]) : 100
        return Math.abs(s - 200)
      }
      candidates.sort((a, b) => score(a) - score(b))
      file = candidates.length ? join(dir, candidates[0]) : null
    }
    if (!file) return null
    const img = nativeImage.createFromPath(file)
    if (img.isEmpty()) return null
    return img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL()
  } catch {
    return null
  }
}
