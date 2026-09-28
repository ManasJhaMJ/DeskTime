import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BotAvatar, botAvatarPalette } from 'bot-avatars'
import type { AvatarChoice, AvatarSleeps, TrackerStatus } from '../../../shared/types'
import { STATIC } from '@/lib/motion'

/** Live companions: no periodic idle jump, softer head turn. Never spread on picker thumbnails. */
export const CALM = { jumpEvery: 0, turn: 0.7 } as const

/** Accent for anything drawn around the avatar: the character's own palette color, the app accent otherwise. */
export function accentFor(avatar: AvatarChoice): string {
  return avatar === 'photo' || avatar === 'none' ? 'var(--accent)' : botAvatarPalette[avatar]
}

/** True for 1.8 s after any watched signal changes. */
function useBurst(signals: unknown[]): boolean {
  const [bursting, setBursting] = useState(false)
  const seen = useRef<unknown[] | null>(null)
  useEffect(() => {
    if (seen.current === null) {
      seen.current = signals
      return
    }
    const changed = signals.some((v, i) => v !== seen.current![i])
    seen.current = signals
    if (!changed) return
    setBursting(true)
    const settle = setTimeout(() => setBursting(false), 1800)
    return () => clearTimeout(settle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, signals)
  return bursting
}

function useHour(): number {
  const [hour, setHour] = useState(new Date().getHours())
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(t)
  }, [])
  return hour
}

/**
 * The Overview's companion: a bot (or the user's photo) on a card tinted with its own color. It hops when the
 * foreground app changes, rocks while media or a call keeps the day active, and dozes off by the clock or when idle.
 */
export function Companion({
  avatar,
  photo,
  sleeps,
  status,
  variant = 'card',
  children
}: {
  avatar: Exclude<AvatarChoice, 'none'>
  photo: string | null
  sleeps: AvatarSleeps
  status: TrackerStatus | null
  /** `bare` renders just the avatar (no tinted card), for sitting inline next to other content. */
  variant?: 'card' | 'bare'
  children?: ReactNode
}): JSX.Element {
  const appId = status?.currentApp?.id ?? 0
  const bursting = useBurst([appId, status?.paused ?? false])
  const hour = useHour()
  const asleep =
    sleeps === 'time' ? hour >= 23 || hour < 6 : sleeps === 'idle' ? !status || !status.tracking || status.idle : false
  const state = bursting ? 'working' : asleep ? 'sleeping' : 'default'
  const busy = !!status && status.tracking && (status.media || status.call)
  const [engaged, setEngaged] = useState(false)

  // One hop per app switch.
  const [hops, setHops] = useState(0)
  const lastApp = useRef(appId)
  useEffect(() => {
    if (lastApp.current !== appId) {
      lastApp.current = appId
      setHops((h) => h + 1)
    }
  }, [appId])

  const accent = accentFor(avatar)
  const isBot = avatar !== 'photo' || !photo
  const glow = `radial-gradient(70% 120% at 18% 50%, color-mix(in srgb, ${accent} ${isBot ? 26 : 18}%, transparent), transparent 70%)`
  const face = `${glow}, var(--card)`

  const idleMove = STATIC
    ? {}
    : !engaged
      ? { animate: { rotate: 0, x: 0, y: 0, scale: 1 }, transition: { duration: 0.4 } }
      : busy
        ? { animate: { rotate: [-2.5, 2.5, -2.5] }, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const } }
        : { animate: { y: [0, -3, 0], scale: [1, 1.02, 1] }, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const } }

  const box = (
      <div
        className="relative grid h-[128px] w-[128px] shrink-0 place-items-center"
        onMouseEnter={variant === 'bare' ? () => setEngaged(true) : undefined}
        onMouseLeave={variant === 'bare' ? () => setEngaged(false) : undefined}
      >
        <motion.div
          key={`shadow-${hops}`}
          aria-hidden
          className="absolute left-1/2 bottom-[6px] h-[12px] w-[74px] rounded-full pointer-events-none"
          style={{ x: '-50%', background: 'radial-gradient(closest-side, rgba(0,0,0,0.45), transparent)', filter: 'blur(2px)' }}
          initial={false}
          animate={STATIC ? undefined : { scaleX: [1, 0.72, 1.18, 1], opacity: [1, 0.45, 1, 1] }}
          transition={{ duration: 0.55, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
        />
        <div className="relative z-10 grid place-items-center">
          <motion.div {...idleMove}>
            <motion.div
              key={hops}
              initial={false}
              animate={STATIC ? undefined : { y: [0, -14, 0, 0], scaleY: [1, 1.08, 0.9, 1], scaleX: [1, 0.95, 1.08, 1] }}
              transition={{ duration: 0.55, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
            >
              {isBot ? (
                <BotAvatar type={avatar === 'photo' ? 'ghost' : avatar} size={112} state={state} paused={STATIC} {...CALM} />
              ) : (
                <img
                  src={photo!}
                  alt=""
                  draggable={false}
                  className="h-[92px] w-[92px] rounded-full object-cover select-none"
                  style={{ boxShadow: '0 0 0 1px var(--border-2)', filter: asleep ? 'grayscale(0.6) brightness(0.8)' : undefined }}
                />
              )}
            </motion.div>
          </motion.div>
        </div>
        <AnimatePresence>
          {asleep && (
            <motion.div
              key="zzz"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute right-2 top-2"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute font-bold leading-none"
                  style={{ color: accent, fontSize: 9 + i * 3, textShadow: `0 0 6px ${accent}` }}
                  initial={{ opacity: 0, x: 0, y: 0 }}
                  animate={STATIC ? { opacity: 1, x: 4 + i * 4, y: -5 - i * 5 } : { opacity: [0, 1, 1, 0], x: [0, 4, 8, 11], y: [0, -5, -11, -16] }}
                  transition={{ duration: 3, repeat: STATIC ? 0 : Infinity, delay: i, ease: 'easeOut' }}
                >
                  z
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
  )
  if (variant === 'bare') return box
  return (
    <div
      className="relative flex items-center gap-4 rounded-[24px] p-3.5 overflow-visible"
      style={{ background: face, boxShadow: 'inset 0 0 0 1px var(--border), var(--shadow)' }}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
    >
      {box}
      {children && <div className="min-w-0 flex-1">{children}</div>}
    </div>
  )
}
