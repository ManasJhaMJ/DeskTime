import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS } from '../shared/types'
import type {
  AppDetail,
  EventChannel,
  AppInfo,
  AppLimit,
  AppUsage,
  Category,
  CategoryUsage,
  CompactResult,
  DailyPoint,
  DataInfo,
  DaySummary,
  Diagnostics,
  FocusSession,
  FocusStats,
  Insights,
  LimitMode,
  LoginStatus,
  MonthlyReport,
  Page,
  Settings,
  StreakKind,
  StreakStatus,
  TimelineSegment,
  TrackerStatus,
  Transition,
  UpdateStatus,
  WeeklyReport
} from '../shared/types'

const EVENTS = EVENT_CHANNELS


const api = {
  trackerStatus: (): Promise<TrackerStatus> => ipcRenderer.invoke('tracker:status'),
  pauseTracking: (minutes?: number): Promise<void> => ipcRenderer.invoke('tracker:pause', minutes),
  resumeTracking: (): Promise<void> => ipcRenderer.invoke('tracker:resume'),
  diagnostics: (): Promise<Diagnostics> => ipcRenderer.invoke('tracker:diagnostics'),

  daySummary: (day: string): Promise<DaySummary> => ipcRenderer.invoke('summary:day', day),
  dayApps: (day: string): Promise<AppUsage[]> => ipcRenderer.invoke('summary:apps', day),
  timeline: (day: string): Promise<TimelineSegment[]> => ipcRenderer.invoke('timeline:day', day),
  transitions: (day: string, limit?: number): Promise<Transition[]> =>
    ipcRenderer.invoke('transitions:day', day, limit),
  listApps: (): Promise<AppInfo[]> => ipcRenderer.invoke('apps:list'),
  appDetail: (appId: number, day: string): Promise<AppDetail | null> => ipcRenderer.invoke('apps:detail', appId, day),
  renameApp: (id: number, name: string): Promise<void> => ipcRenderer.invoke('apps:rename', id, name),
  hideApp: (id: number, hidden: boolean): Promise<void> => ipcRenderer.invoke('apps:hide', id, hidden),
  monthly: (month: string): Promise<MonthlyReport> => ipcRenderer.invoke('report:monthly', month),
  listCategories: (): Promise<Category[]> => ipcRenderer.invoke('categories:list'),
  addCategory: (name: string, color: string): Promise<Category> => ipcRenderer.invoke('categories:add', name, color),
  updateCategory: (id: number, name: string, color: string): Promise<void> => ipcRenderer.invoke('categories:update', id, name, color),
  deleteCategory: (id: number): Promise<void> => ipcRenderer.invoke('categories:delete', id),
  setAppCategory: (appId: number, categoryId: number | null): Promise<void> => ipcRenderer.invoke('apps:category', appId, categoryId),
  dayCategories: (day: string): Promise<CategoryUsage[]> => ipcRenderer.invoke('summary:categories', day),
  rangeCategories: (fromDay: string, toDay: string): Promise<CategoryUsage[]> =>
    ipcRenderer.invoke('summary:categoriesRange', fromDay, toDay),
  openDashboard: (page?: Page): Promise<void> => ipcRenderer.invoke('window:open', page),
  closePopup: (): Promise<void> => ipcRenderer.invoke('popup:close'),
  loginStatus: (): Promise<LoginStatus> => ipcRenderer.invoke('settings:loginStatus'),
  weekly: (startDay: string): Promise<WeeklyReport> => ipcRenderer.invoke('report:weekly', startDay),
  insights: (fromDay: string, toDay: string): Promise<Insights> => ipcRenderer.invoke('insights:range', fromDay, toDay),

  focusState: (): Promise<FocusSession | null> => ipcRenderer.invoke('focus:state'),
  focusStart: (label: string, plannedMin: number, allowed: number[], restricted: number[]): Promise<FocusSession> =>
    ipcRenderer.invoke('focus:start', label, plannedMin, allowed, restricted),
  focusEnd: (): Promise<FocusSession | null> => ipcRenderer.invoke('focus:end'),
  focusHistory: (limit?: number): Promise<FocusSession[]> => ipcRenderer.invoke('focus:history', limit),
  focusStats: (day: string): Promise<FocusStats> => ipcRenderer.invoke('focus:stats', day),

  listLimits: (day: string): Promise<AppLimit[]> => ipcRenderer.invoke('limits:list', day),
  setLimit: (appId: number, minutes: number, mode: LimitMode): Promise<void> =>
    ipcRenderer.invoke('limits:set', appId, minutes, mode),
  removeLimit: (id: number): Promise<void> => ipcRenderer.invoke('limits:remove', id),

  listStreaks: (): Promise<StreakStatus[]> => ipcRenderer.invoke('streaks:list'),
  addStreak: (kind: StreakKind, target: number, refId: number | null): Promise<void> => ipcRenderer.invoke('streaks:add', kind, target, refId),
  removeStreak: (id: number): Promise<void> => ipcRenderer.invoke('streaks:remove', id),
  freezeStreakDay: (id: number, day: string): Promise<boolean> => ipcRenderer.invoke('streaks:freeze', id, day),
  unfreezeStreakDay: (id: number, day: string): Promise<void> => ipcRenderer.invoke('streaks:unfreeze', id, day),
  yearActivity: (fromDay: string, toDay: string): Promise<DailyPoint[]> => ipcRenderer.invoke('activity:year', fromDay, toDay),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke('settings:set', s),

  dataInfo: (): Promise<DataInfo> => ipcRenderer.invoke('data:info'),
  /** Folds days older than the retention window into daily totals right now. */
  compactData: (): Promise<CompactResult> => ipcRenderer.invoke('data:compact'),

  updateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('data:openFolder'),
  exportData: (): Promise<boolean> => ipcRenderer.invoke('data:export'),
  clearData: (): Promise<boolean> => ipcRenderer.invoke('data:clear'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openLogs: (): Promise<void> => ipcRenderer.invoke('log:open'),
  reportError: (message: string): Promise<void> => ipcRenderer.invoke('log:renderer', message),
  /** Hex color of the page pixel at CSS coordinates, or null. */
  sampleColor: (x: number, y: number): Promise<string | null> => ipcRenderer.invoke('color:sample', x, y),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  /** Closes the dashboard window; the tracker keeps running in the tray. */
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  /** Quits and starts the app again, so settings that need a restart take effect. */
  relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),

  on: (channel: EventChannel, cb: (payload: unknown) => void): (() => void) => {
    if (!EVENTS.includes(channel)) return () => {}
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

export type Api = typeof api
export type { Page }

contextBridge.exposeInMainWorld('api', api)
