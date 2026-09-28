import { useEffect, useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import { hexToHsl, hslToHex } from '@/lib/theme'

/**
 * Small in-app color picker: hue, saturation and lightness sliders, a hex field and a pipette that samples any pixel
 * inside this window (the main process captures the page, so nothing outside the app is ever read).
 */
export function ColorPicker({ value, onChange, onClose }: { value: string; onChange: (hex: string) => void; onClose: () => void }): JSX.Element {
  const initial = hexToHsl(value) ?? [0.02, 0.7, 0.55]
  const [h, setH] = useState(initial[0])
  const [s, setS] = useState(initial[1])
  const [l, setL] = useState(initial[2])
  const [hex, setHex] = useState(value.toLowerCase())
  const [picking, setPicking] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const lastSample = useRef(0)

  useEffect(() => {
    const away = (e: MouseEvent): void => {
      if (picking) return
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose, picking])

  const apply = (nh: number, ns: number, nl: number): void => {
    setH(nh)
    setS(ns)
    setL(nl)
    const next = hslToHex(nh, ns, nl)
    setHex(next)
    onChange(next)
  }
  const applyHex = (text: string): void => {
    setHex(text)
    const hsl = hexToHsl(text)
    if (hsl) {
      setH(hsl[0])
      setS(hsl[1])
      setL(hsl[2])
      onChange(text.startsWith('#') ? text.toLowerCase() : `#${text.toLowerCase()}`)
    }
  }
  // Pipette: a full-window overlay follows the pointer, sampling the page under it about 12 times a second.
  const sample = async (e: React.MouseEvent): Promise<void> => {
    const now = performance.now()
    if (now - lastSample.current < 80) return
    lastSample.current = now
    const hex = await window.api.sampleColor(e.clientX, e.clientY)
    if (hex) setPreview(hex)
  }
  const finishPick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    const hex = (await window.api.sampleColor(e.clientX, e.clientY)) ?? preview
    setPicking(false)
    setPreview(null)
    if (hex) applyHex(hex)
  }
  useEffect(() => {
    if (!picking) return
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPicking(false)
        setPreview(null)
      }
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [picking])

  const hueBg = 'linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))'
  const satBg = `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 1, l)})`
  const litBg = `linear-gradient(to right, #000, ${hslToHex(h, s, 0.5)}, #fff)`
  const slider = (label: string, val: number, bg: string, set: (v: number) => void): JSX.Element => (
    <label className="grid grid-cols-[64px_1fr] items-center gap-3 text-[12.5px] text-secondary">
      {label}
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(val * 1000)}
        onChange={(e) => set(Number(e.target.value) / 1000)}
        className="color-slider"
        style={{ background: bg }}
        aria-label={label}
      />
    </label>
  )

  return (
    <div ref={box} className="card p-4 w-[300px] shadow-xl flex flex-col gap-3" role="dialog" aria-label="Custom accent color">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full border border-border shrink-0" style={{ background: hslToHex(h, s, l) }} />
        <input
          type="text"
          value={hex}
          onChange={(e) => applyHex(e.target.value)}
          spellCheck={false}
          maxLength={7}
          className="flex-1 !py-1.5 num"
          style={hexToHsl(hex) ? undefined : { borderColor: 'var(--danger)' }}
          aria-label="Hex color"
        />
        <button
          type="button"
          className={`btn !p-2 ${picking ? 'btn-accent' : ''}`}
          onClick={() => setPicking(true)}
          title="Pick a color from anywhere in this window"
          aria-label="Pick from the app"
          aria-pressed={picking}
        >
          <Pipette size={15} />
        </button>
      </div>
      {slider('Hue', h, hueBg, (v) => apply(v, s, l))}
      {slider('Saturation', s, satBg, (v) => apply(h, v, l))}
      {slider('Lightness', l, litBg, (v) => apply(h, s, v))}
      <div className="text-[11.5px] text-muted">
        {picking ? 'Click anywhere in the app to take that color. Escape or right-click cancels.' : 'The pipette samples pixels inside this window. Colors are adjusted per mode so they stay readable.'}
      </div>
      {picking && (
        <div
          className="fixed inset-0 z-[100]"
          style={{ cursor: 'crosshair' }}
          onMouseMove={(e) => void sample(e)}
          onClick={(e) => void finishPick(e)}
          onContextMenu={(e) => {
            e.preventDefault()
            setPicking(false)
            setPreview(null)
          }}
        >
          {preview && (
            <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 card px-3 py-1.5 text-[12px] flex items-center gap-2 shadow-xl">
              <span className="w-4 h-4 rounded-full border border-border" style={{ background: preview }} />
              <span className="num">{preview}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
