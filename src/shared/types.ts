// Types shared between the main process, preload and renderer.

export interface Settings {
  idleThresholdSec: number
  launchAtStartup: boolean
  startMinimized: boolean
  notificationsEnabled: boolean
  breakRemindersEnabled: boolean
  breakIntervalMin: number
  breakDurationMin: number
  hardwareAcceleration: boolean
  showTrayScreenTime: boolean
  firstRunDone: boolean
  /** Windows 11 system-drawn glass behind the window. Needs a restart. */
  windowMaterial: 'none' | 'mica' | 'acrylic'
  /** Keep counting as active while a fullscreen app or a video keeps the display awake, even with no input. */
  mediaCountsActive: boolean
  /** Opt-in: record window titles (browser tabs, documents, projects) alongside the app. */
  trackWindowTitles: boolean
  dailyDigestEnabled: boolean
  /** "HH:MM" local time */
  dailyDigestTime: string
  weeklyDigestEnabled: boolean
  /** Minutes of no input that still count as passive use (reading) before turning into idle. 0 disables. */
  passiveMinutes: number
  /** Stop counting screen time once idle exceeds the display-sleep timeout of the power plan. */
  capAtDisplayOff: boolean
  /** Keep time active while the foreground app (or any app) holds the microphone or camera. */
  callsCountActive: boolean
  onboardingDone: boolean
  /** Follow Windows, or force a mode. */
  theme: 'system' | 'light' | 'dark'
  appearance: Appearance
}

export interface Appearance {
  darkBase: 'forest' | 'navy' | 'graphite' | 'neutral'
  lightBase: 'cool' | 'paper' | 'mist' | 'sage'
  /** Preset id (coral, cyan, ...) or a custom hex like #ff7a6b. */
  accent: string
  radius: 'sharp' | 'rounded' | 'soft'
  motion: 'full' | 'reduced' | 'off'
  font: 'manrope' | 'system'
}

export const DEFAULT_APPEARANCE: Appearance = {
  darkBase: 'forest',
  lightBase: 'cool',
  accent: 'coral',
  radius: 'rounded',
  motion: 'full',
  font: 'manrope'
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdSec: 60,
  launchAtStartup: false,
  startMinimized: true,
  notificationsEnabled: true,
  breakRemindersEnabled: false,
  breakIntervalMin: 90,
  breakDurationMin: 5,
  hardwareAcceleration: false,
  showTrayScreenTime: true,
  firstRunDone: false,
  windowMaterial: 'none',
  mediaCountsActive: true,
  trackWindowTitles: false,
  dailyDigestEnabled: true,
  dailyDigestTime: '21:00',
  weeklyDigestEnabled: true,
  passiveMinutes: 5,
  capAtDisplayOff: true,
  callsCountActive: true,
  onboardingDone: false,
  theme: 'system',
  appearance: DEFAULT_APPEARANCE
}

export interface AppInfo {
  id: number
  exePath: string
  exeName: string
  displayName: string
  icon: string | null
  /** Excluded from every statistic while true; still recorded so it can be shown again. */
  hidden: boolean
  /** When set, this app's time is reported under the target app. */
  mergedInto: number | null
  /** User renamed the app; automatic name enrichment must not overwrite it. */
  nameLocked: boolean
  /** Store / MSIX package family name; stable across updates. Null for classic apps. */
  packageFamily: string | null
  categoryId: number | null
}

export interface Category {
  id: number
  name: string
  color: string
  sort: number
}

export interface CategoryUsage extends Category {
  activeMs: number
  apps: number
}

/** A window-title stretch inside an app (only recorded when trackWindowTitles is on). */
export interface ContextUsage {
  title: string
  ms: number
  count: number
}

export interface AppUsage extends AppInfo {
  /** Hands-on plus passive time. */
  activeMs: number
  /** Part of activeMs with no input (reading, watching). */
  passiveMs: number
  idleMs: number
  sessions: number
  longestMs: number
}

