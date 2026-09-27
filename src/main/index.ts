import { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, powerMonitor, shell } from 'electron'
import { dirname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { release } from 'os'
import { writeFile } from 'fs/promises'
import { DB, today } from './db'
import { Tracker } from './tracker'
import { Guardian } from './guardian'
import { AppTray, resourcePath } from './tray'
import { initLogging, log } from './logger'
import type { LimitMode, LoginStatus, Page, Settings } from '../shared/types'
import { screen } from 'electron'

const APP_ID = 'com.desktime.app'
const HIDDEN_ARG = '--hidden'
const START_HIDDEN = process.argv.includes(HIDDEN_ARG)
// Dev only: DESKTIME_CAPTURE="page:out.png" renders that page offscreen, saves a PNG and quits.
const CAPTURE = process.env.DESKTIME_CAPTURE

// Single instance: a second launch just surfaces the dashboard.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  main()
}

/**
 * The app used to be called Wellbeing. Move its data folder to the new name once, then always
 * use the new location.
 */
function migrateDataDir(): string {
  const dir = app.getPath('userData')
  const file = join(dir, 'desktime.db')
  if (existsSync(file)) return file
  const oldDir = join(dirname(dir), 'Wellbeing')
  const oldFile = join(oldDir, 'wellbeing.db')
  if (existsSync(oldFile)) {
    try {
      mkdirSync(dir, { recursive: true })
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(oldFile + suffix)) copyFileSync(oldFile + suffix, file + suffix)
      }
      renameSync(oldFile, oldFile + '.migrated')
    } catch (err) {
      console.error('[migrate] could not move old data', err)
    }
  }
  return file
}

