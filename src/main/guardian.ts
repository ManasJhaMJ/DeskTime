// Focus mode, app limits and break reminders. Reacts to tracker ticks; does no polling of its own.
import { addDays, DB, toDay } from './db'
import { Tracker, type TickInfo } from './tracker'
import { minimizeWindow } from './win32'
import type { AppLimit, FocusSession, LimitMode, Settings } from '../shared/types'

type Notify = (title: string, body: string, page?: 'reports' | 'overview') => void

const REMIND_EVERY_MS = 15 * 60_000
const BLOCK_NOTIFY_EVERY_MS = 60_000
const FOCUS_NOTIFY_EVERY_MS = 30_000
const LIMITS_CACHE_MS = 60_000

export class Guardian {
  private focus: FocusSession | null = null
  private lastFocusNotify = 0
  private limits: AppLimit[] = []
  private limitsAt = 0
  private limitsDay = ''
  private readonly notified = new Map<string, number>()
  private breakStreakStart = 0
  private breakNotified = 0
  private breakTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly db: DB,
    private readonly tracker: Tracker,
    private readonly getSettings: () => Settings,
    private readonly notify: Notify,
    private readonly onFocusChange: (f: FocusSession | null) => void
  ) {
    // Close any focus session left open by a crash or forced shutdown.
    const orphan = db.activeFocus()
    if (orphan) {
      const end = Math.min(Date.now(), orphan.startTs + orphan.plannedSec * 1000)
      db.endFocus(orphan.id, end, false)
    }
    tracker.on('tick', (t: TickInfo) => this.onTick(t))
  }

  // ---- focus ------------------------------------------------------------

  getFocus(): FocusSession | null {
    return this.focus
  }

  startFocus(label: string, plannedMin: number, allowed: number[], restricted: number[]): FocusSession {
    if (this.focus) this.endFocus()
    this.focus = this.db.startFocus(label.trim() || 'Focus', Math.max(1, Math.round(plannedMin)) * 60, allowed, restricted)
    this.onFocusChange(this.focus)
    return this.focus
  }

  endFocus(): FocusSession | null {
    if (!this.focus) return null
    const f = this.focus
    const now = Date.now()
    const completed = now - f.startTs >= f.plannedSec * 1000 * 0.95
    this.db.endFocus(f.id, now, completed)
    this.focus = null
    this.onFocusChange(null)
    return { ...f, endTs: now, completed }
  }

  private tickFocus(t: TickInfo): void {
    const f = this.focus
    if (!f) return
    if (t.now - f.startTs >= f.plannedSec * 1000) {
      this.db.endFocus(f.id, t.now, true)
      this.focus = null
      this.onFocusChange(null)
      this.notify('Focus session complete', `${f.label}: ${fmt(f.plannedSec * 1000)} of focused work. Nice.`)
      return
    }
    if (t.isIdle || !f.restrictedApps.includes(t.app.id)) return
    if (t.now - this.lastFocusNotify < FOCUS_NOTIFY_EVERY_MS) return
    this.lastFocusNotify = t.now
    f.interruptions++
    this.db.incrementInterruptions(f.id)
    if (t.fg) minimizeWindow(t.fg.hwnd)
    this.notify('Stay focused', `${t.app.displayName} is restricted during "${f.label}".`)
    this.onFocusChange(f)
  }

  // ---- limits -----------------------------------------------------------

  invalidateLimits(): void {
    this.limitsAt = 0
  }

  private currentLimits(now: number): AppLimit[] {
    const day = toDay(now)
    if (now - this.limitsAt > LIMITS_CACHE_MS || this.limitsDay !== day) {
      this.limits = this.db.listLimits(day)
      this.limitsAt = now
      this.limitsDay = day
    }
    return this.limits
  }

  private once(key: string, now: number, every: number): boolean {
    const last = this.notified.get(key) ?? 0
    if (now - last < every) return false
    this.notified.set(key, now)
    return true
  }

  private tickLimits(t: TickInfo): void {
    if (t.isIdle) return
    const limits = this.currentLimits(t.now)
    if (!limits.length) return
    const lim = limits.find((l) => l.appId === t.app.id)
    if (!lim) return
    this.tracker.flush()
    const used = this.db.appActiveMs(lim.appId, toDay(t.now))
    lim.usedMs = used
    const limitMs = lim.dailyMinutes * 60_000
    const remaining = limitMs - used
    const day = toDay(t.now)
    const name = lim.appName

    if (remaining > 0) {
      if (remaining <= 5 * 60_000 && this.once(`${day}:${lim.appId}:soon`, t.now, Infinity)) {
        this.notify('5 minutes left', `You are close to your ${name} limit for today.`)
      }
      return
    }
    const mode: LimitMode = lim.mode
    if (mode === 'warn') {
      if (this.once(`${day}:${lim.appId}:warn`, t.now, Infinity))
        this.notify('Limit reached', `You've reached your ${name} limit for today.`)
    } else if (mode === 'remind') {
      if (this.once(`${day}:${lim.appId}:remind`, t.now, REMIND_EVERY_MS))
        this.notify('Limit reached', `You've reached your ${name} limit for today (${fmt(used)}).`)
    } else {
      if (t.fg) minimizeWindow(t.fg.hwnd)
      if (this.once(`${day}:${lim.appId}:block`, t.now, BLOCK_NOTIFY_EVERY_MS))
        this.notify('Limit reached', `${name} is blocked for the rest of today.`)
    }
  }

  // ---- breaks -----------------------------------------------------------

  private tickBreaks(t: TickInfo): void {
    const s = this.getSettings()
    if (!s.breakRemindersEnabled || t.isIdle || t.activeStreakMs <= 0) return
    const streakStart = t.now - t.activeStreakMs
    if (Math.abs(streakStart - this.breakStreakStart) > 3000) {
      this.breakStreakStart = streakStart
      this.breakNotified = 0
    }
    const interval = s.breakIntervalMin * 60_000
    const due = Math.floor(t.activeStreakMs / interval)
    if (due > this.breakNotified) {
      this.breakNotified = due
      this.notify('Time for a break', `You've been active for ${fmt(t.activeStreakMs)}. Consider taking a break.`)
    }
  }

  /** Pauses tracking for the configured break length, then resumes and notifies. */
  takeBreak(): void {
    const min = this.getSettings().breakDurationMin
    this.tracker.pause(min)
    this.notify('Break started', `Tracking is paused for ${min} minutes. Step away from the screen.`)
    if (this.breakTimer) clearTimeout(this.breakTimer)
    this.breakTimer = setTimeout(() => {
      this.breakTimer = null
      if (!this.tracker.isPaused()) this.notify('Break over', 'Welcome back. Tracking has resumed.')
    }, min * 60_000 + 1500)
  }

  // ---- digests ----------------------------------------------------------

  private lastDigestCheck = 0

  private tickDigests(now: number): void {
    if (now - this.lastDigestCheck < 30_000) return
    this.lastDigestCheck = now
    const s = this.getSettings()
    const day = toDay(now)
    const d = new Date(now)
    const minutes = d.getHours() * 60 + d.getMinutes()

    if (s.dailyDigestEnabled) {
      const [hh, mm] = s.dailyDigestTime.split(':').map(Number)
      const due = (hh || 0) * 60 + (mm || 0)
      if (minutes >= due && this.db.getMeta('digest:daily') !== day) {
        this.db.setMeta('digest:daily', day)
        const sum = this.db.daySummary(day)
        if (sum.screenMs > 60_000) {
          const top = this.db.dayApps(day)[0]
          const parts = [`${fmt(sum.screenMs)} screen time`, `${fmt(sum.activeMs)} active`]
          if (top) parts.push(`most used ${top.displayName} ${fmt(top.activeMs + top.idleMs)}`)
          if (sum.focusMs > 60_000) parts.push(`${fmt(sum.focusMs)} in focus`)
          this.notify('Today so far', parts.join(' · '), 'overview')
        }
      }
    }

    if (s.weeklyDigestEnabled && d.getDay() === 1 && minutes >= 9 * 60) {
      const weekKey = day // Monday's date identifies the week
      if (this.db.getMeta('digest:weekly') !== weekKey) {
        this.db.setMeta('digest:weekly', weekKey)
        const lastWeek = this.db.weekly(addDays(day, -7))
        const before = this.db.weekly(addDays(day, -14))
        if (lastWeek.totalMs > 60_000) {
          const diff = lastWeek.totalMs - before.totalMs
          const cmp = before.totalMs > 60_000 ? ` · ${diff >= 0 ? 'up' : 'down'} ${fmt(Math.abs(diff))} vs the week before` : ''
          this.notify('Last week', `${fmt(lastWeek.totalMs)} screen time · ${fmt(Math.round(lastWeek.totalMs / 7))} a day${cmp}`, 'reports')
        }
      }
    }
  }

  private onTick(t: TickInfo): void {
    try {
      this.tickFocus(t)
      this.tickLimits(t)
      this.tickBreaks(t)
      this.tickDigests(t.now)
    } catch (err) {
      console.error('[guardian] tick failed', err)
    }
  }
}

function fmt(ms: number): string {
  const m = Math.round(ms / 60_000)
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}
