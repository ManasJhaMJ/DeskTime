const pad = (n: number): string => String(n).padStart(2, '0')

/** Apps below this much screen time in a day are folded into an "Other" bucket in lists and the timeline. */
export const MINOR_APP_MS = 2 * 60_000

/** "6h 42m", "42m", "<1m" */
export function fmtDuration(ms: number, opts: { seconds?: boolean } = {}): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (opts.seconds && h === 0 && m < 10) return m ? `${m}m ${pad(s)}s` : `${s}s`
  if (h === 0 && m === 0) return totalSec > 0 ? '<1m' : '0m'
  if (h === 0) return `${m}m`
  return `${h}h ${pad(m)}m`
}

/** "42:18" countdown format */
export function fmtClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "10:24 AM" */
export function fmtTime(ts: number): string {
  const d = new Date(ts)
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${pad(d.getMinutes())} ${ampm}`
}

/** "8 PM" */
export function fmtHour(hour: number): string {
  const h = hour % 24
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function toDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n).getTime())
}

export const today = (): string => toDay(Date.now())

/** Monday of the week containing `day` */
export function weekStart(day: string): string {
  const d = new Date(dayStart(day))
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  return addDays(day, -dow)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekdayShort(day: string): string {
  return WEEKDAYS[new Date(dayStart(day)).getDay()]
}

/** "Today", "Yesterday", or "Mon, Sep 22" */
export function fmtDay(day: string): string {
  const t = today()
  if (day === t) return 'Today'
  if (day === addDays(t, -1)) return 'Yesterday'
  const d = new Date(dayStart(day))
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtDayShort(day: string): string {
  const d = new Date(dayStart(day))
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

/** Signed delta text: "↓ 34m vs yesterday" without arrows: "34m less than yesterday" */
export function deltaText(nowMs: number, prevMs: number, than = 'yesterday'): { text: string; dir: 'up' | 'down' | 'flat' } {
  const diff = nowMs - prevMs
  if (Math.abs(diff) < 60_000) return { text: `Same as ${than}`, dir: 'flat' }
  return diff > 0
    ? { text: `${fmtDuration(diff)} more than ${than}`, dir: 'up' }
    : { text: `${fmtDuration(-diff)} less than ${than}`, dir: 'down' }
}

/** "2026-09" for the month containing `day` */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "September 2026" */
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}
