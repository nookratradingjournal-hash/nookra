import { useState, useRef } from 'react'
import { Trade, MetricKey } from '../types'
import { EquitySparkline } from './MiniChart'
import { fmtBalanceFull, fmtPnlCompact, getCurrencySymbol } from '../utils/fmt'
import { computeMetrics } from '../utils/metrics'

// ── Daily rotating quotes ─────────────────────────────────────────────────────

const QUOTES = [
  'No trade is also a trade.',
  'Cut losses short. Let profits run.',
  'Discipline is remembering what you want.',
  'The trend is your friend until it ends.',
  'Risk management is the only real edge.',
  "Wait for the setup. The market isn't going anywhere.",
  'Consistency over frequency.',
  'Protect capital first. Profit will follow.',
  'Trade the plan. Not the emotion.',
  'Size down when uncertain.',
  'The best traders are the most patient.',
  'Process over outcome, always.',
  "One loss doesn't define a career.",
  'Preparation separates professionals from gamblers.',
  'A small loss today is better than a large loss tomorrow.',
  'Your edge only works when followed consistently.',
  'Know your max loss before you enter.',
  'Markets reward patience and punish impulse.',
  'Miss the setup? Wait for the next one.',
  'The market will be here tomorrow.',
]

function getDailyQuote(): string {
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const doy   = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
  return QUOTES[doy % QUOTES.length]
}

// ── Props ────────────────────────────────────────────────────────────────────

interface HeroStatsProps {
  trades: Trade[]
  currency: string
  startingBalance: number
  focusNote: string
  quotesEnabled: boolean
  visibleMetrics: MetricKey[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SecondaryMetric({ label, value, tone }: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.1em]">{label}</span>
      <span className={[
        'text-lg font-semibold tabular-nums leading-none',
        tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-white/70',
      ].join(' ')}>
        {value}
      </span>
    </div>
  )
}

