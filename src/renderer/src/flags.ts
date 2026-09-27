import { appearanceFromParams, applyAppearance } from './lib/theme'
import { DEFAULT_APPEARANCE } from '../../shared/types'
// Must be imported before anything that reads document classes (see lib/motion.ts).
// Flags passed by the main process so the first paint is already correct:
//   material=1  window sits on Mica/Acrylic, make the body translucent
//   gpu=1       hardware acceleration is on, real backdrop blur is affordable
//   static=1    offscreen capture, no animations
const params = new URLSearchParams(window.location.search)
for (const flag of ['material', 'gpu', 'static', 'popup']) {
  if (params.has(flag)) document.documentElement.classList.add(flag)
}
// dark=1 and the appearance params come from the main process so the first paint is already right.
applyAppearance(appearanceFromParams(params) ?? DEFAULT_APPEARANCE, params.get('dark') === '1')

// Pause animations while the window is not focused (see index.css html.blurred).
const setBlur = (b: boolean): void => {
  document.documentElement.classList.toggle('blurred', b)
}
window.addEventListener('blur', () => setBlur(true))
window.addEventListener('focus', () => setBlur(false))
if (!document.hasFocus()) setBlur(true)

// Forward renderer crashes to the main-process log (message and stack only).
window.addEventListener('error', (e) => void window.api?.reportError(`${e.message}
${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) =>
  void window.api?.reportError(`unhandledrejection: ${e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)}`)
)

// Capture mode only: offset the main column so a lower part of a page is in the first (and only) paint.
if (params.has('shift')) {
  const style = document.createElement('style')
  style.textContent = `main { overflow: visible !important; margin-top: -${Number(params.get('shift'))}px; }`
  document.head.appendChild(style)
}
export {}
