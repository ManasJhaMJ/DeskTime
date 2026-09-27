// Applies the user's appearance choices to the document: base family classes, accent variables,
// corner radius, motion level and font. Used at first paint (flags.ts) and live from Settings.
import type { Appearance } from '../../../shared/types'

export const ACCENT_PRESETS: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'coral', name: 'Coral', light: '#d9503f', dark: '#ff7a6b' },
  { id: 'cyan', name: 'Cyan', light: '#0e8fa3', dark: '#22b8cf' },
  { id: 'teal', name: 'Teal', light: '#1f8f72', dark: '#3dbf9b' },
  { id: 'amber', name: 'Amber', light: '#b7791f', dark: '#f2b544' },
  { id: 'indigo', name: 'Indigo', light: '#5b5bd6', dark: '#7b7bea' },
  { id: 'violet', name: 'Violet', light: '#7c3aed', dark: '#a78bfa' },
  { id: 'rose', name: 'Rose', light: '#c2255c', dark: '#f06595' },
  { id: 'blue', name: 'Blue', light: '#2a78d6', dark: '#4d9bf0' },
  { id: 'lime', name: 'Lime', light: '#5c8a00', dark: '#a3d63c' }
]

export const DARK_BASES: { id: Appearance['darkBase']; name: string; hint: string; swatch: string }[] = [
  { id: 'forest', name: 'Forest', hint: 'Deep green-gray, calm', swatch: '#0b1210' },
  { id: 'navy', name: 'Navy', hint: 'Cool blue-black', swatch: '#0a1220' },
  { id: 'graphite', name: 'Graphite', hint: 'Warm charcoal, cream text', swatch: '#121110' },
  { id: 'neutral', name: 'Neutral', hint: 'Pure gray, no tint', swatch: '#0e0e10' }
]

export const LIGHT_BASES: { id: Appearance['lightBase']; name: string; hint: string; swatch: string }[] = [
  { id: 'cool', name: 'Cool white', hint: 'Crisp, Windows-like', swatch: '#f5f6f9' },
  { id: 'paper', name: 'Warm paper', hint: 'Softer, cream tones', swatch: '#f7f4ee' },
  { id: 'mist', name: 'Mist', hint: 'Cool blue-gray tint', swatch: '#eaeff6' },
  { id: 'sage', name: 'Sage', hint: 'Soft green-gray, calm', swatch: '#edf3ee' }
]

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

function withLightness(hex: string, fn: (l: number) => number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [h, s, l] = rgbToHsl(...rgb)
  return rgbToHex(...hslToRgb(h, s, fn(l)))
}

/** Keeps a custom accent readable: not too light on white, not too dark on the dark surfaces. */
export function accentForMode(hex: string, dark: boolean): string {
  return withLightness(hex, (l) => (dark ? Math.max(l, 0.58) : Math.min(l, 0.46)))
}

export function resolveAccent(a: Appearance, dark: boolean): string {
  const preset = ACCENT_PRESETS.find((p) => p.id === a.accent)
  if (preset) return dark ? preset.dark : preset.light
  return accentForMode(a.accent, dark)
}

/** Writes classes and variables on <html>. `dark` decides which side of each pair is active. */
export function applyAppearance(a: Appearance, dark: boolean): void {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  for (const c of [...root.classList]) if (c.startsWith('base-') || c.startsWith('radius-') || c.startsWith('motion-') || c.startsWith('font-')) root.classList.remove(c)
  root.classList.add(`base-${dark ? a.darkBase : a.lightBase}`)
  root.classList.add(`radius-${a.radius}`)
  root.classList.add(`motion-${a.motion}`)
  root.classList.add(`font-${a.font}`)

  const accent = resolveAccent(a, dark)
  const hover = withLightness(accent, (l) => (dark ? Math.min(1, l + 0.08) : Math.max(0, l - 0.1)))
  const rgb = hexToRgb(accent)
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-2', hover)
  if (rgb) root.style.setProperty('--accent-rgb', rgb.join(', '))
}

/** Query-string form the main process passes so the first paint already matches. */
export function appearanceFromParams(p: URLSearchParams): Appearance | null {
  const darkBase = p.get('db') as Appearance['darkBase'] | null
  if (!darkBase) return null
  return {
    darkBase,
    lightBase: (p.get('lb') as Appearance['lightBase']) ?? 'cool',
    accent: p.get('ac') ?? 'coral',
    radius: (p.get('rd') as Appearance['radius']) ?? 'rounded',
    motion: (p.get('mo') as Appearance['motion']) ?? 'full',
    font: (p.get('ft') as Appearance['font']) ?? 'manrope'
  }
}
