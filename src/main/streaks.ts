// Streak evaluation: pure functions over per-day values, so they are easy to reason about and test.
import type { Streak, StreakDay, StreakKind, StreakStatus } from '../shared/types'
import { FREEZES_PER_MONTH } from '../shared/types'
import { addDays } from './db'

/** "Under" goals pass when the value stays at or below the target; "at least" goals pass once it reaches it. */
export function isUnderKind(kind: StreakKind): boolean {
  return kind === 'screenUnder' || kind === 'categoryUnder' || kind === 'appUnder'
}

/**
 * Turns a per-day value map into the streak's status.
 * - Days before the first recorded day are ignored, so a fresh install does not start with a 300-day "under" streak.
 * - A day with no data counts as 0: fine for "under" goals (the PC was not used), a miss for "at least" goals.
 * - A frozen day counts as a hit whatever happened; freezes are limited per calendar month.
 * - Today is pending for "under" goals until it is over (it can already be failed), and done for "at least" goals
 *   as soon as the target is reached.
 */
export function evaluateStreak(
  streak: Streak,
  minutesByDay: Map<string, number>,
  frozen: Set<string>,
  firstDay: string | null,
  fromDay: string,
  today: string
): StreakStatus {
  const under = isUnderKind(streak.kind)
  const start = firstDay && firstDay > fromDay ? firstDay : fromDay
  const days: StreakDay[] = []
  let best = 0
  let run = 0
  let current = 0
  let todayState: StreakStatus['todayState'] = 'pending'

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const value = Math.round(minutesByDay.get(d) ?? 0)
    const passes = under ? value <= streak.target : value >= streak.target
    if (d === today) {
      if (under) {
        todayState = passes ? 'pending' : 'failed'
        days.push({ day: d, value, ok: passes ? null : false })
      } else {
        todayState = passes ? 'done' : 'pending'
        days.push({ day: d, value, ok: passes ? true : null })
      }
      continue
    }
    const isFrozen = !passes && frozen.has(d)
    const ok = passes || isFrozen
    days.push({ day: d, value, ok, ...(isFrozen ? { frozen: true } : {}) })
    run = ok ? run + 1 : 0
    best = Math.max(best, run)
  }
  // Current streak: the run ending yesterday, extended by today when today already counts.
  current = run
  if (todayState === 'done') current += 1
  if (todayState === 'failed') current = 0
  best = Math.max(best, current)

  const month = today.slice(0, 7)
  let used = 0
  for (const d of frozen) if (d.startsWith(month)) used++
  return { ...streak, current, best, todayState, days, freezesLeft: Math.max(0, FREEZES_PER_MONTH - used) }
}

/** Minutes left to reach an "at least" goal, or minutes left before an "under" goal breaks. */
export function minutesToGo(streak: Streak, todayMinutes: number): number {
  return isUnderKind(streak.kind) ? streak.target - todayMinutes : streak.target - todayMinutes
}

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`
}

/** Human name for a streak, mirrored from the renderer so notifications read the same. */
export function describeStreak(s: Streak): string {
  const t = fmtMinutes(s.target)
  const ref = s.refName ?? '?'
  switch (s.kind) {
    case 'screenUnder':
      return `Screen time under ${t}`
    case 'activeAtLeast':
      return `At least ${t} active`
    case 'categoryAtLeast':
      return `At least ${t} of ${ref}`
    case 'categoryUnder':
      return `${ref} under ${t}`
    case 'appUnder':
      return `${ref} under ${t}`
    case 'focusAtLeast':
      return `${t} of focus a day`
  }
}
