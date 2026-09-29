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
  /**
   * Record apps that play sound while another app is in front (music, podcasts, a video in a background tab) as
   * listening time for that app. Shown as idle for the app; never added to the day's screen time.
   */
  backgroundAudio: boolean
  onboardingDone: boolean
  /** Follow Windows, or force a mode. */
  theme: 'system' | 'light' | 'dark'
  appearance: Appearance
  /**
   * Months of second-by-second session detail to keep. Older days are folded into per-app daily totals
   * (reports and averages keep working; timelines for those days are gone). 0 keeps everything forever.
   */
  retentionMonths: number
  /** Ask GitHub Releases for a newer version at startup and every few hours. The only network call the app makes. */
  autoUpdateCheck: boolean
  /**
   * Hour (0-6) at which a new day begins. Use before this hour counts toward the previous day, so a night owl's
   * 1 AM session lands on the evening it belongs to. Changing it re-files recorded sessions.
   */
  dayStartHour: number
  /** Companion on the Overview: a bot character, the user's own picture, or none. */
  avatar: AvatarChoice
  /** Data URL of the user's picture (downscaled), used when avatar is "photo". */
  avatarPhoto: string | null
  /** When the companion dozes off: by the clock (23:00 to 06:00), while nothing is tracked, or never. */
  avatarSleeps: AvatarSleeps
  /** Evening reminder when a streak is not yet met or about to break. */
  streakRemindersEnabled: boolean
  /** "HH:MM" local time */
  streakReminderTime: string
}

export const AVATAR_BOTS = ['ghost', 'cat', 'blob', 'clover', 'droid', 'alien', 'cloud'] as const
export type AvatarBot = (typeof AVATAR_BOTS)[number]
/** Display names for the bundled companions, shown when hovering an avatar in Settings. */
export const AVATAR_NAMES: Record<AvatarBot, string> = {
  ghost: 'Boo',
  cat: 'Kat',
  blob: 'Jell',
  clover: 'Clove',
  droid: 'Beep',
  alien: 'Emjay',
  cloud: 'Drift'
}
export type AvatarChoice = AvatarBot | 'photo' | 'none'
export type AvatarSleeps = 'time' | 'idle' | 'never'

export interface Appearance {
  darkBase: 'forest' | 'navy' | 'graphite' | 'neutral'
  lightBase: 'cool' | 'paper' | 'mist' | 'sage'
  /** Preset id (coral, cyan, ...) or a custom hex like #ff7a6b. */
  accent: string
  radius: 'sharp' | 'rounded' | 'soft'
  motion: 'full' | 'reduced' | 'off'
  /** Bundled variable fonts (offline) or the Windows system font. */
  font: 'system' | 'comic' | 'saira' | 'roboto' | 'caveat'
}

export const DEFAULT_APPEARANCE: Appearance = {
  darkBase: 'forest',
  lightBase: 'cool',
  accent: 'coral',
  radius: 'rounded',
  motion: 'full',
  font: 'system'
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
  dailyDigestEnabled: true,
  dailyDigestTime: '21:00',
  weeklyDigestEnabled: true,
  passiveMinutes: 5,
  capAtDisplayOff: true,
  callsCountActive: true,
  backgroundAudio: true,
  onboardingDone: false,
  theme: 'system',
  appearance: DEFAULT_APPEARANCE,
  retentionMonths: 12,
  autoUpdateCheck: true,
  dayStartHour: 0,
  avatar: 'ghost',
  avatarPhoto: null,
  avatarSleeps: 'time',
  streakRemindersEnabled: true,
  streakReminderTime: '20:00'
}

export const DAY_START_OPTIONS: { value: number; label: string }[] = [0, 1, 2, 3, 4, 5, 6].map((h) => ({
  value: h,
  label: h === 0 ? '12 AM' : `${h} AM`
}))

export const FONT_OPTIONS: { value: Appearance['font']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'comic', label: 'Comic Neue' },
  { value: 'saira', label: 'Saira' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'caveat', label: 'Caveat' }
]

export const RETENTION_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '1 year' },
  { value: 24, label: '2 years' },
  { value: 0, label: 'Forever' }
]

