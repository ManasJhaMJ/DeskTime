import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Eye, EyeOff, Laptop, Lock, Sunrise } from 'lucide-react'
import type { Settings } from '../../../shared/types'
import { DAY_START_OPTIONS } from '../../../shared/types'
import { STATIC } from '@/lib/motion'
import { ACCENT_PRESETS, applyAppearance } from '@/lib/theme'
import { Segmented, Toggle } from './ui'
import logo from '../../../../resources/logo.png'

/** First-run screen: says exactly what is and is not recorded, and takes two decisions up front. */
export function Onboarding({ settings, onDone }: { settings: Settings; onDone: (s: Settings) => void }): JSX.Element {
  const [launch, setLaunch] = useState(settings.launchAtStartup)
  const [dayStart, setDayStart] = useState(settings.dayStartHour)
  const [theme, setTheme] = useState(settings.theme)
  const [accent, setAccent] = useState(settings.appearance.accent)
  const systemDark = document.documentElement.classList.contains('dark')

  const preview = (t: Settings['theme'], ac: string): void => {
    const dark = t === 'system' ? systemDark : t === 'dark'
    applyAppearance({ ...settings.appearance, accent: ac }, dark)
  }

  const finish = async (): Promise<void> => {
    const next = {
      ...settings,
      launchAtStartup: launch,
      dayStartHour: dayStart,
      theme,
      appearance: { ...settings.appearance, accent },
      onboardingDone: true
    }
    onDone(await window.api.setSettings(next))
  }

  const Wrapper = STATIC ? 'div' : motion.div
  return (
    <div className="absolute inset-0 z-50 grid place-items-center backdrop-blur-sm" style={{ background: 'var(--overlay)' }}>
      <Wrapper
        {...(STATIC ? {} : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.35 } })}
        className="card w-[560px] p-8"
      >
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="w-10 h-10 select-none" draggable={false} />
          <div>
            <div className="text-[20px] font-semibold tracking-tight">Welcome to ScreenWise</div>
            <div className="text-secondary text-[13px]">How you actually spend your time on this PC, kept on this PC.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-7">
          <div>
            <div className="label mb-2 flex items-center gap-1.5">
              <Eye size={12} /> Recorded
            </div>
            <ul className="text-[13px] flex flex-col gap-1.5">
              {['Which app is in front, and for how long', 'Whether you are active, reading, idle or watching', 'Focus sessions and limits you set', 'App names and icons'].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check size={14} className="text-success shrink-0 mt-0.5" /> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label mb-2 flex items-center gap-1.5">
              <EyeOff size={12} /> Never recorded
            </div>
            <ul className="text-[13px] flex flex-col gap-1.5 text-secondary">
              {['Keystrokes or clipboard', 'Screen content or screenshots', 'Websites, files or window titles', 'Anything sent anywhere: no account, no cloud'].map((t) => (
                <li key={t} className="flex gap-2">
                  <Lock size={14} className="shrink-0 mt-0.5" /> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-[13.5px]">Look</div>
            <div className="text-[12px] text-secondary">Pick a mode and an accent. More options live in Settings.</div>
          </div>
          <div className="flex items-center gap-3">
            <Segmented
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              value={theme}
              onChange={(v) => {
                setTheme(v)
                preview(v, accent)
              }}
            />
            <div className="flex items-center gap-1.5">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={p.name}
                  onClick={() => {
                    setAccent(p.id)
                    preview(theme, p.id)
                  }}
                  className="w-4 h-4 rounded-full"
                  style={{
                    background: document.documentElement.classList.contains('dark') ? p.dark : p.light,
                    outline: accent === p.id ? '2px solid var(--primary)' : '2px solid transparent',
                    outlineOffset: 2
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border divide-y divide-border">
          <div className="flex items-center justify-between gap-4 p-3.5">
            <div className="flex items-start gap-2.5">
              <Laptop size={16} className="text-secondary mt-0.5" />
              <div>
                <div className="text-[13.5px]">Start with Windows</div>
                <div className="text-[12px] text-secondary">Runs quietly in the tray so no day is missed.</div>
              </div>
            </div>
            <Toggle checked={launch} onChange={setLaunch} />
          </div>
          <div className="flex items-center justify-between gap-4 p-3.5">
            <div className="flex items-start gap-2.5">
              <Sunrise size={16} className="text-secondary mt-0.5" />
              <div>
                <div className="text-[13.5px]">When does your day start?</div>
                <div className="text-[12px] text-secondary">Anything before this hour counts toward the previous day. Night owls pick 4 AM or later.</div>
              </div>
            </div>
            <Segmented options={DAY_START_OPTIONS} value={dayStart} onChange={setDayStart} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-[12px] text-muted">You can change all of this in Settings.</span>
          <button className="btn btn-accent" onClick={finish}>
            Start tracking
          </button>
        </div>
      </Wrapper>
    </div>
  )
}
