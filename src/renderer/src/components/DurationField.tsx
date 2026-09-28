import { useEffect, useState } from 'react'
import { DURATION_HINT, fmtMinutes, parseDuration } from '@/lib/duration'

/**
 * Text field for a duration ("45m", "1h 30m", "1:30"). Commits on blur or Enter; with `live` it also commits every
 * valid keystroke (for forms whose state is local). Invalid text is outlined and never committed.
 */
export function DurationField({
  minutes,
  onCommit,
  live = false,
  max = 24 * 60,
  className = '',
  label = 'Duration'
}: {
  minutes: number
  onCommit: (m: number) => void
  live?: boolean
  max?: number
  className?: string
  label?: string
}): JSX.Element {
  const [text, setText] = useState(fmtMinutes(minutes))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmtMinutes(minutes))
  }, [minutes, focused])
  const parsed = parseDuration(text, max)
  const commit = (): void => {
    if (parsed !== null && parsed !== minutes) onCommit(parsed)
    setText(fmtMinutes(parsed ?? minutes))
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      aria-invalid={parsed === null}
      title={DURATION_HINT}
      className={className}
      style={parsed === null ? { borderColor: 'var(--danger)' } : undefined}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value)
        if (live) {
          const p = parseDuration(e.target.value, max)
          if (p !== null) onCommit(p)
        }
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
