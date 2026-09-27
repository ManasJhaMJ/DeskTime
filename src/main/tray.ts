import { Menu, Tray, nativeImage, app } from 'electron'
import { join } from 'path'
import type { TrackerStatus } from '../shared/types'

export interface TrayActions {
  getStatus: () => TrackerStatus
  showTrayTime: () => boolean
  onOpen: () => void
  onPopup: (bounds: Electron.Rectangle) => void
  onFocus: () => void
  onBreak: () => void
  onPauseToggle: () => void
  onSettings: () => void
  onQuit: () => void
}

/** Icons live outside the asar (electron-builder extraResources) so the shell can read them directly. */
export function resourcePath(name: string): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, name)
}

function fmt(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export class AppTray {
  private readonly tray: Tray
  private readonly timer: NodeJS.Timeout
  // Multi-size ICO so Windows picks a crisp frame for the current DPI.
  private readonly iconOn = nativeImage.createFromPath(resourcePath('tray.ico'))
  private readonly iconOff = nativeImage.createFromPath(resourcePath('tray-paused.ico'))

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(this.iconOn)
    this.tray.on('click', () => actions.onPopup(this.tray.getBounds()))
    this.tray.on('double-click', () => actions.onOpen())
    this.refresh()
    this.timer = setInterval(() => this.refresh(), 60_000)
  }

  refresh(): void {
    const s = this.actions.getStatus()
    const paused = s.paused
    const time = fmt(s.todayScreenMs)
    this.tray.setImage(paused ? this.iconOff : this.iconOn)
    this.tray.setToolTip(
      this.actions.showTrayTime() ? `DeskTime · ${time} today${paused ? ' · paused' : ''}` : 'DeskTime'
    )
    const menu = Menu.buildFromTemplate([
      { label: 'DeskTime', enabled: false },
      { label: this.actions.showTrayTime() ? `Screen time  ${time}` : 'Tracking active', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: this.actions.onOpen },
      { label: 'Start Focus', click: this.actions.onFocus },
      { label: 'Take a Break', click: this.actions.onBreak, enabled: !paused },
      { label: paused ? 'Resume Tracking' : 'Pause Tracking', click: this.actions.onPauseToggle },
      { type: 'separator' },
      { label: 'Settings', click: this.actions.onSettings },
      { label: 'Quit', click: this.actions.onQuit }
    ])
    this.tray.setContextMenu(menu)
  }

  /** Windows 11 hides new tray icons in the overflow area; point this out once. */
  showFirstRunHint(): void {
    this.tray.displayBalloon({
      title: 'DeskTime is running in the tray',
      content: 'Drag this icon out of the hidden-icons area to keep screen time one click away.',
      iconType: 'custom',
      icon: nativeImage.createFromPath(resourcePath('icon.png'))
    })
  }

  destroy(): void {
    clearInterval(this.timer)
    this.tray.destroy()
  }
}
