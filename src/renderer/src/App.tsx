import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppWindow, BarChart3, Clock, Hourglass, LayoutDashboard, RotateCw, Settings as SettingsIcon, Target, Flame, X } from 'lucide-react'
import type { Appearance, Page as PageId, Settings as SettingsT, TrackerStatus } from '../../shared/types'
import { applyAppearance } from '@/lib/theme'
import { Onboarding } from '@/components/Onboarding'
import { useEvent } from '@/lib/hooks'
import { fmtDuration } from '@/lib/format'
import { STATIC } from '@/lib/motion'
import { Dot } from '@/components/ui'
import { Overview } from '@/pages/Overview'
import { Timeline } from '@/pages/Timeline'
import { Applications } from '@/pages/Applications'
import { Focus } from '@/pages/Focus'
import { Limits } from '@/pages/Limits'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'
import { Streaks } from '@/pages/Streaks'
import logo from '../../../resources/logo.png'
import { setDayStartHour } from '@/lib/format'

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'apps', label: 'Applications', icon: AppWindow },
  { id: 'focus', label: 'Focus', icon: Target },
  { id: 'limits', label: 'Limits', icon: Hourglass },
  { id: 'streaks', label: 'Streaks', icon: Flame },
  { id: 'reports', label: 'Reports', icon: BarChart3 }
]
/** Rendered on its own at the bottom of the sidebar. */
const SETTINGS_NAV = { id: 'settings' as PageId, label: 'Settings', icon: SettingsIcon }

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageId>(() => (new URLSearchParams(window.location.search).get('page') as PageId | null) ?? 'overview')
  const [status, setStatus] = useState<TrackerStatus | null>(null)
  const [settings, setSettings] = useState<SettingsT | null>(null)
  /** A setting that only applies after a restart was changed; offer one until dismissed. */
  const [restartNeeded, setRestartNeeded] = useState(false)

  useEffect(() => {
    void window.api.trackerStatus().then(setStatus)
    void window.api.getSettings().then((s) => {
      setDayStartHour(s.dayStartHour)
      setSettings(s)
    })
  }, [])
  useEvent<TrackerStatus>('tracker:status', setStatus)
  useEvent<PageId>('navigate', (p) => setPage(p))
  useEvent<{ dark: boolean; appearance?: Appearance }>('theme:changed', ({ dark, appearance }) => {
    if (appearance) applyAppearance(appearance, dark)
    else {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
    }
  })

  const state = !status
    ? { color: 'var(--muted)', text: 'Connecting', live: false }
    : status.paused
      ? { color: 'var(--muted)', text: status.pausedUntil ? 'Paused (break)' : 'Paused', live: false }
      : status.locked
        ? { color: 'var(--muted)', text: 'Locked', live: false }
        : status.screenOff
          ? { color: 'var(--muted)', text: 'Screen off', live: false }
          : status.media
            ? { color: 'var(--success)', text: 'Media', live: true }
            : status.call
              ? { color: 'var(--success)', text: 'In a call', live: true }
              : status.passive
                ? { color: 'var(--accent-2)', text: 'Passive', live: false }
                : status.idle
                  ? { color: 'var(--warning)', text: 'Idle', live: false }
                  : { color: 'var(--success)', text: 'Tracking', live: true }

  return (
    <div className="h-full flex flex-col relative">
      {settings && (!settings.onboardingDone || new URLSearchParams(window.location.search).has('onboarding')) && (
        <Onboarding
          settings={settings}
          onDone={(s) => {
            setDayStartHour(s.dayStartHour)
            setSettings(s)
          }}
        />
      )}
      {/* title bar: draggable, leaves room for the native window controls on the right */}
      {/* Height and width come from the Windows controls overlay itself, so the bar always matches the native buttons. */}
      <header
        className="topbar drag-region shrink-0 flex items-center justify-between pl-5 pr-4 border-b border-border"
        style={{ height: 'env(titlebar-area-height, 47px)', width: 'env(titlebar-area-width, 100%)' }}
      >
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" className="w-[18px] h-[18px] select-none" draggable={false} />
          <span className="text-[12px] font-semibold tracking-[0.14em] text-secondary">DESKTIME</span>
        </div>
        <div className="no-drag flex items-center gap-2 text-[12.5px] text-secondary">
          <Dot color={state.color} size={7} live={state.live} />
          <span>{state.text}</span>
          {status && status.tracking && <span className="text-muted num">· {fmtDuration(status.todayScreenMs)} today</span>}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <nav className="sidebar w-[204px] shrink-0 border-r border-border py-4 px-3 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavButton key={n.id} item={n} on={page === n.id} onClick={() => setPage(n.id)} />
          ))}
          <div className="mt-auto flex flex-col gap-3">
            <NavButton item={SETTINGS_NAV} on={page === 'settings'} onClick={() => setPage('settings')} />
            <div className="px-3 text-[11px] text-muted leading-relaxed">Local only. Nothing leaves this PC.</div>
          </div>
        </nav>

        <main className="flex-1 min-w-0 overflow-y-auto pt-4">
          <AnimatePresence mode="wait" initial={false}>
            {page === 'overview' && (
              <Overview key="overview" status={status} onOpenApps={() => setPage('apps')} onOpenTimeline={() => setPage('timeline')} />
            )}
            {page === 'timeline' && <Timeline key="timeline" onOpenApps={() => setPage('apps')} />}
            {page === 'apps' && <Applications key="apps" />}
            {page === 'focus' && <Focus key="focus" />}
            {page === 'limits' && <Limits key="limits" />}
            {page === 'streaks' && <Streaks key="streaks" />}
            {page === 'reports' && <Reports key="reports" />}
            {page === 'settings' && <Settings key="settings" status={status} onRestartNeeded={() => setRestartNeeded(true)} />}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {restartNeeded && (
          <motion.div
            key="restart"
            role="status"
            initial={STATIC ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={STATIC ? undefined : { opacity: 0, y: 12, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="card fixed right-5 bottom-5 z-40 flex items-center gap-3 pl-4 pr-2 py-2.5 shadow-xl"
          >
            <RotateCw size={15} className="text-accent shrink-0" />
            <div className="text-[13px]">
              <div className="font-medium">Restart to apply</div>
              <div className="text-secondary text-[12px]">This change takes effect the next time DeskTime starts.</div>
            </div>
            <button className="btn btn-accent !py-1.5 !px-3 text-[12.5px] ml-1" onClick={() => window.api.relaunch()}>
              Restart now
            </button>
            <button className="btn btn-ghost !p-1.5" onClick={() => setRestartNeeded(false)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const activeStyle = {
  background: 'rgba(var(--accent-rgb), 0.12)',
  boxShadow: '0 0 0 1px rgba(var(--accent-rgb), 0.18)'
}

/** One sidebar entry. The active pill is shared across all entries, so it slides between them. */
function NavButton({ item, on, onClick }: { item: { id: PageId; label: string; icon: typeof LayoutDashboard }; on: boolean; onClick: () => void }): JSX.Element {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left transition-colors ${
        on ? 'text-primary' : 'text-secondary hover:text-primary hover:bg-[var(--control)]'
      }`}
    >
      {on &&
        (STATIC ? (
          <span className="absolute inset-0 rounded-xl nav-active" style={activeStyle} />
        ) : (
          <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl" style={activeStyle} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
        ))}
      <Icon size={16} strokeWidth={1.75} className={`relative ${on ? 'text-accent' : ''}`} />
      <span className="relative">{item.label}</span>
    </button>
  )
}
