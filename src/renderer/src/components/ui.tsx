import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { colorForApp } from '@/lib/palette'
import { STATIC, pageVariants, riseVariants } from '@/lib/motion'

export function Card({
  title,
  right,
  children,
  className = '',
  padded = true
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}): JSX.Element {
  const inner = (
    <>
      {(title || right) && (
        <header className={`flex items-center justify-between ${padded ? 'mb-4' : 'px-5 pt-5 mb-3'}`}>
          {title ? <h3 className="label">{title}</h3> : <span />}
          {right}
        </header>
      )}
      {children}
    </>
  )
  const cls = `card ${padded ? 'p-5' : 'overflow-hidden'} ${className}`
  if (STATIC) return <section className={cls}>{inner}</section>
  return (
    <motion.section variants={riseVariants} className={cls}>
      {inner}
    </motion.section>
  )
}

/** Eases a number toward its target; used for the hero figure and stat tiles. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(STATIC ? target : 0)
  const current = useRef(STATIC ? target : 0)
  useEffect(() => {
    if (STATIC) {
      setValue(target)
      return
    }
    const start = performance.now()
    const begin = current.current
    let raf = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = begin + (target - begin) * eased
      current.current = v
      setValue(v)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }): JSX.Element {
  const v = useCountUp(value)
  return <>{format(v)}</>
}

export function StatTile({
  label,
  value,
  ms,
  format,
  sub,
  subTone = 'muted'
}: {
  label: string
  /** Preformatted value; ignored when `ms` is given. */
  value?: string
  /** Numeric value that counts up; formatted with `format`. */
  ms?: number
  format?: (n: number) => string
  sub?: string
  subTone?: 'muted' | 'good' | 'bad' | 'accent'
}): JSX.Element {
  const tone = {
    muted: 'text-secondary',
    good: 'text-success',
    bad: 'text-warning',
    accent: 'text-accent-2'
  }[subTone]
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="num mt-3 text-[28px] leading-none font-semibold tracking-tight">
        {ms !== undefined && format ? <CountUp value={ms} format={format} /> : (value ?? '—')}
      </div>
      {sub && <div className={`mt-3 text-[12.5px] ${tone}`}>{sub}</div>}
    </>
  )
  if (STATIC) return <div className="card p-5 min-w-0">{body}</div>
  return (
    <motion.div variants={riseVariants} className="card p-5 min-w-0">
      {body}
    </motion.div>
  )
}

/** Meter: fill carries severity, track is a lighter step of the same ramp. */
export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'accent' | 'warning' | 'danger' }): JSX.Element {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const t = tone ?? (ratio >= 1 ? 'danger' : ratio >= 0.85 ? 'warning' : 'accent')
  const fill = { accent: 'var(--accent)', warning: 'var(--warning)', danger: 'var(--danger)' }[t]
  const track = { accent: 'rgba(var(--accent-rgb), 0.16)', warning: 'rgba(183,121,31,0.18)', danger: 'rgba(214,69,80,0.18)' }[t]
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: track }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: fill }}
        initial={false}
        animate={{ width: `${ratio * 100}%` }}
        transition={STATIC ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  )
}

/** Circular progress used by the focus timer. */
export function Ring({
  progress,
  size = 260,
  stroke = 8,
  children
}: {
  progress: number
  size?: number
  stroke?: number
  children?: ReactNode
}): JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: 'var(--card-2)' }} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          style={{ stroke: 'var(--accent)' }}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={STATIC ? { duration: 0 } : { duration: 0.9, ease: 'linear' }}
        />
      </svg>
      <div className="relative z-10 text-center">{children}</div>
    </div>
  )
}

export function AppIcon({
  icon,
  name,
  appId,
  size = 28
}: {
  icon: string | null
  name: string
  appId?: number
  size?: number
}): JSX.Element {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="rounded-md shrink-0"
        style={{ width: size, height: size, imageRendering: 'auto' }}
      />
    )
  }
  const bg = appId !== undefined ? colorForApp(appId) : 'var(--neutral)'
  return (
    <div
      className="rounded-md shrink-0 grid place-items-center font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function Dot({ color, size = 8, live = false }: { color: string; size?: number; live?: boolean }): JSX.Element {
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${live && !STATIC ? 'dot-live' : ''}`}
      style={{ width: size, height: size, background: color, color }}
    />
  )
}

export function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // A fixed 40x22 box that never shrinks inside flex rows; the knob moves by transform, so it always stays on the track.
      className="inline-flex shrink-0 items-center w-10 min-w-10 h-[22px] p-0 border-0 rounded-full transition-colors duration-200 disabled:opacity-50"
      style={{ background: checked ? 'var(--accent)' : 'var(--border-2)' }}
    >
      <span
        className="block w-4 h-4 rounded-full bg-white shadow"
        style={{
          transform: `translateX(${checked ? 21 : 3}px)`,
          transition: STATIC ? 'none' : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="inline-flex p-1 rounded-xl border border-border gap-0.5" style={{ background: 'var(--control)' }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative px-3 py-1.5 rounded-lg text-[13px] transition-colors ${on ? 'text-primary' : 'text-secondary hover:text-primary'}`}
          >
            {on && (
              <span
                className="absolute inset-0 rounded-lg"
                style={{ background: 'var(--card)', boxShadow: '0 1px 2px rgba(15,23,42,0.08), 0 0 0 1px var(--border)' }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="text-[12.5px] text-secondary mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }): JSX.Element {
  return (
    <div className="py-10 text-center">
      <div className="text-secondary">{title}</div>
      {hint && <div className="text-muted text-[12.5px] mt-1">{hint}</div>}
    </div>
  )
}

export function Page({ children }: { children: ReactNode }): JSX.Element {
  const cls = 'max-w-[1100px] mx-auto px-8 pb-10'
  if (STATIC) return <div className={cls}>{children}</div>
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" exit="exit" className={cls}>
      {children}
    </motion.div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }): JSX.Element {
  return (
    <div className="flex items-end justify-between mb-6 pt-2">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-secondary mt-1 text-[13px]">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}
