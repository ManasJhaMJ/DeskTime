// Auto-update via GitHub Releases. This is the only network access in the app: a request for the release
// manifest (latest.yml) at startup and every few hours, and the installer download when the user asks for it.
// Nothing about the user or their usage is sent; the request carries only the app name and version.
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { log } from './logger'

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 3_600_000

export class Updater {
  private status: UpdateStatus = { state: 'idle', version: null, percent: 0, checkedAt: null, error: null, reason: null }
  private timer: NodeJS.Timeout | null = null
  private firstCheck: NodeJS.Timeout | null = null
  private wired = false
  private announced: string | null = null

  constructor(
    private readonly enabled: () => boolean,
    private readonly onChange: (s: UpdateStatus) => void,
    private readonly onAvailable: (version: string) => void
  ) {
    if (!app.isPackaged) this.set({ state: 'disabled', reason: 'Update checks run in the installed app only.' })
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  /** Applies the "check for updates" setting. Call once at startup and whenever the setting changes. */
  configure(): void {
    if (!app.isPackaged) return
    if (!this.enabled()) {
      this.stopTimers()
      if (this.status.state !== 'downloaded') this.set({ state: 'disabled', reason: 'Automatic checks are off. You can still check manually.' })
      return
    }
    this.wire()
    if (this.status.state === 'disabled') this.set({ state: 'idle', reason: null })
    if (!this.timer) {
      this.firstCheck = setTimeout(() => void this.check(), FIRST_CHECK_MS)
      this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS)
    }
  }

  /** Checks the feed. Manual checks work even when automatic checks are off. */
  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status
    if (this.status.state === 'checking' || this.status.state === 'downloading' || this.status.state === 'downloaded') return this.status
    this.wire()
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.fail(err)
    }
    return this.status
  }

  async download(): Promise<UpdateStatus> {
    if (this.status.state !== 'available') return this.status
    this.set({ state: 'downloading', percent: 0, error: null })
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.fail(err)
    }
    return this.status
  }

  /** Quits, runs the installer silently and starts the new version. */
  install(): void {
    if (this.status.state !== 'downloaded') return
    log.info('[updater] installing', this.status.version)
    autoUpdater.quitAndInstall(true, true)
  }

  dispose(): void {
    this.stopTimers()
  }

  private wire(): void {
    if (this.wired) return
    this.wired = true
    autoUpdater.autoDownload = false
    // A downloaded update installs on the next quit even if the user never clicks "Restart".
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false
    // Betas see beta releases; a stable build only sees stable ones.
    autoUpdater.allowPrerelease = app.getVersion().includes('-')
    autoUpdater.logger = {
      info: (m: unknown) => log.info('[updater]', m),
      warn: (m: unknown) => log.warn('[updater]', m),
      error: (m: unknown) => log.error('[updater]', m),
      debug: () => {}
    }
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', error: null }))
    autoUpdater.on('update-available', (info) => {
      this.set({ state: 'available', version: info.version, checkedAt: Date.now(), error: null })
      if (this.announced !== info.version) {
        this.announced = info.version
        this.onAvailable(info.version)
      }
    })
    autoUpdater.on('update-not-available', () => this.set({ state: 'not-available', version: null, checkedAt: Date.now(), error: null }))
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'downloaded', version: info.version, percent: 100, error: null }))
    autoUpdater.on('error', (err) => this.fail(err))
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[updater] failed:', message)
    // Offline or GitHub unreachable is normal; keep it short for the UI.
    const short = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::ERR/i.test(message) ? 'Could not reach GitHub. Check your connection.' : message.split('\n')[0].slice(0, 160)
    this.set({ state: 'error', error: short, checkedAt: Date.now() })
  }

  private stopTimers(): void {
    if (this.firstCheck) clearTimeout(this.firstCheck)
    if (this.timer) clearInterval(this.timer)
    this.firstCheck = null
    this.timer = null
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange(this.status)
  }
}
