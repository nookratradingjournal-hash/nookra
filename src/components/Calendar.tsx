import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Trade } from '../types'
import { fmtPnlCompact, fmtPnlFull, getCurrencySymbol } from '../utils/fmt'
import { useAppStore } from '../store/useAppStore'
import { localToday } from '../utils/dates'

interface CalendarProps {
  trades: Trade[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
  month: number
  year: number
  onPrevMonth: () => void
  onNextMonth: () => void
  currency: string
  showCount: boolean
  tileStyle: 'solid' | 'outlined' | 'muted'
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function Calendar({ trades, selectedDate, onSelectDate, month, year, onPrevMonth, onNextMonth, currency, showCount, tileStyle }: CalendarProps) {
  const timezone = useAppStore((s) => s.settings.timezone)
  const today = localToday(timezone)
  const sym = getCurrencySymbol(currency)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  const dayMap = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {}
    trades.forEach((t) => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 }
      map[t.date].pnl += t.result
      map[t.date].count++
    })
    return map
  }, [trades])

  const monthlyPnl = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const prefix = `${year}-${pad2(month + 1)}-`
    return trades.filter((t) => t.date.startsWith(prefix)).reduce((a, t) => a + t.result, 0)
  }, [trades, month, year])

  const hasMonthlyTrades = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const prefix = `${year}-${pad2(month + 1)}-`
    return trades.some((t) => t.date.startsWith(prefix))
  }, [trades, month, year])

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const ds = (d: number) => `${year}-${pad2(month + 1)}-${pad2(d)}`

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold text-white/60">{MONTHS[month]} {year}</span>
          {hasMonthlyTrades && (
            <span
              className={clsx(
                'text-sm font-semibold tabular-nums whitespace-nowrap',
                monthlyPnl > 0 ? 'text-emerald-400' : monthlyPnl < 0 ? 'text-red-400' : 'text-white/30'
              )}
              title={fmtPnlFull(monthlyPnl, sym)}
            >
              {fmtPnlCompact(monthlyPnl, sym)}
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          <button
            onClick={onPrevMonth}
            className="float-hover w-7 h-7 flex items-center justify-center rounded-md text-white/25 hover:text-white hover:bg-white/[0.10] hover:border-white/[0.14] border border-transparent"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={onNextMonth}
            className="float-hover w-7 h-7 flex items-center justify-center rounded-md text-white/25 hover:text-white hover:bg-white/[0.10] hover:border-white/[0.14] border border-transparent"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-white/15 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`e-${i}`} className="cal-cell-empty rounded-xl" />
          }

          const dateStr = ds(day)
          const data = dayMap[dateStr]
          const isSelected = selectedDate === dateStr
          const isHovered = hoveredDate === dateStr
          const isToday = dateStr === today
          const isWin = data && data.pnl > 0
          const isLoss = data && data.pnl < 0
          const isFuture = dateStr > today

          return (
            <button
              key={dateStr}
              data-date={dateStr}
              data-today={isToday ? 'true' : undefined}
              onClick={() => !isFuture && onSelectDate(dateStr)}
              onMouseEnter={() => !isFuture && setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
              disabled={isFuture && !data}
              className={clsx(
                'cal-cell rounded-xl flex flex-col p-3 text-left transition-all duration-150 relative cursor-pointer',
                // ── solid tile style ──────────────────────────────────────
                tileStyle === 'solid' && isHovered  && isWin  && 'bg-emerald-500/[0.22]',
                tileStyle === 'solid' && isHovered  && isLoss && 'bg-red-500/[0.22]',
                tileStyle === 'solid' && !isHovered && isWin  && 'bg-emerald-500/[0.12]',
                tileStyle === 'solid' && !isHovered && isLoss && 'bg-red-500/[0.12]',
                // ── muted tile style ──────────────────────────────────────
                tileStyle === 'muted' && isHovered  && isWin  && 'bg-emerald-500/[0.10]',
                tileStyle === 'muted' && isHovered  && isLoss && 'bg-red-500/[0.10]',
                tileStyle === 'muted' && !isHovered && isWin  && 'bg-emerald-500/[0.05]',
                tileStyle === 'muted' && !isHovered && isLoss && 'bg-red-500/[0.05]',
                // ── outlined tile style ───────────────────────────────────
                tileStyle === 'outlined' && isWin  && 'ring-1 ring-emerald-500/40',
                tileStyle === 'outlined' && isLoss && 'ring-1 ring-red-500/40',
                tileStyle === 'outlined' && isHovered && isWin  && 'bg-emerald-500/[0.06]',
                tileStyle === 'outlined' && isHovered && isLoss && 'bg-red-500/[0.06]',
                // ── shared hover for empty cells ─────────────────────────
                isHovered && !data && !isFuture && 'bg-white/[0.07]',
                // ── neutral cell backgrounds ─────────────────────────────
                !data && isToday  && !isFuture && 'bg-white/[0.04]',
                !data && !isToday && !isFuture && 'bg-white/[0.02]',
                // ── future days ──────────────────────────────────────────
                isFuture && !data && 'bg-transparent opacity-30 cursor-default pointer-events-none',
                // ── today ring ───────────────────────────────────────────
                isToday && 'ring-1 ring-white/10',
              )}
            >
              <span className={clsx(
                'text-[11px] font-semibold leading-none',
                isToday ? 'text-white' : 'text-white/30',
              )}>
                {day}
              </span>

              {data && (
                <div className="mt-auto flex flex-col gap-0.5">
                  <span
                    className={clsx(
                      'text-[11px] font-semibold tabular-nums leading-none whitespace-nowrap',
                      isWin ? 'text-emerald-400' : 'text-red-400',
                    )}
                    title={fmtPnlFull(data.pnl, sym)}
                  >
                    {fmtPnlCompact(data.pnl, sym)}
                  </span>
                  {showCount && (
                    <span className="text-[8px] leading-none text-white/20">
                      {data.count} {data.count === 1 ? 'trade' : 'trades'}
                    </span>
                  )}
                </div>
              )}

              {!data && !isFuture && (
                <div className="mt-auto">
                  <span className="text-[11px] leading-none text-white/[0.07]">
                    +
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
