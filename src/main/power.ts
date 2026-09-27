// Display sleep timeout from the active Windows power plan. When the user has been idle longer than this,
// the screen is off, so nothing after that point is screen time.
import { execFile } from 'child_process'
import { powerMonitor } from 'electron'

let acSec = 0
let dcSec = 0
let lastRefresh = 0
const REFRESH_MS = 30 * 60_000

function readPowercfg(): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      'powercfg.exe',
      ['/q', 'SCHEME_CURRENT', 'SUB_VIDEO', 'VIDEOIDLE'],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (!err) {
          const s = String(stdout)
          const ac = /AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(s)
          const dc = /DC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(s)
          if (ac) acSec = parseInt(ac[1], 16)
          if (dc) dcSec = parseInt(dc[1], 16)
        }
        lastRefresh = Date.now()
        resolve()
      }
    )
  })
}

/** Refreshes the cached timeouts if stale (cheap to call every tick). */
export function refreshDisplayTimeout(force = false): void {
  if (force || Date.now() - lastRefresh > REFRESH_MS) {
    lastRefresh = Date.now()
    void readPowercfg()
  }
}

/** Seconds of inactivity before the display turns off on the current power source, or 0 when "never". */
export function displayTimeoutSec(): number {
  let onBattery = false
  try {
    onBattery = powerMonitor.isOnBatteryPower()
  } catch {
    /* before ready */
  }
  return onBattery ? dcSec : acSec
}

export function displayTimeoutInfo(): { acSec: number; dcSec: number; onBattery: boolean } {
  let onBattery = false
  try {
    onBattery = powerMonitor.isOnBatteryPower()
  } catch {
    /* ignore */
  }
  return { acSec, dcSec, onBattery }
}