function main(): void {
  app.setAppUserModelId(APP_ID)
  app.setName('DeskTime')
  initLogging(app.getPath('userData'))

  const dbPath = migrateDataDir()
  const db = new DB(dbPath)
  // Drop any self-tracking rows left behind by earlier builds.
  db.purgeApp(process.execPath)
  let settings: Settings = db.getSettings()
  // Theme v2 (light/dark, subtle depth): glass is off by default now; apply once to settings saved before it.
  if (db.getMeta('theme:v2') !== '1') {
    settings = { ...settings, windowMaterial: 'none' }
    db.saveSettings(settings)
    db.setMeta('theme:v2', '1')
  }
  const getSettings = (): Settings => settings

  if (!settings.hardwareAcceleration) app.disableHardwareAcceleration()

  // Mica / Acrylic need Windows 11 22H2 (build 22621) or later.
  const winBuild = Number(release().split('.')[2] ?? 0)
  const material = settings.windowMaterial !== 'none' && winBuild >= 22621 ? settings.windowMaterial : null
  nativeTheme.themeSource = settings.theme
  const isDark = (): boolean => nativeTheme.shouldUseDarkColors
  const CHROME: Record<string, { bg: string; symbol: string }> = {
    forest: { bg: '#0B1210', symbol: '#97A69C' },
    navy: { bg: '#0A1220', symbol: '#93A1B8' },
    graphite: { bg: '#121110', symbol: '#A39C93' },
    neutral: { bg: '#0E0E10', symbol: '#9A9AA3' },
    cool: { bg: '#F5F6F9', symbol: '#5B6472' },
    paper: { bg: '#F7F4EE', symbol: '#6B655C' },
    mist: { bg: '#EAEFF6', symbol: '#55647C' },
    sage: { bg: '#EDF3EE', symbol: '#58695F' }
  }
  const chrome = (): { bg: string; symbol: string } => {
    const a = settings.appearance
    return CHROME[isDark() ? a.darkBase : a.lightBase] ?? CHROME.forest
  }
  const rendererFlags = (): Record<string, string> => ({
    ...(material ? { material: '1' } : {}),
    ...(settings.hardwareAcceleration ? { gpu: '1' } : {}),
    ...(isDark() ? { dark: '1' } : {}),
    db: settings.appearance.darkBase,
    lb: settings.appearance.lightBase,
    ac: settings.appearance.accent,
    rd: settings.appearance.radius,
    mo: settings.appearance.motion,
    ft: settings.appearance.font
  })
  const applyChrome = (): void => {
    const c = chrome()
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue
      w.webContents.send('theme:changed', { dark: isDark(), appearance: settings.appearance })
      try {
        w.setBackgroundColor(material ? '#00000000' : c.bg)
        if (w === win) w.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: 44 })
      } catch {
        /* popup has no overlay */
      }
    }
  }
  nativeTheme.on('updated', () => applyChrome())

  let win: BrowserWindow | null = null
  let tray: AppTray | null = null
  let pendingPage: Page | null = null

  const send = (channel: string, payload?: unknown): void => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const notify = (title: string, body: string, page?: Page): void => {
    if (!settings.notificationsEnabled || !Notification.isSupported()) return
    const n = new Notification({ title, body, icon: resourcePath('icon.png'), silent: false })
    n.on('click', () => createWindow(page))
    n.show()
  }

  const tracker = new Tracker(db, getSettings, dbPath)
  const guardian = new Guardian(db, tracker, getSettings, notify, (f) => send('focus:update', f))

  tracker.on('status', () => send('tracker:status', tracker.getStatus()))
  tracker.on('apps-changed', () => send('apps:changed'))

  function createWindow(page?: Page): void {
    if (page) pendingPage = page
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (pendingPage) {
        send('navigate', pendingPage)
        pendingPage = null
      }
      return
    }
    win = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      show: false,
      backgroundColor: material ? '#00000000' : chrome().bg,
      ...(material ? { backgroundMaterial: material } : {}),
      title: 'DeskTime',
      icon: resourcePath('icon.ico'),
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: chrome().bg, symbolColor: chrome().symbol, height: 44 },
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: true,
        spellcheck: false
      }
    })
    win.once('ready-to-show', () => win?.show())
    win.webContents.on('did-finish-load', () => {
      if (pendingPage) {
        send('navigate', pendingPage)
        pendingPage = null
      }
    })
    win.on('unresponsive', () => log.warn('dashboard window unresponsive'))
    win.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') log.warn(`renderer: ${event.message} (${event.sourceId}:${event.lineNumber})`)
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    // Closing the dashboard destroys the renderer to free memory; tracking continues in the tray.
    win.on('closed', () => {
      win = null
    })
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      const q = new URLSearchParams(rendererFlags()).toString()
      void win.loadURL(process.env.ELECTRON_RENDERER_URL + (q ? `?${q}` : ''))
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { query: rendererFlags() })
    }
  }

  // ---- tray popup: small, basic, destroyed when it loses focus ----------
  let popup: BrowserWindow | null = null

  function togglePopup(trayBounds: Electron.Rectangle): void {
    if (popup && !popup.isDestroyed()) {
      popup.close()
      return
    }
    const W = 300
    const H = 190
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    const wa = display.workArea
    const x = Math.round(Math.min(Math.max(trayBounds.x + trayBounds.width / 2 - W / 2, wa.x + 8), wa.x + wa.width - W - 8))
    const y = Math.round(trayBounds.y > wa.y + wa.height / 2 ? wa.y + wa.height - H - 8 : wa.y + 8)
    popup = new BrowserWindow({
      width: W,
      height: H,
      x,
      y,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: material ? '#00000000' : chrome().bg,
      ...(material ? { backgroundMaterial: 'acrylic' as const } : {}),
      roundedCorners: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: true
      }
    })
    popup.once('ready-to-show', () => popup?.show())
    popup.on('blur', () => popup?.close())
    popup.on('closed', () => {
      popup = null
    })
    const flags = { ...rendererFlags(), popup: '1' }
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      void popup.loadURL(process.env.ELECTRON_RENDERER_URL + '?' + new URLSearchParams(flags).toString())
    } else {
      void popup.loadFile(join(__dirname, '../renderer/index.html'), { query: flags })
    }
  }

  // ---- launch at login --------------------------------------------------
  // Registers under HKCU\...\Run. Packaged: the installed exe. Dev: electron.exe with the project path,
  // so the toggle can be exercised without installing.
  function loginItemArgs(): string[] {
    return app.isPackaged ? [HIDDEN_ARG] : [app.getAppPath(), HIDDEN_ARG]
  }

  function applyLoginItem(): void {
    try {
      // Remove the entry written under the old product name, if any.
      app.setLoginItemSettings({ openAtLogin: false, name: 'Wellbeing' })
      app.setLoginItemSettings({
        openAtLogin: settings.launchAtStartup,
        path: process.execPath,
        args: loginItemArgs()
      })
    } catch (err) {
      console.error('[startup] could not update login item', err)
    }
  }

  function loginStatus(): LoginStatus {
    try {
      const s = app.getLoginItemSettings({ path: process.execPath, args: loginItemArgs() })
      return { openAtLogin: s.openAtLogin, supported: true }
    } catch {
      return { openAtLogin: false, supported: false }
    }
  }

  function quit(): void {
    app.quit()
  }

  async function capturePage(spec: string): Promise<void> {
    const sep = spec.indexOf(':')
    const page = spec.slice(0, sep) as Page
    const file = spec.slice(sep + 1)
    const isPopup = (page as string) === 'popup'
    if (process.env.DESKTIME_CAPTURE_THEME) nativeTheme.themeSource = process.env.DESKTIME_CAPTURE_THEME as 'light' | 'dark'
    const w = new BrowserWindow({
      width: isPopup ? 300 : 1180,
      height: isPopup ? 190 : Number(process.env.DESKTIME_CAPTURE_H ?? 780),
      show: false,
      backgroundColor: chrome().bg,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        // Hidden windows throttle animation frames; the page transitions would never finish.
        backgroundThrottling: false
      }
    })
    await w.loadFile(join(__dirname, '../renderer/index.html'), {
      query: {
        ...rendererFlags(),
        static: '1',
        page,
        ...(process.env.DESKTIME_CAPTURE_SCROLL ? { shift: process.env.DESKTIME_CAPTURE_SCROLL } : {}),
        ...(process.env.DESKTIME_CAPTURE_TAB ? { tab: process.env.DESKTIME_CAPTURE_TAB } : {}),
        ...(process.env.DESKTIME_CAPTURE_ONBOARDING ? { onboarding: '1' } : {}),
        ...(isDark() ? { dark: '1' } : {}),
        ...(isPopup ? { popup: '1' } : {})
      }
    })
    await new Promise((r) => setTimeout(r, 600))
    w.webContents.send('navigate', page)
    await new Promise((r) => setTimeout(r, 2500))

    const img = await w.webContents.capturePage()
    await writeFile(file, img.toPNG())
    if (process.env.DESKTIME_CAPTURE_TEXT) {
      console.log(await w.webContents.executeJavaScript('document.body.innerText'))
      console.log(JSON.stringify(tracker.getDiagnostics(), null, 1))
    }
    console.log(`captured ${page} -> ${file}`)
    quit()
  }

  function appsChanged(): void {
    tracker.clearAppCache()
    guardian.invalidateLimits()
    send('apps:changed')
    send('data:changed')
    tray?.refresh()
  }

  // ---- IPC --------------------------------------------------------------

  ipcMain.handle('tracker:status', () => tracker.getStatus())
  ipcMain.handle('tracker:pause', (_e, minutes?: number) => {
    tracker.pause(minutes)
    tray?.refresh()
  })
  ipcMain.handle('tracker:diagnostics', () => tracker.getDiagnostics())
  ipcMain.handle('tracker:resume', () => {
    tracker.resume()
    tray?.refresh()
  })

  ipcMain.handle('summary:day', (_e, day: string) => {
    tracker.flush()
    return db.daySummary(day)
  })
  ipcMain.handle('summary:apps', (_e, day: string) => {
    tracker.flush()
    return db.dayApps(day)
  })
  ipcMain.handle('timeline:day', (_e, day: string) => {
    tracker.flush()
    return db.timeline(day)
  })
  ipcMain.handle('transitions:day', (_e, day: string, limit?: number) => db.dayTransitions(day, limit))
  ipcMain.handle('apps:list', () => db.listApps())
  ipcMain.handle('apps:detail', (_e, appId: number, day: string) => {
    tracker.flush()
    return db.appDetail(appId, day)
  })
  ipcMain.handle('apps:rename', (_e, id: number, name: string) => {
    db.renameApp(id, String(name))
    appsChanged()
  })
  ipcMain.handle('apps:hide', (_e, id: number, hidden: boolean) => {
    db.setAppHidden(id, !!hidden)
    appsChanged()
  })
  ipcMain.handle('apps:merge', (_e, sourceId: number, targetId: number) => {
    db.mergeApp(sourceId, targetId)
    appsChanged()
  })
  ipcMain.handle('apps:unmerge', (_e, id: number) => {
    db.unmergeApp(id)
    appsChanged()
  })
  ipcMain.handle('categories:list', () => db.listCategories())
  ipcMain.handle('categories:add', (_e, name: string, color: string) => {
    const c = db.addCategory(String(name), String(color))
    appsChanged()
    return c
  })
  ipcMain.handle('categories:update', (_e, id: number, name: string, color: string) => {
    db.updateCategory(id, String(name), String(color))
    appsChanged()
  })
  ipcMain.handle('categories:delete', (_e, id: number) => {
    db.deleteCategory(id)
    appsChanged()
  })
  ipcMain.handle('apps:category', (_e, appId: number, categoryId: number | null) => {
    db.setAppCategory(appId, categoryId)
    appsChanged()
  })
  ipcMain.handle('summary:categories', (_e, day: string) => {
    tracker.flush()
    return db.dayCategories(day)
  })
  ipcMain.handle('summary:categoriesRange', (_e, fromDay: string, toDay: string) => {
    tracker.flush()
    return db.rangeCategories(fromDay, toDay)
  })
  ipcMain.handle('contexts:app', (_e, appId: number, day: string, limit?: number) => {
    tracker.flush()
    return db.appContexts(appId, day, limit)
  })
  ipcMain.handle('contexts:clear', () => {
    db.clearContexts()
    send('data:changed')
  })
  ipcMain.handle('window:open', (_e, page?: Page) => {
    popup?.close()
    createWindow(page)
  })
  ipcMain.handle('popup:close', () => popup?.close())
  ipcMain.handle('report:weekly', (_e, startDay: string) => {
    tracker.flush()
    return db.weekly(startDay)
  })
  ipcMain.handle('report:monthly', (_e, month: string) => {
    tracker.flush()
    return db.monthly(month)
  })
  ipcMain.handle('insights:range', (_e, fromDay: string, toDay: string) => {
    tracker.flush()
    return db.insights(fromDay, toDay)
  })

  ipcMain.handle('focus:state', () => guardian.getFocus())
  ipcMain.handle(
    'focus:start',
    (_e, label: string, plannedMin: number, allowed: number[], restricted: number[]) =>
      guardian.startFocus(label, plannedMin, allowed, restricted)
  )
  ipcMain.handle('focus:end', () => guardian.endFocus())
  ipcMain.handle('focus:history', (_e, limit?: number) => db.focusHistory(limit))
  ipcMain.handle('focus:stats', (_e, day: string) => db.focusStats(day))

  ipcMain.handle('limits:list', (_e, day: string) => {
    tracker.flush()
    return db.listLimits(day)
  })
  ipcMain.handle('limits:set', (_e, appId: number, minutes: number, mode: LimitMode) => {
    db.setLimit(appId, minutes, mode)
    guardian.invalidateLimits()
  })
  ipcMain.handle('limits:remove', (_e, id: number) => {
    db.removeLimit(id)
    guardian.invalidateLimits()
  })

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, next: Settings) => {
    const prev = settings
    settings = { ...settings, ...next }
    db.saveSettings(settings)
    if (prev.launchAtStartup !== settings.launchAtStartup) applyLoginItem()
    if (prev.theme !== settings.theme) nativeTheme.themeSource = settings.theme
    if (JSON.stringify(prev.appearance) !== JSON.stringify(settings.appearance)) applyChrome()
    tray?.refresh()
    return settings
  })
  ipcMain.handle('settings:loginStatus', () => loginStatus())

  ipcMain.handle('data:info', () => ({ ...db.sizeInfo(), path: app.getPath('userData') }))
  ipcMain.handle('data:openFolder', () => shell.openPath(app.getPath('userData')))
  ipcMain.handle('data:export', async () => {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export usage data',
      defaultPath: `desktime-export-${today()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return false
    tracker.flush()
    await writeFile(res.filePath, JSON.stringify(db.exportAll(), null, 2), 'utf8')
    return true
  })
  ipcMain.handle('data:clear', async () => {
    const res = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Delete everything', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Delete usage data',
      message: 'Delete all recorded usage and focus history?',
      detail: 'This cannot be undone. Settings, limits and the app list are kept.'
    })
    if (res.response !== 0) return false
    tracker.stop()
    db.clearUsageData()
    tracker.start()
    send('data:changed')
    return true
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('log:open', () => shell.openPath(log.dir()))
  ipcMain.handle('log:renderer', (_e, message: string) => log.error(`renderer: ${String(message).slice(0, 2000)}`))
  ipcMain.handle('app:quit', () => quit())

  // ---- lifecycle --------------------------------------------------------

  app.on('second-instance', () => createWindow())
  app.on('activate', () => createWindow())
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  })
  app.on('will-quit', () => {
    tracker.stop()
    tray?.destroy()
    db.close()
  })

  void app.whenReady().then(() => {
    powerMonitor.on('lock-screen', () => tracker.setLocked(true))
    powerMonitor.on('unlock-screen', () => tracker.setLocked(false))
    powerMonitor.on('suspend', () => tracker.setLocked(true))
    powerMonitor.on('resume', () => tracker.setLocked(false))

    tracker.start()
    log.info('tracker started')
    setTimeout(() => void tracker.enrichMissing(), 3000)
    tray = new AppTray({
      getStatus: () => tracker.getStatus(),
      showTrayTime: () => settings.showTrayScreenTime,
      onOpen: () => createWindow(),
      onPopup: (b) => togglePopup(b),
      onFocus: () => createWindow('focus'),
      onBreak: () => {
        guardian.takeBreak()
        tray?.refresh()
      },
      onPauseToggle: () => {
        if (tracker.isPaused()) tracker.resume()
        else tracker.pause()
        tray?.refresh()
      },
      onSettings: () => createWindow('settings'),
      onQuit: () => quit()
    })
    // Keep the registry entry in sync with the setting (path can change after an update).
    if (settings.launchAtStartup) applyLoginItem()

    if (CAPTURE && !app.isPackaged) {
      void capturePage(CAPTURE)
      return
    }

    // Launched by Windows at login with --hidden: stay in the tray if the user asked for that.
    const stayHidden = START_HIDDEN && settings.startMinimized
    if (!stayHidden) createWindow()

    if (!settings.firstRunDone) {
      settings = { ...settings, firstRunDone: true }
      db.saveSettings(settings)
      setTimeout(() => tray?.showFirstRunHint(), 4000)
    }
  })
}