// Read-only hero balance with truncation + hover tooltip
//
// The $ glyph and the digits are rendered as two separate spans so the symbol
// can be optically tuned (slightly smaller, tiny upward shift, small trailing
// gap, dimmed a hair) without affecting the digits. They share the same
// baseline via `items-baseline`, and both inherit the 52px font-size from the
// wrapper so `font-size: 0.9em` on the symbol resolves correctly. The minus
// sign (for a negative balance) travels with the symbol so the layout reads
// as `[−$][30,000]`.
function HeroBalance({ value, tone, sym }: {
  value: number
  tone: 'positive' | 'negative' | 'neutral'
  sym: string
}) {
  const [hovered, setHovered]       = useState(false)
  const [isTruncated, setTruncated] = useState(false)
  const spanRef = useRef<HTMLSpanElement>(null)
  const display = fmtBalanceFull(value, sym)
  const sign       = value < 0 ? '\u2212' : ''
  const absValue   = Math.abs(value)
  const numberPart = absValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const toneClass  = tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-white'

  const handleEnter = () => {
    setHovered(true)
    if (spanRef.current) setTruncated(spanRef.current.scrollWidth > spanRef.current.clientWidth)
  }

  return (
    <div
      className="relative max-w-[300px] flex items-baseline text-[52px]"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className={`font-bold leading-none shrink-0 cursor-default ${toneClass}`}
        style={{ fontSize: '0.92em', marginRight: '3px', transform: 'translateY(-1px)', opacity: 0.95 }}
      >
        {sign}{sym}
      </span>
      <span
        ref={spanRef}
        className={`font-bold tabular-nums tracking-tight leading-none block truncate cursor-default min-w-0 ${toneClass}`}
      >
        {numberPart}
      </span>
      {hovered && isTruncated && (
        <div className="absolute left-0 top-full mt-2.5 z-50 pointer-events-none" style={{ whiteSpace: 'nowrap' }}>
          <div className="bg-[#18181b] border border-white/[0.09] rounded-lg px-3 py-2 shadow-2xl">
            <span className="text-sm font-semibold tabular-nums text-white/70">{display}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Metric definitions ────────────────────────────────────────────────────────

export const ALL_METRIC_DEFS: Record<MetricKey, {
  label: string
  desc: string
  compute: (m: ReturnType<typeof computeMetrics>, sym: string) => { value: string; tone: 'positive' | 'negative' | 'neutral' }
}> = {
  winRate: {
    label: 'Win Rate', desc: '% of winning trades',
    compute: (m) => ({
      value: m.winRate ? `${m.winRate}%` : '\u2014',
      tone:  m.winRate >= 55 ? 'positive' : (m.winRate < 45 && m.winRate > 0) ? 'negative' : 'neutral',
    }),
  },
  totalPnl: {
    label: 'Total P&L', desc: 'Sum of all realized PnL',
    compute: (m, sym) => ({
      value: m.totalTrades ? fmtPnlCompact(m.totalPnl, sym) : '\u2014',
      tone:  m.totalPnl > 0 ? 'positive' : m.totalPnl < 0 ? 'negative' : 'neutral',
    }),
  },
  avgWL: {
    label: 'Avg W/L', desc: 'Average win ÷ average loss',
    compute: (m) => ({
      value: m.avgWinLoss ? `${m.avgWinLoss.toFixed(1)}x` : '\u2014',
      tone:  m.avgWinLoss !== null ? (m.avgWinLoss >= 1.5 ? 'positive' : m.avgWinLoss < 1 ? 'negative' : 'neutral') : 'neutral',
    }),
  },
  profitFactor: {
    label: 'Prof. Factor', desc: 'Gross wins ÷ gross losses',
    compute: (m) => ({
      value: m.profitFactor > 0 && isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '\u2014',
      tone:  m.profitFactor >= 1.5 ? 'positive' : (m.profitFactor < 1 && m.profitFactor > 0) ? 'negative' : 'neutral',
    }),
  },
  expectancy: {
    label: 'Expectancy', desc: 'Average PnL per trade',
    compute: (m, sym) => ({
      value: m.totalTrades ? fmtPnlCompact(m.expectancy, sym) : '\u2014',
      tone:  m.expectancy > 0 ? 'positive' : m.expectancy < 0 ? 'negative' : 'neutral',
    }),
  },
  maxDrawdown: {
    label: 'Max DD', desc: 'Largest peak-to-trough decline',
    compute: (m, sym) => ({
      value: m.maxDrawdown > 0 ? `-${fmtPnlCompact(-m.maxDrawdown, sym).slice(1)}` : '\u2014',
      tone:  m.maxDrawdown > 0 ? 'negative' : 'neutral',
    }),
  },
  bestDay: {
    label: 'Best Day', desc: 'Highest single-day PnL',
    compute: (m, sym) => ({
      value: m.bestDay > 0 ? fmtPnlCompact(m.bestDay, sym) : '\u2014',
      tone:  m.bestDay > 0 ? 'positive' : 'neutral',
    }),
  },
  worstDay: {
    label: 'Worst Day', desc: 'Lowest single-day PnL',
    compute: (m, sym) => ({
      value: m.worstDay < 0 ? fmtPnlCompact(m.worstDay, sym) : '\u2014',
      tone:  m.worstDay < 0 ? 'negative' : 'neutral',
    }),
  },
  avgR: {
    label: 'Avg R', desc: 'Average R multiple per trade',
    compute: (m) => ({
      value: m.avgR !== null ? `${m.avgR.toFixed(2)}R` : '\u2014',
      tone:  m.avgR !== null ? (m.avgR >= 1 ? 'positive' : m.avgR < 0 ? 'negative' : 'neutral') : 'neutral',
    }),
  },
  consecWins: {
    label: 'Best Streak', desc: 'Longest consecutive win streak',
    compute: (m) => ({
      value: m.consecWins > 0 ? `${m.consecWins}W` : '\u2014',
      tone:  m.consecWins >= 3 ? 'positive' : 'neutral',
    }),
  },
  consecLosses: {
    label: 'Worst Streak', desc: 'Longest consecutive loss streak',
    compute: (m) => ({
      value: m.consecLosses > 0 ? `${m.consecLosses}L` : '\u2014',
      tone:  m.consecLosses >= 3 ? 'negative' : 'neutral',
    }),
  },
  ruleFollowRate: {
    label: 'Discipline', desc: 'Rule-follow rate across all trades',
    compute: (m) => ({
      value: m.totalTrades ? `${m.ruleFollowRate}%` : '\u2014',
      tone:  m.ruleFollowRate >= 80 ? 'positive' : m.ruleFollowRate < 60 && m.ruleFollowRate > 0 ? 'negative' : 'neutral',
    }),
  },
}

// ── Main export ───────────────────────────────────────────────────────────────

export function HeroStats({ trades, currency, startingBalance, focusNote, quotesEnabled, visibleMetrics }: HeroStatsProps) {
  const sym = getCurrencySymbol(currency)
  const m   = computeMetrics(trades)

  const accountBalance = startingBalance + m.totalPnl
  const balanceTone: 'positive' | 'negative' | 'neutral' =
    m.totalPnl > 0 ? 'positive' : m.totalPnl < 0 ? 'negative' : 'neutral'

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // Focus note: custom override OR daily rotating quote
  const displayNote = focusNote || (quotesEnabled ? getDailyQuote() : '')

  return (
    <div data-tutorial="stats" className="pt-8 pb-6">
      {/* Top row — date + quote on the left, equity chart on the right.
          Generous gap to the balance below so the hero breathes instead of
          reading as one squished column. */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex flex-col min-w-0">
          <p className="text-[11px] text-white/75 tracking-wide">{todayLabel}</p>
          {displayNote && (
            <p className="text-[11px] text-white/65 italic mt-1 max-w-xs truncate">{displayNote}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <span className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.1em]">Equity</span>
          <EquitySparkline trades={trades} />
        </div>
      </div>

      {/* Hero row — balance is the visual anchor. `gap-0.5` (2px) on the
          inner column tucks the starting-balance caption directly under
          the main balance so the two feel attached. */}
      <div className="flex items-end justify-between gap-8">
        <div className="flex flex-col gap-2 min-w-0">
          <HeroBalance value={accountBalance} tone={balanceTone} sym={sym} />
          <span className="text-[9px] text-white/15 tracking-wide">
            Starting {sym}{startingBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="flex items-end gap-8 pb-1 shrink-0">
          {visibleMetrics.slice(0, 3).map((key) => {
            const def = ALL_METRIC_DEFS[key]
            if (!def) return null
            const { value, tone } = def.compute(m, sym)
            return <SecondaryMetric key={key} label={def.label} value={value} tone={tone} />
          })}
        </div>
      </div>
    </div>
  )
}
