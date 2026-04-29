import { useState } from 'react'
import { clsx } from 'clsx'
import { Trade } from '../types'
import { getCurrencySymbol, fmtPnlCompact } from '../utils/fmt'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { ScreenshotViewer } from './ScreenshotViewer'
import { parseLocalDate } from '../utils/dates'

interface DayPanelProps {
  open: boolean
  onClose: () => void
  date: string | null
  trades: Trade[]
  currency: string
  onAddTrade: () => void
  onRemoveTrade: (id: string) => void
  onEditTrade: (trade: Trade) => void
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtDate(dateStr: string) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`
}

function plural(n: number, word: string, plural?: string) {
  return `${n} ${n === 1 ? word : (plural ?? word + 's')}`
}

// ─── Shared reflection line (Did well / Improve) ─────────────────────────────
// Always renders — shows a muted "—" placeholder when the field is empty.
// Using div (block) not span so line-clamp works correctly cross-browser.

function ReflectionLine({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim() || null
  return (
    <div className="flex gap-1.5 items-baseline min-w-0">
      <span className="text-[8px] font-semibold uppercase tracking-wider text-white/15 shrink-0 leading-none">
        {label}
      </span>
      <span className={clsx(
        'text-[10px] leading-snug line-clamp-1 min-w-0',
        text ? 'text-white/20' : 'text-white/10 italic',
      )}>
        {text ?? '—'}
      </span>
    </div>
  )
}

// ─── Single trade row ────────────────────────────────────────────────────────

function TradeRow({
  trade,
  sym,
  isLast,
  onRemove,
  onEdit,
  onOpenLightbox,
}: {
  trade: Trade
  sym: string
  isLast: boolean
  onRemove: () => void
  onEdit: () => void
  onOpenLightbox: (screenshots: string[], idx: number) => void
}) {
  // Computed R:R from entry / stop / target if all present
  const rr =
    trade.stopLoss && trade.entry && trade.entry !== trade.stopLoss
      ? Math.abs((trade.takeProfit - trade.entry) / (trade.entry - trade.stopLoss))
      : null

  const outcomeDot = trade.outcome === 'win'
    ? 'bg-emerald-400'
    : trade.outcome === 'loss'
    ? 'bg-red-400'
    : 'bg-white/15'

  const sideTone = trade.side === 'long' ? 'text-emerald-400' : 'text-red-400'
  const sideLabel = trade.side === 'long' ? 'Long' : 'Short'
  const sideArrow = trade.side === 'long' ? '↑' : '↓'

  const pnlTone =
    trade.result > 0 ? 'text-emerald-400' : trade.result < 0 ? 'text-red-400' : 'text-white/30'

  return (
    <div
      className={clsx(
        'flex items-start gap-3 py-4 group/row',
        !isLast && 'border-b border-white/[0.04]'
      )}
    >
      {/* Outcome indicator */}
      <div className={clsx('w-1.5 h-1.5 rounded-full mt-[5px] shrink-0', outcomeDot)} />

      {/* Content */}
      <div className="flex-1 min-w-0">

        {/* Line 1 — instrument + direction */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{trade.instrument}</span>
          <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', sideTone)}>
            {sideArrow} {sideLabel}
          </span>
          {trade.setupType && (
            <span className="text-[10px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {trade.setupType}
            </span>
          )}
          {trade.strategy && (
            <span className="text-[10px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {trade.strategy}
            </span>
          )}
        </div>

        {/* Line 2 — session + emotion (only if present) */}
        {(trade.session || trade.emotionBefore) && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {trade.session && (
              <span className="text-[10px] text-white/20">{trade.session}</span>
            )}
            {trade.session && trade.emotionBefore && (
              <span className="text-[10px] text-white/10">&middot;</span>
            )}
            {trade.emotionBefore && (
              <span className="text-[10px] text-white/20">{trade.emotionBefore}</span>
            )}
          </div>
        )}

        {/* Line 3 — entry reason (short preview) */}
        {trade.reasonForEntry && (
          <p className="text-[11px] text-white/25 leading-relaxed line-clamp-1 mt-1.5 italic">
            &ldquo;{trade.reasonForEntry}&rdquo;
          </p>
        )}

        {/* Line 4 — rules + reflection notes */}
        <div className="flex flex-col gap-1.5 mt-2">
          {trade.followedRules && (
            <span
              className="text-[10px] font-medium"
              style={{ color: 'var(--accent)', opacity: 0.75 }}
            >
              ✓ Followed rules
            </span>
          )}
          <ReflectionLine label="Did well" value={trade.didRight} />
          <ReflectionLine label="Improve"  value={trade.improve}  />
        </div>

        {/* Screenshots — max 4 slots; slot 4 becomes overflow indicator if total > 4 */}
        {(trade.screenshots?.length ?? 0) > 0 && (() => {
          const all      = trade.screenshots!
          const originals = all.map((s) => s.original)
          const total    = all.length
          const MAX      = 4
          const showOver = total > MAX
          const visible  = showOver ? all.slice(0, MAX - 1) : all   // 3 real + 1 overflow tile, or all ≤4
          const overflow = total - (MAX - 1)                         // e.g. 5 total → "+2"

          return (
            <div className="flex gap-1.5 mt-2.5">
              {visible.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenLightbox(originals, i)}
                  className="w-16 h-10 rounded overflow-hidden bg-white/[0.04] hover:opacity-80 transition-opacity shrink-0 cursor-pointer"
                >
                  <img src={s.thumb} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}

              {showOver && (
                <button
                  type="button"
                  onClick={() => onOpenLightbox(originals, MAX - 1)}
                  className="w-16 h-10 rounded overflow-hidden bg-white/[0.06] hover:bg-white/[0.10] transition-colors shrink-0 cursor-pointer relative"
                >
                  <img src={all[MAX - 1].thumb} alt={`Screenshot ${MAX}`} className="w-full h-full object-cover opacity-30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-semibold text-white/80 tabular-nums">+{overflow}</span>
                  </div>
                </button>
              )}
            </div>
          )
        })()}

      </div>

      {/* Right column — P&L, R:R, delete */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={clsx('text-sm font-semibold tabular-nums', pnlTone)}>
          {fmtPnlCompact(trade.result, sym)}
        </span>
        {rr !== null && (
          <span className="text-[10px] text-white/20 tabular-nums">{rr.toFixed(1)}R</span>
        )}
        <button
          onClick={onEdit}
          title="Edit trade"
          className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 text-white/20 hover:text-white/60 hover:bg-white/[0.06] p-0.5 rounded cursor-pointer"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 9L6.5 4L8.5 6L3.5 11H1.5V9Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5L8 2.5L9.5 4L7 6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={onRemove}
          title="Delete trade"
          className="close-hover mt-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 text-white/20 p-0.5 rounded hover:-translate-y-[1px] active:translate-y-0"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M1 3h9M4 3V2h3v1M2 3l.5 7h6L9 3"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Day Panel modal ─────────────────────────────────────────────────────────

export function DayPanel({
  open,
  onClose,
  date,
  trades,
  currency,
  onAddTrade,
  onRemoveTrade,
  onEditTrade,
}: DayPanelProps) {
  const [lightbox, setLightbox] = useState<{ screenshots: string[]; idx: number } | null>(null)

  if (!date) return null

  const sym = getCurrencySymbol(currency)
  const dayPnl = trades.reduce((a, t) => a + t.result, 0)
  const wins = trades.filter((t) => t.outcome === 'win').length
  const losses = trades.filter((t) => t.outcome === 'loss').length
  const breakevens = trades.filter((t) => t.outcome === 'breakeven').length

  const handleAddTrade = () => {
    onClose()
    onAddTrade()
  }

  // Summary line: "2 wins · 1 loss" — only shown when outcomes are logged
  const hasOutcomes = wins > 0 || losses > 0 || breakevens > 0
  const summaryParts: string[] = []
  if (wins > 0) summaryParts.push(plural(wins, 'win'))
  if (losses > 0) summaryParts.push(plural(losses, 'loss', 'losses'))
  if (breakevens > 0) summaryParts.push(plural(breakevens, 'breakeven'))
  const outcomeSummary = summaryParts.join(' · ')

  return (
    <>
    {lightbox && (
      <ScreenshotViewer
        screenshots={lightbox.screenshots}
        initialIdx={lightbox.idx}
        onClose={() => setLightbox(null)}
      />
    )}
    <Modal open={open} onClose={onClose} width="max-w-md" panelClassName="!bg-[rgba(17,17,19,0.82)] backdrop-blur-xl !border-white/[0.04]">
      <div className="flex flex-col max-h-[82vh]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex flex-col gap-2">
            {/* Date */}
            <h2 className="text-sm font-semibold text-white">{fmtDate(date)}</h2>

            {trades.length > 0 && (
              <div className="flex items-baseline gap-3 flex-wrap">
                {/* Day P&L */}
                <span
                  className={clsx(
                    'text-xl font-bold tabular-nums leading-none',
                    dayPnl > 0
                      ? 'text-emerald-400'
                      : dayPnl < 0
                      ? 'text-red-400'
                      : 'text-white/40'
                  )}
                >
                  {fmtPnlCompact(dayPnl, sym)}
                </span>

                {/* Wins / losses breakdown */}
                {hasOutcomes ? (
                  <span className="text-xs text-white/30 tabular-nums">{outcomeSummary}</span>
                ) : (
                  <span className="text-xs text-white/20 tabular-nums">
                    {plural(trades.length, 'trade')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddTrade}
              className="
                !rounded-lg !px-3.5
                !bg-white/[0.035] !border-white/[0.08]
                !text-white/70
                hover:!bg-white/[0.07] hover:!border-white/[0.16]
                hover:!text-white
                !shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]
              "
            >
              + Add Trade
            </Button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="close-hover ml-1 w-7 h-7 rounded-md flex items-center justify-center text-white/25 transition-all duration-150 ease-out hover:-translate-y-[1px] active:translate-y-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1L11 11M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-2">
          {trades.length === 0 ? (
            <div className="py-12 flex items-center justify-center">
              <p className="text-sm text-white/20 text-center">No trades logged for today.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {trades.map((trade, i) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  sym={sym}
                  isLast={i === trades.length - 1}
                  onRemove={() => onRemoveTrade(trade.id)}
                  onEdit={() => onEditTrade(trade)}
                  onOpenLightbox={(shots, idx) => setLightbox({ screenshots: shots, idx })}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </Modal>
    </>
  )
}
