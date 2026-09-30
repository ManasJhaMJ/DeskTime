import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, fmtDay, today } from '@/lib/format'
import { Tooltip } from './ui'

export function DayNav({ day, onChange }: { day: string; onChange: (d: string) => void }): JSX.Element {
  const isToday = day === today()
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => onChange(addDays(day, -1))} aria-label="Previous day">
        <ChevronLeft size={16} />
      </button>
      <Tooltip text="Jump to today">
        <button className="min-w-[128px] text-center text-[13px] px-2 py-1.5 rounded-md hover:bg-card-2" onClick={() => onChange(today())}>
          {fmtDay(day)}
        </button>
      </Tooltip>
      <button
        className="btn btn-ghost !px-2 !py-1.5"
        onClick={() => onChange(addDays(day, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