export interface DaySummary {
  day: string
  screenMs: number
  activeMs: number
  passiveMs: number
  idleMs: number
  sessions: number
  longestSessionMs: number
  longestSessionStart: number | null
  longestSessionEnd: number | null
  switches: number
  focusMs: number
  focusSessions: number
  firstActivity: number | null
  lastActivity: number | null
}

export interface TimelineSegment {
  id: number
  appId: number
  appName: string
  icon: string | null
  start: number
  end: number
  isIdle: boolean
  passive: boolean
}

export interface Transition {
  fromApp: string
  toApp: string
  count: number
}

export interface DailyPoint {
  day: string
  activeMs: number
  idleMs: number
  screenMs: number
}

export interface AppDetail {
  app: AppInfo
  todayMs: number
  yesterdayMs: number
  weeklyAvgMs: number
  sessions: number
  longestMs: number
  daily: DailyPoint[]
}

export interface FocusSession {
  id: number
  label: string
  startTs: number
  endTs: number | null
  plannedSec: number
  completed: boolean
  interruptions: number
  allowedApps: number[]
  restrictedApps: number[]
}

export interface FocusStats {
  todayMs: number
  todaySessions: number
  completed: number
  interrupted: number
  longestMs: number
}

export type LimitMode = 'warn' | 'remind' | 'block'

export interface AppLimit {
  id: number
  appId: number
  appName: string
  icon: string | null
  dailyMinutes: number
  mode: LimitMode
  usedMs: number
}

export interface WeeklyReport {
  startDay: string
  days: DailyPoint[]
  totalMs: number
  activeMs: number
  idleMs: number
}

export interface MonthlyReport {
  month: string // YYYY-MM
  days: DailyPoint[]
  totalMs: number
  activeMs: number
  idleMs: number
  activeDays: number
  busiestDay: DailyPoint | null
  topApps: { id: number; name: string; icon: string | null; activeMs: number }[]
}

export interface LoginStatus {
  openAtLogin: boolean
  supported: boolean
}

export interface Insights {
  longestFocusPeriod: { start: number; end: number } | null
  highestUsageBlock: { startHour: number; endHour: number; activeMs: number } | null
  mostUsedApp: { name: string; icon: string | null; ms: number } | null
  mostFrequentSwitch: Transition | null
  lateNightMs: number
  hourly: number[] // 24 buckets of active ms across the range
}

export interface TrackerStatus {
  tracking: boolean
  /** Idle by input, but a fullscreen app or video keeps it counted as active. */
  media: boolean
  /** An app holds the microphone or camera; counted as active. */
  call: boolean
  /** No input within the passive band; counted as passive use. */
  passive: boolean
  /** Idle longer than the display-sleep timeout; nothing is being counted. */
  screenOff: boolean
  paused: boolean
  pausedUntil: number | null
  idle: boolean
  locked: boolean
  currentApp: AppInfo | null
  sinceTs: number
  todayScreenMs: number
  todayActiveMs: number
  activeStreakMs: number
}

/** Live view of what the tracker sees; for the diagnostics panel. */
export interface Diagnostics {
  now: number
  state: 'active' | 'passive' | 'idle' | 'media' | 'call' | 'screen-off' | 'paused' | 'locked' | 'self' | 'unreal' | 'none'
  idleSec: number
  idleThresholdSec: number
  passiveMinutes: number
  displayTimeoutSec: number
  onBattery: boolean
  foreground: {
    exePath: string
    exeName: string
    pid: number
    packageFamily: string | null
    isRealWindow: boolean
    fullscreen: boolean
    title: string | null
  } | null
  currentApp: string | null
  displayRequired: boolean
  devicesInUse: string[]
  liveSession: { kind: 'active' | 'passive' | 'idle'; start: number } | null
  dbPath: string
  versions: { app: string; electron: string; node: string }
}

export type Page = 'overview' | 'timeline' | 'apps' | 'focus' | 'limits' | 'reports' | 'settings'

export const EVENT_CHANNELS = ['tracker:status', 'focus:update', 'navigate', 'apps:changed', 'data:changed', 'theme:changed'] as const
export type EventChannel = (typeof EVENT_CHANNELS)[number]
