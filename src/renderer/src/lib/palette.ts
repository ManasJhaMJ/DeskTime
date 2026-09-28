// Categorical palette lives in CSS variables (see index.css) with separate light and dark steps, both
// validated with the dataviz validator on their card surfaces. Order is the CVD-safety mechanism;
// never cycle or generate hues past slot 8.
export const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--series-${i})`)
export const NEUTRAL = 'var(--neutral)'
export const IDLE = 'var(--idle)'
export const ACCENT = 'var(--accent)'

// Color follows the entity: once an app receives a slot it keeps it for the life of the window,
// so filtering or re-ranking never repaints survivors.
const slots = new Map<number, number>()
let next = 0

export function colorForApp(appId: number): string {
  let s = slots.get(appId)
  if (s === undefined) {
    s = next++
    slots.set(appId, s)
  }
  return s < SERIES.length ? SERIES[s] : NEUTRAL
}

/** Pre-assign slots in a deliberate order (e.g. by today's usage) before any rendering. */
export function assignSlots(appIds: number[]): void {
  for (const id of appIds) colorForApp(id)
}

/** Resolves a token like `var(--accent)` to its current hex for consumers that cannot take CSS variables (SVG attributes). */
export function resolveColor(token: string): string {
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(token.trim())
  if (!m) return token
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || token
}

/** Hex colors offered for user-created categories, validated in both modes. Stored as hex in the database. */
/** Category palette: two rows of nine, mid-saturation so every color reads on both light and dark card surfaces. */
export const CATEGORY_COLORS = [
  '#5b5bd6', '#2a78d6', '#1baf7a', '#eb6834', '#e87ba4', '#c98500', '#008300', '#e34948', '#9aa3b2',
  // Second row: cyan, olive, yellow, magenta, brown, maroon, lavender, navy, tan. Each sits between two first-row
  // hues or differs clearly in lightness, so no swatch has a near twin.
  '#0891b2', '#6b8e23', '#facc15', '#c026d3', '#8b5a2b', '#8b1e3f', '#a78bfa', '#1e3a8a', '#c8a27a'
]
