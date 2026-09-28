/**
 * Reads a duration the way people type it: "20", "20m", "1h", "1h 30m", "1.5h", "1:30".
 * Returns whole minutes clamped to 1..maxMinutes, or null when the text is not a duration.
 */
export function parseDuration(text: string, maxMinutes = 12 * 60): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  let minutes: number | null = null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d+):([0-5]?\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2])
  else if ((m = t.match(/^(\d+(?:\.\d+)?) ?h(?:ours?|rs?)?(?: ?(\d+) ?m(?:in(?:ute)?s?)?)?$/))) minutes = Number(m[1]) * 60 + Number(m[2] ?? 0)
  else if ((m = t.match(/^(\d+(?:\.\d+)?) ?(?:m|min|mins|minutes?)?$/))) minutes = Number(m[1])
  if (minutes === null || !Number.isFinite(minutes)) return null
  return Math.min(maxMinutes, Math.max(1, Math.round(minutes)))
}

/** "20m", "1h", "1h 30m". */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

export const DURATION_HINT = 'Minutes (45), hours (1.5h, 1h 30m) or a clock length (1:30).'
