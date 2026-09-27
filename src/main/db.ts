// SQLite storage. All queries are synchronous (better-sqlite3) and run in the main process.
import Database from 'better-sqlite3'
import type {
  AppDetail,
  AppInfo,
  AppLimit,
  AppUsage,
  Category,
  CategoryUsage,
  ContextUsage,
  DailyPoint,
  DaySummary,
  FocusSession,
  FocusStats,
  Insights,
  LimitMode,
  MonthlyReport,
  Settings,
  TimelineSegment,
  Transition,
  WeeklyReport
} from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import { DEFAULT_CATEGORIES, familyFromWindowsAppsPath, friendlyName, SYSTEM_PROCESSES } from './win32'

const pad = (n: number): string => String(n).padStart(2, '0')
export const toDay = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const dayStart = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n).getTime())
}
export const today = (): string => toDay(Date.now())

/** Gap tolerance when merging consecutive sessions into one stretch. */
const GAP_MS = 2500
/** Sessions shorter than this are alt-tab flicker and do not count as switches. */
const MIN_SWITCH_MS = 3000
const HOUR = 3_600_000

interface SessionRow {
  id: number
  app_id: number
  start_ts: number
  end_ts: number
  is_idle: number
  day: string
  display_name: string
  icon: string | null
}

interface AppRow {
  id: number
  exe_path: string
  exe_name: string
  display_name: string
  icon: string | null
  hidden: number
  merged_into: number | null
  name_locked: number
  package_family: string | null
  category_id: number | null
}

interface FocusRow {
  id: number
  label: string
  start_ts: number
  end_ts: number | null
  planned_sec: number
  completed: number
  interruptions: number
  allowed_apps: string
  restricted_apps: string
  day: string
}

interface Stretch {
  start: number
  end: number
}

const toApp = (r: AppRow): AppInfo => ({
  id: r.id,
  exePath: r.exe_path,
  exeName: r.exe_name,
  displayName: r.display_name,
  icon: r.icon,
  hidden: !!r.hidden,
  mergedInto: r.merged_into,
  nameLocked: !!r.name_locked,
  packageFamily: r.package_family,
  categoryId: r.category_id
})

const toFocus = (r: FocusRow): FocusSession => ({
  id: r.id,
  label: r.label,
  startTs: r.start_ts,
  endTs: r.end_ts,
  plannedSec: r.planned_sec,
  completed: !!r.completed,
  interruptions: r.interruptions,
  allowedApps: JSON.parse(r.allowed_apps || '[]'),
  restrictedApps: JSON.parse(r.restricted_apps || '[]')
})

