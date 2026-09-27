import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventChannel } from '../../../shared/types'

/**
 * Fetches data and refreshes it on an interval while the window is visible.
 * Also re-fetches when any of the given IPC events fire.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  intervalMs = 5000,
  events: EventChannel[] = ['data:changed']
): { data: T | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refresh = useCallback(() => {
    fetcherRef
      .current()
      .then((d) => {
        if (alive.current) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((err) => console.error(err))
  }, [])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    refresh()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = (): void => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh()
      }, intervalMs)
    }
    const onVis = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    const offs = events.map((e) => window.api.on(e, refresh))
    return () => {
      alive.current = false
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      offs.forEach((off) => off())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, refresh])

  return { data, loading, refresh }
}

export function useEvent<T = unknown>(channel: EventChannel, cb: (payload: T) => void): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => window.api.on(channel, (p) => ref.current(p as T)), [channel])
}

/** Resolves CSS color tokens to hex for SVG consumers, re-resolving when the theme flips. */
export function useThemeColors(): (token: string) => string {
  const [, bump] = useState(0)
  useEvent('theme:changed', () => setTimeout(() => bump((n) => n + 1), 50))
  return (token: string) => {
    const m = /^var\((--[a-z0-9-]+)\)$/i.exec(token.trim())
    if (!m) return token
    return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || token
  }
}

/** Ticks every second; handy for live countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