export interface DataInfo {
  /** Raw session rows still stored. */
  sessions: number
  apps: number
  /** Oldest day with any data, raw or rolled up. */
  firstDay: string | null
  /** Days that only exist as daily totals. */
  compactedDays: number
  /** Oldest day that still has full session detail. */
  detailSince: string | null
  /** Database file size in bytes (main file plus WAL). */
  bytes: number
  path: string
}

export interface CompactResult {
  days: number
  sessions: number
}

export type UpdateState = 'disabled' | 'idle' | 'checking' | 'not-available' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** Version offered by the feed when state is available, downloading or downloaded. */
  version: string | null
  /** Download progress 0..100 while downloading. */
  percent: number
  /** Last check time, epoch ms. */
  checkedAt: number | null
  error: string | null
  /** Why checks are off: not packaged, or turned off in Settings. */
  reason: string | null
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


export interface AppUsage extends AppInfo {
  /** Hands-on plus passive time. */
  activeMs: number
  /** Part of activeMs with no input (reading, watching). */
  passiveMs: number
  /** Idle in front, plus listening time (see below). */
  idleMs: number
  /** Part of idleMs during which the app played sound while another app was in front. */
  listeningMs: number
  sessions: number
  longestMs: number
}

export interface DaySummary {
  day: string
  screenMs: number
  activeMs: number
  passiveMs: number
  idleMs: number
  /** Background audio across all apps; overlaps the figures above and is not part of screenMs. */
  listeningMs: number
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
  /** The app was playing sound while another app was in front. Always reported with isIdle set. */
  listening: boolean
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

// ---- streaks ----------------------------------------------------------

export type StreakKind = 'screenUnder' | 'activeAtLeast' | 'categoryAtLeast' | 'categoryUnder' | 'appUnder' | 'focusAtLeast'

export const STREAK_KINDS: { value: StreakKind; label: string; needs: 'none' | 'category' | 'app'; hint: string }[] = [
  { value: 'screenUnder', label: 'Keep screen time under a limit', needs: 'none', hint: 'Total screen time for the day stays at or below the target.' },
  { value: 'activeAtLeast', label: 'Be active for at least', needs: 'none', hint: 'Hands-on plus passive time reaches the target.' },
  { value: 'categoryAtLeast', label: 'Spend at least … in a category', needs: 'category', hint: 'Pick the category to spend time in.' },
  { value: 'categoryUnder', label: 'Keep a category under a limit', needs: 'category', hint: 'Pick the category to keep in check.' },
  { value: 'appUnder', label: 'Keep an application under a limit', needs: 'app', hint: 'Pick the application to keep in check.' },
  { value: 'focusAtLeast', label: 'Focus for at least … a day', needs: 'none', hint: 'Time spent in focus sessions reaches the target.' }
]

export interface Streak {
  id: number
  kind: StreakKind
  /** Minutes per day. */
  target: number
  /** Category or application id for kinds that need one. */
  refId: number | null
  refName: string | null
  createdDay: string
}

export interface StreakDay {
  day: string
  /** Minutes measured that day. */
  value: number
  /** true hit, false missed, null still open (today). */
  ok: boolean | null
  /** A miss covered by a freeze day. */
  frozen?: boolean
}

export const FREEZES_PER_MONTH = 3

export interface StreakStatus extends Streak {
  current: number
  best: number
  todayState: 'done' | 'pending' | 'failed'
  /** Oldest to newest, up to about a year. */
  days: StreakDay[]
  /** Freeze days still available this calendar month. */
  freezesLeft: number
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
  /** Display names of apps currently playing sound in the background. */
  listening: string[]
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
  } | null
  currentApp: string | null
  displayRequired: boolean
  devicesInUse: string[]
  /** Apps with an audible output stream right now, with their peak level. */
  audio: { name: string; peak: number }[]
  liveSession: { kind: 'active' | 'passive' | 'idle'; start: number } | null
  dbPath: string
  versions: { app: string; electron: string; node: string }
}

export type Page = 'overview' | 'timeline' | 'apps' | 'focus' | 'limits' | 'streaks' | 'reports' | 'settings'

export const EVENT_CHANNELS = ['tracker:status', 'focus:update', 'navigate', 'apps:changed', 'data:changed', 'theme:changed', 'update:status'] as const
export type EventChannel = (typeof EVENT_CHANNELS)[number]