/** Merges consecutive active rows into continuous usage stretches, broken by idle rows or gaps. */
function activeStretches(rows: SessionRow[]): Stretch[] {
  const out: Stretch[] = []
  let cur: Stretch | null = null
  for (const r of rows) {
    if (r.is_idle === 1) {
      if (cur) out.push(cur)
      cur = null
      continue
    }
    if (cur && r.start_ts - cur.end <= GAP_MS) cur.end = Math.max(cur.end, r.end_ts)
    else {
      if (cur) out.push(cur)
      cur = { start: r.start_ts, end: r.end_ts }
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Counts app-to-app transitions, ignoring flicker and anything separated by idle. */
function transitions(rows: SessionRow[]): Map<string, Transition> {
  const map = new Map<string, Transition>()
  let prev: SessionRow | null = null
  for (const r of rows) {
    if (r.is_idle === 1) {
      prev = null
      continue
    }
    if (r.end_ts - r.start_ts < MIN_SWITCH_MS) continue
    if (prev && prev.app_id !== r.app_id) {
      const key = `${prev.app_id}>${r.app_id}`
      const t = map.get(key) ?? { fromApp: prev.display_name, toApp: r.display_name, count: 0 }
      t.count++
      map.set(key, t)
    }
    prev = r
  }
  return map
}

function splitByHour(start: number, end: number, fn: (hour: number, ms: number) => void): void {
  let t = start
  while (t < end) {
    const d = new Date(t)
    const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
    const seg = Math.min(end, hourEnd)
    fn(d.getHours(), seg - t)
    t = seg
  }
}

export class DB {
  readonly db: Database.Database

  constructor(file: string) {
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('temp_store = MEMORY')
    this.migrate()
    this.prepare()
  }

  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS apps (
          id INTEGER PRIMARY KEY,
          exe_path TEXT UNIQUE NOT NULL,
          exe_name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          icon TEXT,
          first_seen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY,
          app_id INTEGER NOT NULL REFERENCES apps(id),
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          is_idle INTEGER NOT NULL DEFAULT 0,
          day TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day, start_ts);
        CREATE INDEX IF NOT EXISTS idx_sessions_app_day ON sessions(app_id, day);
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id INTEGER PRIMARY KEY,
          label TEXT NOT NULL,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER,
          planned_sec INTEGER NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          interruptions INTEGER NOT NULL DEFAULT 0,
          allowed_apps TEXT NOT NULL DEFAULT '[]',
          restricted_apps TEXT NOT NULL DEFAULT '[]',
          day TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS limits (
          id INTEGER PRIMARY KEY,
          app_id INTEGER UNIQUE NOT NULL REFERENCES apps(id),
          daily_minutes INTEGER NOT NULL,
          mode TEXT NOT NULL DEFAULT 'warn'
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `)
      this.db.pragma('user_version = 1')
    }
    if (version < 2) {
      this.db.exec(`
        ALTER TABLE apps ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE apps ADD COLUMN merged_into INTEGER;
        ALTER TABLE apps ADD COLUMN name_locked INTEGER NOT NULL DEFAULT 0;
      `)
      this.db.pragma('user_version = 2')
    }
    if (version < 3) {
      this.db.exec('ALTER TABLE apps ADD COLUMN package_family TEXT')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_apps_family ON apps(package_family)')
      this.migratePackagedApps()
      const hide = this.db.prepare('UPDATE apps SET hidden = 1 WHERE lower(exe_name) = ?')
      for (const exe of SYSTEM_PROCESSES) hide.run(exe)
      this.db.pragma('user_version = 3')
    }
    if (version < 4) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL,
          sort INTEGER NOT NULL DEFAULT 0
        );
        ALTER TABLE apps ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
        CREATE TABLE IF NOT EXISTS contexts (
          id INTEGER PRIMARY KEY,
          app_id INTEGER NOT NULL REFERENCES apps(id),
          title TEXT NOT NULL,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NOT NULL,
          day TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contexts_app_day ON contexts(app_id, day);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `)
      const ins = this.db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)')
      const assign = this.db.prepare('UPDATE apps SET category_id = ? WHERE lower(exe_name) = ? AND category_id IS NULL')
      DEFAULT_CATEGORIES.forEach((c, i) => {
        const id = Number(ins.run(c.name, c.color, i).lastInsertRowid)
        for (const exe of c.exes) assign.run(id, exe)
      })
      this.db.pragma('user_version = 4')
    }
    if (version < 5) {
      // Theme change: move built-in categories that still wear the old colors onto the new palette.
      const old: Record<string, string> = { Work: '#7C5CFF', Communication: '#3987e5', Browsing: '#199e70', Entertainment: '#d55181', Games: '#d95926' }
      const upd = this.db.prepare('UPDATE categories SET color = ? WHERE name = ? AND lower(color) = lower(?)')
      for (const c of DEFAULT_CATEGORIES) if (old[c.name]) upd.run(c.color, c.name, old[c.name])
      this.db.pragma('user_version = 5')
    }
  }

  /**
   * Store apps were keyed by exe path, so every update created a duplicate. Derive the package family
   * from the install path, keep the oldest row per family and move the other rows' sessions onto it.
   */
  private migratePackagedApps(): void {
    const rows = this.db.prepare("SELECT id, exe_path FROM apps WHERE exe_path LIKE '%\\WindowsApps\\%' ORDER BY id").all() as {
      id: number
      exe_path: string
    }[]
    const byFamily = new Map<string, number[]>()
    for (const r of rows) {
      const fam = familyFromWindowsAppsPath(r.exe_path)
      if (!fam) continue
      byFamily.set(fam, [...(byFamily.get(fam) ?? []), r.id])
    }
    // Reset name and icon so the tracker looks them up again through the package manager.
    const setFamily = this.db.prepare(
      'UPDATE apps SET package_family = ?, icon = NULL, display_name = CASE WHEN name_locked = 1 THEN display_name ELSE ? END WHERE id = ?'
    )
    const exeName = this.db.prepare('SELECT exe_name FROM apps WHERE id = ?')
    const tx = this.db.transaction(() => {
      for (const [fam, ids] of byFamily) {
        const [keep, ...dupes] = ids
        const exe = (exeName.get(keep) as { exe_name: string }).exe_name
        setFamily.run(fam, friendlyName(exe), keep)
        for (const d of dupes) this.absorbApp(d, keep)
      }
    })
    tx()
  }

  /** Moves every reference from `source` to `target` and deletes `source`. Used for true duplicates only. */
  private absorbApp(source: number, target: number): void {
    this.db.prepare('UPDATE sessions SET app_id = ? WHERE app_id = ?').run(target, source)
    this.db.prepare('UPDATE contexts SET app_id = ? WHERE app_id = ?').run(target, source)
    this.db.prepare('UPDATE apps SET merged_into = ? WHERE merged_into = ?').run(target, source)
    this.db.prepare('DELETE FROM limits WHERE app_id = ? AND EXISTS (SELECT 1 FROM limits WHERE app_id = ?)').run(source, target)
    this.db.prepare('UPDATE limits SET app_id = ? WHERE app_id = ?').run(target, source)
    this.db.prepare('DELETE FROM apps WHERE id = ?').run(source)
  }

  private stmts!: {
    appByPath: Database.Statement
    appByFamily: Database.Statement
    setFamilyPath: Database.Statement
    deleteSession: Database.Statement
    appById: Database.Statement
    insertApp: Database.Statement
    updateAppName: Database.Statement
    updateAppIcon: Database.Statement
    listApps: Database.Statement
    insertSession: Database.Statement
    updateSessionEnd: Database.Statement
    daySessions: Database.Statement
    rangeSessions: Database.Statement
    appDaily: Database.Statement
    appDayActive: Database.Statement
    dayTotals: Database.Statement
    rangeDaily: Database.Statement
    rangeApps: Database.Statement
    setHidden: Database.Statement
    setMerged: Database.Statement
    repointMerged: Database.Statement
    lockName: Database.Statement
    insertFocus: Database.Statement
    endFocus: Database.Statement
    incInterrupt: Database.Statement
    activeFocus: Database.Statement
    focusHistory: Database.Statement
    focusForDay: Database.Statement
    listLimits: Database.Statement
    upsertLimit: Database.Statement
    deleteLimit: Database.Statement
    getSetting: Database.Statement
    setSetting: Database.Statement
    listCategories: Database.Statement
    insertCategory: Database.Statement
    renameCategory: Database.Statement
    deleteCategory: Database.Statement
    setAppCategory: Database.Statement
    categoryForExe: Database.Statement
    dayCategories: Database.Statement
    rangeCategories: Database.Statement
    insertContext: Database.Statement
    updateContextEnd: Database.Statement
    appContexts: Database.Statement
    getMeta: Database.Statement
    setMeta: Database.Statement
  }

  private prepare(): void {
    const p = (sql: string): Database.Statement => this.db.prepare(sql)
    this.stmts = {
      appByPath: p('SELECT * FROM apps WHERE exe_path = ?'),
      appByFamily: p('SELECT * FROM apps WHERE package_family = ? ORDER BY id LIMIT 1'),
      setFamilyPath: p('UPDATE apps SET exe_path = ?, exe_name = ?, package_family = ? WHERE id = ?'),
      deleteSession: p('DELETE FROM sessions WHERE id = ?'),
      appById: p('SELECT * FROM apps WHERE id = ?'),
      insertApp: p('INSERT INTO apps (exe_path, exe_name, display_name, first_seen, package_family) VALUES (?, ?, ?, ?, ?)'),
      updateAppName: p('UPDATE apps SET display_name = ? WHERE id = ? AND name_locked = 0'),
      updateAppIcon: p('UPDATE apps SET icon = ? WHERE id = ?'),
      listApps: p('SELECT * FROM apps ORDER BY display_name COLLATE NOCASE'),
      insertSession: p('INSERT INTO sessions (app_id, start_ts, end_ts, is_idle, day) VALUES (?, ?, ?, ?, ?)'),
      updateSessionEnd: p('UPDATE sessions SET end_ts = ? WHERE id = ?'),
      // "a" is the raw app a session was recorded under, "e" the effective app after following merges.
      daySessions: p(
        `SELECT s.id, e.id AS app_id, s.start_ts, s.end_ts, s.is_idle, s.day, e.display_name, e.icon
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day = ? AND e.hidden = 0 ORDER BY s.start_ts`
      ),
      rangeSessions: p(
        `SELECT s.id, e.id AS app_id, s.start_ts, s.end_ts, s.is_idle, s.day, e.display_name, e.icon
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day BETWEEN ? AND ? AND e.hidden = 0 ORDER BY s.start_ts`
      ),
      appDaily: p(
        `SELECT day, SUM(CASE WHEN is_idle IN (0, 2) THEN end_ts - start_ts ELSE 0 END) AS active,
                SUM(CASE WHEN is_idle = 1 THEN end_ts - start_ts ELSE 0 END) AS idle
         FROM sessions WHERE app_id IN (SELECT id FROM apps WHERE id = ? OR merged_into = ?)
           AND day BETWEEN ? AND ? GROUP BY day`
      ),
      appDayActive: p(
        `SELECT COALESCE(SUM(end_ts - start_ts), 0) AS ms FROM sessions
         WHERE app_id IN (SELECT id FROM apps WHERE id = ? OR merged_into = ?) AND day = ? AND is_idle IN (0, 2)`
      ),
      dayTotals: p(
        `SELECT COALESCE(SUM(s.end_ts - s.start_ts), 0) AS screen,
                COALESCE(SUM(CASE WHEN s.is_idle IN (0, 2) THEN s.end_ts - s.start_ts ELSE 0 END), 0) AS active
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day = ? AND e.hidden = 0`
      ),
      rangeDaily: p(
        `SELECT s.day, SUM(CASE WHEN s.is_idle IN (0, 2) THEN s.end_ts - s.start_ts ELSE 0 END) AS active,
                SUM(CASE WHEN s.is_idle = 1 THEN s.end_ts - s.start_ts ELSE 0 END) AS idle
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day BETWEEN ? AND ? AND e.hidden = 0 GROUP BY s.day`
      ),
      rangeApps: p(
        `SELECT e.id, e.display_name, e.icon,
                SUM(CASE WHEN s.is_idle IN (0, 2) THEN s.end_ts - s.start_ts ELSE 0 END) AS active
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day BETWEEN ? AND ? AND e.hidden = 0 GROUP BY e.id ORDER BY active DESC LIMIT ?`
      ),
      setHidden: p('UPDATE apps SET hidden = ? WHERE id = ?'),
      setMerged: p('UPDATE apps SET merged_into = ? WHERE id = ?'),
      repointMerged: p('UPDATE apps SET merged_into = ? WHERE merged_into = ?'),
      lockName: p('UPDATE apps SET display_name = ?, name_locked = 1 WHERE id = ?'),
      insertFocus: p(
        `INSERT INTO focus_sessions (label, start_ts, planned_sec, allowed_apps, restricted_apps, day)
         VALUES (?, ?, ?, ?, ?, ?)`
      ),
      endFocus: p('UPDATE focus_sessions SET end_ts = ?, completed = ? WHERE id = ?'),
      incInterrupt: p('UPDATE focus_sessions SET interruptions = interruptions + 1 WHERE id = ?'),
      activeFocus: p('SELECT * FROM focus_sessions WHERE end_ts IS NULL ORDER BY start_ts DESC LIMIT 1'),
      focusHistory: p('SELECT * FROM focus_sessions WHERE end_ts IS NOT NULL ORDER BY start_ts DESC LIMIT ?'),
      focusForDay: p('SELECT * FROM focus_sessions WHERE day = ? ORDER BY start_ts'),
      listLimits: p(
        `SELECT l.id, l.app_id, l.daily_minutes, l.mode, a.display_name, a.icon
         FROM limits l JOIN apps a ON a.id = l.app_id ORDER BY a.display_name COLLATE NOCASE`
      ),
      upsertLimit: p(
        `INSERT INTO limits (app_id, daily_minutes, mode) VALUES (?, ?, ?)
         ON CONFLICT(app_id) DO UPDATE SET daily_minutes = excluded.daily_minutes, mode = excluded.mode`
      ),
      deleteLimit: p('DELETE FROM limits WHERE id = ?'),
      getSetting: p('SELECT value FROM settings WHERE key = ?'),
      setSetting: p('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      listCategories: p('SELECT * FROM categories ORDER BY sort, id'),
      insertCategory: p('INSERT INTO categories (name, color, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories))'),
      renameCategory: p('UPDATE categories SET name = ?, color = ? WHERE id = ?'),
      deleteCategory: p('DELETE FROM categories WHERE id = ?'),
      setAppCategory: p('UPDATE apps SET category_id = ? WHERE id = ?'),
      categoryForExe: p('SELECT category_id FROM apps WHERE lower(exe_name) = ? AND category_id IS NOT NULL LIMIT 1'),
      dayCategories: p(
        `SELECT e.category_id AS id, COUNT(DISTINCT e.id) AS apps,
                SUM(CASE WHEN s.is_idle IN (0, 2) THEN s.end_ts - s.start_ts ELSE 0 END) AS active
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day = ? AND e.hidden = 0 GROUP BY e.category_id`
      ),
      rangeCategories: p(
        `SELECT e.category_id AS id, COUNT(DISTINCT e.id) AS apps,
                SUM(CASE WHEN s.is_idle IN (0, 2) THEN s.end_ts - s.start_ts ELSE 0 END) AS active
         FROM sessions s JOIN apps a ON a.id = s.app_id JOIN apps e ON e.id = COALESCE(a.merged_into, a.id)
         WHERE s.day BETWEEN ? AND ? AND e.hidden = 0 GROUP BY e.category_id`
      ),
      insertContext: p('INSERT INTO contexts (app_id, title, start_ts, end_ts, day) VALUES (?, ?, ?, ?, ?)'),
      updateContextEnd: p('UPDATE contexts SET end_ts = ? WHERE id = ?'),
      appContexts: p(
        `SELECT c.title, SUM(c.end_ts - c.start_ts) AS ms, COUNT(*) AS count
         FROM contexts c JOIN apps a ON a.id = c.app_id
         WHERE COALESCE(a.merged_into, a.id) = ? AND c.day = ? GROUP BY c.title ORDER BY ms DESC LIMIT ?`
      ),
      getMeta: p('SELECT value FROM meta WHERE key = ?'),
      setMeta: p('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    }
  }

  close(): void {
    this.db.close()
  }

  // ---- apps -------------------------------------------------------------

  getOrCreateApp(
    exePath: string,
    exeName: string,
    displayName: string,
    packageFamily: string | null = null
  ): { app: AppInfo; created: boolean } {
    if (packageFamily) {
      // Packaged apps: identity is the family name; the path changes with every Store update.
      const fam = this.stmts.appByFamily.get(packageFamily) as AppRow | undefined
      if (fam) {
        if (fam.exe_path !== exePath) {
          const clash = this.stmts.appByPath.get(exePath) as AppRow | undefined
          if (clash && clash.id !== fam.id) this.absorbApp(clash.id, fam.id)
          this.stmts.setFamilyPath.run(exePath, exeName, packageFamily, fam.id)
          fam.exe_path = exePath
          fam.exe_name = exeName
        }
        return { app: toApp(fam), created: false }
      }
    }
    const row = this.stmts.appByPath.get(exePath) as AppRow | undefined
    if (row) {
      if (packageFamily && !row.package_family) {
        this.stmts.setFamilyPath.run(exePath, exeName, packageFamily, row.id)
        row.package_family = packageFamily
      }
      return { app: toApp(row), created: false }
    }
    const info = this.stmts.insertApp.run(exePath, exeName, displayName, Date.now(), packageFamily)
    const id = Number(info.lastInsertRowid)
    const categoryId = this.defaultCategory(exeName)
    if (categoryId !== null) this.stmts.setAppCategory.run(categoryId, id)
    return {
      app: {
        id,
        exePath,
        exeName,
        displayName,
        icon: null,
        hidden: false,
        mergedInto: null,
        nameLocked: false,
        packageFamily,
        categoryId
      },
      created: true
    }
  }

  /** Built-in default for known executables, else the category another install of the same exe uses. */
  private defaultCategory(exeName: string): number | null {
    const exe = exeName.toLowerCase()
    const known = DEFAULT_CATEGORIES.find((c) => c.exes.includes(exe))
    if (known) {
      const row = this.db.prepare('SELECT id FROM categories WHERE name = ?').get(known.name) as { id: number } | undefined
      if (row) return row.id
    }
    const same = this.stmts.categoryForExe.get(exe) as { category_id: number } | undefined
    return same?.category_id ?? null
  }

  // ---- categories -------------------------------------------------------

  listCategories(): Category[] {
    return this.stmts.listCategories.all() as Category[]
  }

  addCategory(name: string, color: string): Category {
    const clean = name.trim().slice(0, 40)
    const id = Number(this.stmts.insertCategory.run(clean, color).lastInsertRowid)
    return this.listCategories().find((c) => c.id === id)!
  }

  updateCategory(id: number, name: string, color: string): void {
    this.stmts.renameCategory.run(name.trim().slice(0, 40), color, id)
  }

  deleteCategory(id: number): void {
    this.stmts.deleteCategory.run(id)
  }

  setAppCategory(appId: number, categoryId: number | null): void {
    this.stmts.setAppCategory.run(categoryId, appId)
  }

  dayCategories(day: string): CategoryUsage[] {
    return this.categoriesFrom(this.stmts.dayCategories.all(day) as { id: number | null; apps: number; active: number }[])
  }

  rangeCategories(fromDay: string, toDay_: string): CategoryUsage[] {
    return this.categoriesFrom(this.stmts.rangeCategories.all(fromDay, toDay_) as { id: number | null; apps: number; active: number }[])
  }

  private categoriesFrom(rows: { id: number | null; apps: number; active: number }[]): CategoryUsage[] {
    const cats = this.listCategories()
    const out: CategoryUsage[] = []
    for (const r of rows) {
      const c = r.id === null ? { id: 0, name: 'Uncategorized', color: '#9aa3b2', sort: 999 } : cats.find((x) => x.id === r.id)
      if (!c) continue
      out.push({ ...c, activeMs: r.active, apps: r.apps })
    }
    return out.sort((a, b) => b.activeMs - a.activeMs)
  }

  // ---- window-title contexts (opt-in) -----------------------------------

  insertContext(appId: number, title: string, start: number, end: number): number {
    return Number(this.stmts.insertContext.run(appId, title, start, end, toDay(start)).lastInsertRowid)
  }

  updateContextEnd(id: number, end: number): void {
    this.stmts.updateContextEnd.run(end, id)
  }

  appContexts(appId: number, day: string, limit = 12): ContextUsage[] {
    return this.stmts.appContexts.all(appId, day, limit) as ContextUsage[]
  }

  clearContexts(): void {
    this.db.exec('DELETE FROM contexts')
  }

  // ---- misc persisted state (digest bookkeeping) ------------------------

  getMeta(key: string): string | null {
    const r = this.stmts.getMeta.get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.stmts.setMeta.run(key, value)
  }

  deleteSession(id: number): void {
    this.stmts.deleteSession.run(id)
  }

  getApp(id: number): AppInfo | null {
    const row = this.stmts.appById.get(id) as AppRow | undefined
    return row ? toApp(row) : null
  }

  setAppName(id: number, name: string): void {
    this.stmts.updateAppName.run(name, id)
  }

  setAppIcon(id: number, icon: string): void {
    this.stmts.updateAppIcon.run(icon, id)
  }

  listApps(): AppInfo[] {
    return (this.stmts.listApps.all() as AppRow[]).map(toApp)
  }

  /** Follows a merge link so callers see the app the user wants reported. */
  effectiveApp(app: AppInfo): AppInfo {
    if (app.mergedInto === null) return app
    return this.getApp(app.mergedInto) ?? app
  }

  renameApp(id: number, name: string): void {
    const clean = name.trim().slice(0, 60)
    if (!clean) return
    this.stmts.lockName.run(clean, id)
  }

  setAppHidden(id: number, hidden: boolean): void {
    this.stmts.setHidden.run(hidden ? 1 : 0, id)
  }

  /** Reports `sourceId` (and anything already merged into it) under `targetId`. Reversible with unmergeApp. */
  mergeApp(sourceId: number, targetId: number): void {
    if (sourceId === targetId) return
    const target = this.getApp(targetId)
    if (!target) return
    const finalTarget = target.mergedInto ?? target.id
    if (finalTarget === sourceId) return
    const tx = this.db.transaction(() => {
      this.stmts.repointMerged.run(finalTarget, sourceId)
      this.stmts.setMerged.run(finalTarget, sourceId)
      this.db.prepare('DELETE FROM limits WHERE app_id = ?').run(sourceId)
    })
    tx()
  }

  unmergeApp(id: number): void {
    this.stmts.setMerged.run(null, id)
  }

  // ---- sessions ---------------------------------------------------------

  /** kind: 0 active (input), 1 idle, 2 passive (no input, within the passive band). */
  insertSession(appId: number, start: number, end: number, kind: 0 | 1 | 2, day: string): number {
    return Number(this.stmts.insertSession.run(appId, start, end, kind, day).lastInsertRowid)
  }

  setSessionKind(id: number, kind: 0 | 1 | 2): void {
    this.db.prepare('UPDATE sessions SET is_idle = ? WHERE id = ?').run(kind, id)
  }

  updateSessionEnd(id: number, end: number): void {
    this.stmts.updateSessionEnd.run(end, id)
  }

  private daySessions(day: string): SessionRow[] {
    return this.stmts.daySessions.all(day) as SessionRow[]
  }

  dayTotals(day: string): { screenMs: number; activeMs: number } {
    const r = this.stmts.dayTotals.get(day) as { screen: number; active: number }
    return { screenMs: r.screen, activeMs: r.active }
  }

  appActiveMs(appId: number, day: string): number {
    return (this.stmts.appDayActive.get(appId, appId, day) as { ms: number }).ms
  }

  daySummary(day: string): DaySummary {
    const rows = this.daySessions(day)
    let screenMs = 0
    let activeMs = 0
    let passiveMs = 0
    let idleMs = 0
    let firstActivity: number | null = null
    let lastActivity: number | null = null
    for (const r of rows) {
      const dur = r.end_ts - r.start_ts
      screenMs += dur
      if (r.is_idle === 1) idleMs += dur
      else {
        activeMs += dur
        if (r.is_idle === 2) passiveMs += dur
        if (firstActivity === null) firstActivity = r.start_ts
        lastActivity = r.end_ts
      }
    }
    const stretches = activeStretches(rows)
    let longest: Stretch | null = null
    for (const s of stretches) if (!longest || s.end - s.start > longest.end - longest.start) longest = s
    let switches = 0
    for (const t of transitions(rows).values()) switches += t.count

    const focus = this.stmts.focusForDay.all(day) as FocusRow[]
    const now = Date.now()
    let focusMs = 0
    for (const f of focus) focusMs += (f.end_ts ?? now) - f.start_ts

    return {
      day,
      screenMs,
      activeMs,
      passiveMs,
      idleMs,
      sessions: stretches.length,
      longestSessionMs: longest ? longest.end - longest.start : 0,
      longestSessionStart: longest?.start ?? null,
      longestSessionEnd: longest?.end ?? null,
      switches,
      focusMs,
      focusSessions: focus.length,
      firstActivity,
      lastActivity
    }
  }

  dayApps(day: string): AppUsage[] {
    const rows = this.daySessions(day)
    const byApp = new Map<number, AppUsage & { _cur: Stretch | null }>()
    for (const r of rows) {
      let u = byApp.get(r.app_id)
      if (!u) {
        const a = this.getApp(r.app_id)
        if (!a) continue
        u = { ...a, activeMs: 0, passiveMs: 0, idleMs: 0, sessions: 0, longestMs: 0, _cur: null }
        byApp.set(r.app_id, u)
      }
      const dur = r.end_ts - r.start_ts
      if (r.is_idle === 1) {
        u.idleMs += dur
        if (u._cur) {
          u.longestMs = Math.max(u.longestMs, u._cur.end - u._cur.start)
          u._cur = null
        }
        continue
      }
      u.activeMs += dur
      if (r.is_idle === 2) u.passiveMs += dur
      if (u._cur && r.start_ts - u._cur.end <= GAP_MS) u._cur.end = r.end_ts
      else {
        if (u._cur) u.longestMs = Math.max(u.longestMs, u._cur.end - u._cur.start)
        u._cur = { start: r.start_ts, end: r.end_ts }
        u.sessions++
      }
    }
    const out: AppUsage[] = []
    for (const u of byApp.values()) {
      if (u._cur) u.longestMs = Math.max(u.longestMs, u._cur.end - u._cur.start)
      const { _cur, ...rest } = u
      void _cur
      out.push(rest)
    }
    return out.sort((a, b) => b.activeMs + b.idleMs - (a.activeMs + a.idleMs))
  }

  timeline(day: string): TimelineSegment[] {
    const rows = this.daySessions(day)
    const out: TimelineSegment[] = []
    for (const r of rows) {
      const last = out[out.length - 1]
      if (last && last.appId === r.app_id && last.isIdle === (r.is_idle === 1) && last.passive === (r.is_idle === 2) && r.start_ts - last.end <= GAP_MS) {
        last.end = Math.max(last.end, r.end_ts)
        continue
      }
      out.push({
        id: r.id,
        appId: r.app_id,
        appName: r.display_name,
        icon: r.icon,
        start: r.start_ts,
        end: r.end_ts,
        isIdle: r.is_idle === 1,
        passive: r.is_idle === 2
      })
    }
    return out
  }

  dayTransitions(day: string, limit = 8): Transition[] {
    return [...transitions(this.daySessions(day)).values()].sort((a, b) => b.count - a.count).slice(0, limit)
  }

  appDetail(appId: number, day: string): AppDetail | null {
    const app = this.getApp(appId)
    if (!app) return null
    const from = addDays(day, -6)
    const rows = this.stmts.appDaily.all(appId, appId, from, day) as { day: string; active: number; idle: number }[]
    const map = new Map(rows.map((r) => [r.day, r]))
    const daily: DailyPoint[] = []
    let total = 0
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i)
      const r = map.get(d)
      const activeMs = r?.active ?? 0
      const idleMs = r?.idle ?? 0
      total += activeMs
      daily.push({ day: d, activeMs, idleMs, screenMs: activeMs + idleMs })
    }
    const yesterday = addDays(day, -1)
    const yRow = this.stmts.appDaily.get(appId, appId, yesterday, yesterday) as { active: number } | undefined
    const todayUsage = this.dayApps(day).find((a) => a.id === appId)
    return {
      app,
      todayMs: daily[6].activeMs,
      yesterdayMs: yRow?.active ?? 0,
      weeklyAvgMs: Math.round(total / 7),
      sessions: todayUsage?.sessions ?? 0,
      longestMs: todayUsage?.longestMs ?? 0,
      daily
    }
  }

  weekly(startDay: string): WeeklyReport {
    const endDay = addDays(startDay, 6)
    const rows = this.stmts.rangeDaily.all(startDay, endDay) as { day: string; active: number; idle: number }[]
    const map = new Map(rows.map((r) => [r.day, r]))
    const days: DailyPoint[] = []
    let totalMs = 0
    let activeMs = 0
    let idleMs = 0
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDay, i)
      const r = map.get(d)
      const a = r?.active ?? 0
      const idl = r?.idle ?? 0
      activeMs += a
      idleMs += idl
      totalMs += a + idl
      days.push({ day: d, activeMs: a, idleMs: idl, screenMs: a + idl })
    }
    return { startDay, days, totalMs, activeMs, idleMs }
  }

  monthly(month: string): MonthlyReport {
    const [y, m] = month.split('-').map(Number)
    const first = toDay(new Date(y, m - 1, 1).getTime())
    const daysInMonth = new Date(y, m, 0).getDate()
    const last = addDays(first, daysInMonth - 1)
    const rows = this.stmts.rangeDaily.all(first, last) as { day: string; active: number; idle: number }[]
    const map = new Map(rows.map((r) => [r.day, r]))
    const days: DailyPoint[] = []
    let totalMs = 0
    let activeMs = 0
    let idleMs = 0
    let activeDays = 0
    let busiest: DailyPoint | null = null
    for (let i = 0; i < daysInMonth; i++) {
      const d = addDays(first, i)
      const r = map.get(d)
      const a = r?.active ?? 0
      const idl = r?.idle ?? 0
      const point = { day: d, activeMs: a, idleMs: idl, screenMs: a + idl }
      if (a + idl > 0) activeDays++
      if (!busiest || point.screenMs > busiest.screenMs) busiest = point
      activeMs += a
      idleMs += idl
      totalMs += a + idl
      days.push(point)
    }
    const top = this.stmts.rangeApps.all(first, last, 6) as {
      id: number
      display_name: string
      icon: string | null
      active: number
    }[]
    return {
      month,
      days,
      totalMs,
      activeMs,
      idleMs,
      activeDays,
      busiestDay: busiest && busiest.screenMs > 0 ? busiest : null,
      topApps: top.map((t) => ({ id: t.id, name: t.display_name, icon: t.icon, activeMs: t.active }))
    }
  }

  insights(fromDay: string, toDay_: string): Insights {
    const rows = this.stmts.rangeSessions.all(fromDay, toDay_) as SessionRow[]
    const stretches = activeStretches(rows)
    let longest: Stretch | null = null
    for (const s of stretches) if (!longest || s.end - s.start > longest.end - longest.start) longest = s

    const hourly = new Array<number>(24).fill(0)
    const byApp = new Map<number, { name: string; icon: string | null; ms: number }>()
    for (const r of rows) {
      if (r.is_idle === 1) continue
      splitByHour(r.start_ts, r.end_ts, (h, ms) => (hourly[h] += ms))
      const a = byApp.get(r.app_id) ?? { name: r.display_name, icon: r.icon, ms: 0 }
      a.ms += r.end_ts - r.start_ts
      byApp.set(r.app_id, a)
    }
    let block: Insights['highestUsageBlock'] = null
    for (let h = 0; h <= 21; h++) {
      const ms = hourly[h] + hourly[h + 1] + hourly[h + 2]
      if (ms > 0 && (!block || ms > block.activeMs)) block = { startHour: h, endHour: h + 3, activeMs: ms }
    }
    let mostUsed: Insights['mostUsedApp'] = null
    for (const a of byApp.values()) if (!mostUsed || a.ms > mostUsed.ms) mostUsed = a
    let top: Transition | null = null
    for (const t of transitions(rows).values()) if (!top || t.count > top.count) top = t
    const lateNightMs = hourly[23] + hourly[0] + hourly[1] + hourly[2] + hourly[3] + hourly[4]
    return {
      longestFocusPeriod: longest,
      highestUsageBlock: block,
      mostUsedApp: mostUsed,
      mostFrequentSwitch: top,
      lateNightMs,
      hourly
    }
  }

  // ---- focus ------------------------------------------------------------

  startFocus(label: string, plannedSec: number, allowed: number[], restricted: number[]): FocusSession {
    const start = Date.now()
    const id = Number(
      this.stmts.insertFocus.run(label, start, plannedSec, JSON.stringify(allowed), JSON.stringify(restricted), toDay(start))
        .lastInsertRowid
    )
    return { id, label, startTs: start, endTs: null, plannedSec, completed: false, interruptions: 0, allowedApps: allowed, restrictedApps: restricted }
  }

  endFocus(id: number, endTs: number, completed: boolean): void {
    this.stmts.endFocus.run(endTs, completed ? 1 : 0, id)
  }

  incrementInterruptions(id: number): void {
    this.stmts.incInterrupt.run(id)
  }

  activeFocus(): FocusSession | null {
    const r = this.stmts.activeFocus.get() as FocusRow | undefined
    return r ? toFocus(r) : null
  }

  focusHistory(limit = 20): FocusSession[] {
    return (this.stmts.focusHistory.all(limit) as FocusRow[]).map(toFocus)
  }

  focusStats(day: string): FocusStats {
    const rows = (this.stmts.focusForDay.all(day) as FocusRow[]).map(toFocus)
    const now = Date.now()
    let todayMs = 0
    let completed = 0
    let interrupted = 0
    let longestMs = 0
    for (const f of rows) {
      const dur = (f.endTs ?? now) - f.startTs
      todayMs += dur
      longestMs = Math.max(longestMs, dur)
      if (f.endTs !== null) {
        if (f.completed) completed++
        else interrupted++
      }
    }
    return { todayMs, todaySessions: rows.length, completed, interrupted, longestMs }
  }

  // ---- limits -----------------------------------------------------------

  listLimits(day: string): AppLimit[] {
    const rows = this.stmts.listLimits.all() as {
      id: number
      app_id: number
      daily_minutes: number
      mode: LimitMode
      display_name: string
      icon: string | null
    }[]
    return rows.map((r) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.display_name,
      icon: r.icon,
      dailyMinutes: r.daily_minutes,
      mode: r.mode,
      usedMs: this.appActiveMs(r.app_id, day)
    }))
  }

  setLimit(appId: number, dailyMinutes: number, mode: LimitMode): void {
    this.stmts.upsertLimit.run(appId, dailyMinutes, mode)
  }

  removeLimit(id: number): void {
    this.stmts.deleteLimit.run(id)
  }

  // ---- settings ---------------------------------------------------------

  getSettings(): Settings {
    const r = this.stmts.getSetting.get('settings') as { value: string } | undefined
    if (!r) return { ...DEFAULT_SETTINGS }
    try {
      const saved = JSON.parse(r.value) as Partial<Settings>
      const appearance = { ...DEFAULT_SETTINGS.appearance, ...(saved.appearance ?? {}) }
      if ((appearance.lightBase as string) === 'white') appearance.lightBase = 'sage'
      return { ...DEFAULT_SETTINGS, ...saved, appearance }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(s: Settings): void {
    this.stmts.setSetting.run('settings', JSON.stringify(s))
  }

  // ---- data management --------------------------------------------------

  exportAll(): unknown {
    return {
      exportedAt: new Date().toISOString(),
      apps: this.db.prepare('SELECT id, exe_path, exe_name, display_name, first_seen FROM apps').all(),
      sessions: this.db.prepare('SELECT * FROM sessions ORDER BY start_ts').all(),
      focusSessions: this.db.prepare('SELECT * FROM focus_sessions ORDER BY start_ts').all(),
      limits: this.db.prepare('SELECT * FROM limits').all(),
      categories: this.listCategories(),
      contexts: this.db.prepare('SELECT * FROM contexts ORDER BY start_ts').all(),
      settings: this.getSettings()
    }
  }

  clearUsageData(): void {
    this.db.exec('DELETE FROM sessions; DELETE FROM focus_sessions; DELETE FROM contexts; VACUUM;')
  }

  /** Removes every trace of an executable (used to drop self-tracking data recorded by older builds). */
  purgeApp(exePath: string): void {
    const row = this.stmts.appByPath.get(exePath) as AppRow | undefined
    if (!row) return
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM sessions WHERE app_id = ?').run(row.id)
      this.db.prepare('DELETE FROM contexts WHERE app_id = ?').run(row.id)
      this.db.prepare('DELETE FROM limits WHERE app_id = ?').run(row.id)
      this.db.prepare('DELETE FROM apps WHERE id = ?').run(row.id)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  sizeInfo(): { sessions: number; apps: number; firstDay: string | null } {
    const s = this.db.prepare('SELECT COUNT(*) AS c, MIN(day) AS d FROM sessions').get() as { c: number; d: string | null }
    const a = this.db.prepare('SELECT COUNT(*) AS c FROM apps').get() as { c: number }
    return { sessions: s.c, apps: a.c, firstDay: s.d }
  }
}
