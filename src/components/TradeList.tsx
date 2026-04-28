import { clsx } from 'clsx'
import { Trade } from '../types'
import { getCurrencySymbol, fmtPnlCompact } from '../utils/fmt'
import { parseLocalDate } from '../utils/dates'

interface TradeListProps {
  trades: Trade[]
  currency: string
  onOpenDay?: (date: string) => void
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(dateStr: string) {
  const d = parseLocalDate(dateStr)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

export function TradeList({ trades, currency, onOpenDay }: TradeListProps) {
  const sym = getCurrencySymbol(currency)

  const recent = [...trades]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  if (recent.length === 0) {
    return (
      <p className="text-sm text-white/15 py-4">
        No trades recorded yet. Click a calendar day to log one.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {recent.map((trade, i) => {
        const rrRaw =
          trade.stopLoss && trade.entry && trade.entry !== trade.stopLoss
            ? Math.abs((trade.takeProfit - trade.entry) / (trade.entry - trade.stopLoss))
            : null

        return (
          <div
            key={trade.id}
            // Lets the tutorial pulse a specific row (e.g. the transient
            // trade submitted by the behavioral demo) without relying on
            // nth-child, which shifts as the list grows.
            data-trade-id={trade.id}
            className={clsx(
              'trade-row flex items-start gap-4',
              i < recent.length - 1 && 'border-b border-white/[0.04]'
            )}
          >
            <div className={clsx(
              'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
              trade.outcome === 'win' ? 'bg-emerald-400' : trade.outcome === 'loss' ? 'bg-red-400' : 'bg-white/20'
            )} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white">{trade.instrument}</span>
                <span className={clsx(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  trade.side === 'long' ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {trade.side === 'long' ? '\u2191' : '\u2193'} {trade.side}
                </span>
                {trade.setupType && (
                  <span className="text-[10px] text-white/20">{trade.setupType}</span>
                )}
                {trade.strategy && (
                  <span className="text-[10px] text-white/15">&middot; {trade.strategy}</span>
                )}
                {trade.session && (
                  <span className="text-[10px] text-white/15">&middot; {trade.session}</span>
                )}
              </div>

              {trade.reasonForEntry && (
                <p className="text-xs text-white/25 leading-relaxed line-clamp-1 mb-0.5">
                  {trade.reasonForEntry}
                </p>
              )}

              <button
                onClick={() => onOpenDay?.(trade.date)}
                className="text-[10px] text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all duration-150 cursor-pointer tabular-nums px-1 py-0.5 rounded -mx-1"
              >
                {fmtDate(trade.date)}
              </button>
            </div>

            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className={clsx(
                'text-sm font-semibold tabular-nums',
                trade.result > 0 ? 'text-emerald-400' : trade.result < 0 ? 'text-red-400' : 'text-white/30'
              )}>
                {fmtPnlCompact(trade.result, sym)}
              </span>
              {rrRaw && (
                <span className="text-[10px] text-white/15 tabular-nums">{rrRaw.toFixed(1)}R</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
