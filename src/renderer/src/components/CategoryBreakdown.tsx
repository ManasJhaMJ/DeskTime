import type { CategoryUsage } from '../../../shared/types'
import { fmtDuration, pct } from '@/lib/format'
import { Card, Dot, Empty } from '@/components/ui'

/** Active time split by category: a proportional strip and a ranked list. Used for a day on the Timeline and a month in Reports. */
export function CategoryBreakdown({
  cats,
  title = 'By category',
  hint,
  className
}: {
  cats: CategoryUsage[]
  title?: string
  /** Shown under the empty state. */
  hint?: string
  className?: string
}): JSX.Element {
  const total = cats.reduce((s, c) => s + c.activeMs, 0)
  return (
    <Card title={title} className={className}>
      {total < 60_000 ? (
        <Empty title="No active time recorded" hint={hint} />
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] bg-[var(--card-2)]">
            {cats.map((c) => (
              <div key={c.id} style={{ width: `${(c.activeMs / total) * 100}%`, background: c.color }} title={`${c.name} ${fmtDuration(c.activeMs)}`} />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[13px]">
                <Dot color={c.color} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="num text-muted text-[11.5px] whitespace-nowrap">
                  {c.apps} app{c.apps === 1 ? '' : 's'}
                </span>
                <span className="num text-secondary w-[60px] text-right">{fmtDuration(c.activeMs)}</span>
                <span className="num text-muted text-[11.5px] w-9 text-right">{pct(c.activeMs, total)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
