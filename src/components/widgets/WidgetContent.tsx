import { useAppStore, selectActiveChecklist } from '../../store/useAppStore'
import { useTradingStats } from '../../hooks/useTradingStats'
import { localToday } from '../../utils/dates'

interface Props { type: string }

// ── Style tokens ──────────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  // Token-driven: matches the --text-quaternary tier from :root so widget
  // micro-labels stay in lockstep with the global text hierarchy instead of
  // sitting at a one-off 0.25 alpha.
  color: 'var(--text-quaternary)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  userSelect: 'none',
  flexShrink: 0,
}

const NUM: React.CSSProperties = {
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
}

// Small (1×1): 108×108px — single metric, vertically centered
const SIG: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 6,
  width: '100%',
  height: '100%',
  padding: '0 12px',
  boxSizing: 'border-box',
  overflow: 'hidden',
}

// Medium / Large: fill the shell
const FULL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  padding: '10px 12px',
  boxSizing: 'border-box',
  overflow: 'hidden',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPnl(n: number, sym: string): string {
  if (n === 0) return `${sym}0`
  const abs  = Math.abs(n)
  const sign = n > 0 ? '+' : '\u2212'
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`
  return `${sign}${sym}${abs.toFixed(0)}`
}

// All color returns below resolve to CSS custom properties defined in
// :root (index.css). This keeps widgets on the same semantic color system
// as the journal components — retuning positive/negative/warning in :root
// flows through everywhere at once, with no raw hex to hunt down.
function pnlColor(n: number, neutral = 'var(--color-neutral-pnl)'): string {
  return n > 0 ? 'var(--color-positive)' : n < 0 ? 'var(--color-negative)' : neutral
}

function rateColor(pct: number): string {
  return pct >= 80
    ? 'var(--color-positive)'
    : pct >= 60
    ? 'var(--color-warning)'
    : 'var(--color-negative)'
}

// ── Equity sparkline ──────────────────────────────────────────────────────────

function EquitySpark({
  points, color, fillContainer = false,
}: { points: Array<{ cumPnl: number }>; color: string; fillContainer?: boolean }) {
  if (points.length < 2) return null
  const W = 200, H = 60, PAD = 4
  const vals  = points.map((p) => p.cumPnl)
  const minV  = Math.min(0, ...vals)
  const maxV  = Math.max(0, ...vals)
  const range = maxV - minV || 1
  const toX   = (i: number) => (i / (vals.length - 1)) * W
  const toY   = (v: number) => H - ((v - minV) / range) * (H - PAD * 2) - PAD
  const zeroY = toY(0)
  const pts   = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const area  = [
    `M ${toX(0).toFixed(1)},${toY(vals[0]).toFixed(1)}`,
    ...vals.slice(1).map((v, i) => `L ${toX(i + 1).toFixed(1)},${toY(v).toFixed(1)}`),
    `L ${W},${zeroY.toFixed(1)}`,
    `L 0,${zeroY.toFixed(1)}`,
    'Z',
  ].join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: fillContainer ? '100%' : H, display: 'block', overflow: 'visible' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--edge-resting)" strokeWidth="0.8" />
      <path d={area} fill="url(#eq-fill)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={toX(vals.length - 1).toFixed(1)}
        cy={toY(vals[vals.length - 1]).toFixed(1)}
        r="2.5" fill={color} opacity="0.9"
      />
    </svg>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function WidgetContent({ type }: Props) {
  const stats     = useTradingStats()
  const checklist = useAppStore(selectActiveChecklist)
  const timezone  = useAppStore((s) => s.settings.timezone)
  const sym       = stats.currencySymbol
  const today     = localToday(timezone)

  const ckItems = checklist.filter((c) => c.kind === 'item')
  const ckDone  = ckItems.filter((c) => c.checked).length
  const ckPct   = ckItems.length > 0 ? Math.round((ckDone / ckItems.length) * 100) : 0

  switch (type) {

    // ══════════════════════════════════════════════════════════════════════════
    // SMALL — one signal: "What is my status right now?"
    // ══════════════════════════════════════════════════════════════════════════

    case 'small/day-grade': {
      const { dayGrade } = stats
      const gradeColor = dayGrade == null ? 'var(--text-quaternary)'
        : dayGrade === 'A' ? 'var(--color-positive)'
        : dayGrade === 'B' ? 'var(--color-positive-bright)'
        : dayGrade === 'C' ? 'var(--color-warning)'
        : dayGrade === 'D' ? 'var(--color-warning-strong)'
        : 'var(--color-negative)'
      const gradeLabel = dayGrade == null ? 'No trades yet'
        : dayGrade === 'A' ? 'Outstanding'
        : dayGrade === 'B' ? 'Good day'
        : dayGrade === 'C' ? 'Average'
        : dayGrade === 'D' ? 'Poor'
        : 'Needs work'
      return (
        <div style={SIG}>
          <span style={LABEL}>Day Grade</span>
          <div style={{ ...NUM, fontSize: 36, fontWeight: 800, color: gradeColor, letterSpacing: '-0.04em' }}>
            {dayGrade ?? '—'}
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-quaternary)' }}>{gradeLabel}</span>
        </div>
      )
    }

    case 'small/daily-risk': {
      const { dailyPnl, worstDay } = stats
      const maxLoss   = Math.abs(Math.min(worstDay, 0))
      const todayLoss = Math.max(0, -dailyPnl)
      const pct       = maxLoss > 0 ? (todayLoss / maxLoss) * 100 : 0
      const status    = todayLoss === 0 ? 'Clear' : pct < 40 ? 'Safe' : pct < 75 ? 'Caution' : 'Stop'
      const statusColor = todayLoss === 0 ? 'var(--color-neutral-pnl)'
        : pct < 40 ? 'var(--color-positive)' : pct < 75 ? 'var(--color-warning)' : 'var(--color-negative)'
      const barColor = pct < 40 ? 'var(--color-positive-fill)' : pct < 75 ? 'var(--color-warning-fill)' : 'var(--color-negative-emphasis)'
      return (
        <div style={SIG}>
          <span style={LABEL}>Daily Risk</span>
          <div style={{ ...NUM, fontSize: 18, fontWeight: 700, color: statusColor }}>
            {status}
          </div>
          {maxLoss > 0 && (
            <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-resting)' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 99, background: barColor, transition: 'width 500ms ease' }} />
            </div>
          )}
          <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>
            {maxLoss > 0 ? `${Math.round(pct)}% of max loss` : 'No loss history'}
          </span>
        </div>
      )
    }

    case 'small/streak': {
      const { currentStreak } = stats
      const isW = currentStreak > 0
      const c   = currentStreak === 0 ? 'var(--text-quaternary)' : isW ? 'var(--color-positive)' : 'var(--color-negative)'
      const sub = currentStreak === 0 ? 'No decisive trades'
        : isW
          ? currentStreak === 1 ? 'Last trade won' : `${currentStreak} wins in a row`
          : Math.abs(currentStreak) === 1 ? 'Last trade lost' : `${Math.abs(currentStreak)} losses in a row`
      return (
        <div style={SIG}>
          <span style={LABEL}>Streak</span>
          <div style={{ ...NUM, fontSize: 28, fontWeight: 700, color: c, letterSpacing: '-0.03em' }}>
            {currentStreak === 0 ? '—' : `${Math.abs(currentStreak)}${isW ? 'W' : 'L'}`}
          </div>
          <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>{sub}</span>
        </div>
      )
    }

    // Best setup today — highest net P&L setup among today's trades only
    case 'small/best-today': {
      const { bestSetupToday } = stats
      if (!bestSetupToday) {
        return (
          <div style={SIG}>
            <span style={LABEL}>Best Today</span>
            <div style={{ ...NUM, fontSize: 22, fontWeight: 700, color: 'var(--text-ghost)' }}>—</div>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>No trades yet</span>
          </div>
        )
      }
      const { setup, pnl, trades } = bestSetupToday
      // Truncate long setup names to fit the 1×1 cell
      const name = setup.length > 14 ? setup.slice(0, 13).trimEnd() + '…' : setup
      return (
        <div style={SIG}>
          <span style={LABEL}>Best Today</span>
          <div style={{
            fontSize: setup.length > 10 ? 11 : 13,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            wordBreak: 'break-word',
          }}>
            {name}
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: pnlColor(pnl), fontVariantNumeric: 'tabular-nums' }}>
            {fmtPnl(pnl, sym)}
          </span>
          <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>
            {trades} trade{trades !== 1 ? 's' : ''} today
          </span>
        </div>
      )
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MEDIUM — one focused insight: "What pattern should I know?"
    // ══════════════════════════════════════════════════════════════════════════

    // Daily P&L bars — rhythm of winning vs losing days
    case 'medium-h/daily-pnl': {
      const { dailyPnlData, dailyPnl } = stats
      if (dailyPnlData.length === 0) {
        return (
          <div style={{ ...FULL, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>No trade data</span>
          </div>
        )
      }
      // today is defined at component scope via localToday(timezone)
      const maxAbs  = Math.max(...dailyPnlData.map((d) => Math.abs(d.pnl)), 1)
      const winDays = dailyPnlData.filter((d) => d.pnl > 0).length
      const total   = dailyPnlData.length

      return (
        <div style={{ ...FULL, gap: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexShrink: 0 }}>
            <span style={LABEL}>Daily P&L</span>
            <span style={{ ...NUM, fontSize: 13, fontWeight: 700, color: pnlColor(dailyPnl), whiteSpace: 'nowrap' }}>
              {fmtPnl(dailyPnl, sym)}
            </span>
          </div>

          {/* Bar chart */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
            {dailyPnlData.map((d, i) => {
              const pct     = Math.abs(d.pnl) / maxAbs
              const isPos   = d.pnl >= 0
              const isToday = d.date === today
              const barCol  = isPos
                ? (isToday ? 'var(--color-positive-emphasis)' : 'var(--color-positive-fill)')
                : (isToday ? 'var(--color-negative-emphasis)' : 'var(--color-negative-muted)')
              return (
                <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: isPos ? 'flex-end' : 'flex-start' }}>
                    <div style={{ width: '100%', borderRadius: 2, background: barCol, height: `${Math.max(pct * 100, 4)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>Last {total} days</span>
            <span style={{ fontSize: 8, color: 'var(--text-quaternary)' }}>{winDays}W · {total - winDays}L</span>
          </div>
        </div>
      )
    }

    // Session breakdown — which time of day builds or drains the account
    case 'medium-v/session': {
      const { sessionStats } = stats
      if (sessionStats.length === 0) {
        return (
          <div style={{ ...FULL, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>No session data</span>
          </div>
        )
      }
      const maxAbsPnl = Math.max(...sessionStats.map((s) => Math.abs(s.pnl)), 1)
      return (
        <div style={{ ...FULL }}>
          <span style={LABEL}>Sessions</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', marginTop: 8 }}>
            {sessionStats.map((s) => (
              <div key={s.session} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
                    {s.session}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 8, color: 'var(--text-quaternary)', fontVariantNumeric: 'tabular-nums' }}>
                      {s.winRate}%
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: pnlColor(s.pnl), fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPnl(s.pnl, sym)}
                    </span>
                  </div>
                </div>
                <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-resting)' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: s.pnl >= 0 ? 'var(--color-positive-fill)' : 'var(--color-negative-fill)',
                    width: `${(Math.abs(s.pnl) / maxAbsPnl) * 100}%`,
                    transition: 'width 500ms ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Recent Trades — last 5 outcomes as a clean dot sequence with P&L
    case 'medium-h/recent-trades': {
      const { recentTrades } = stats
      if (recentTrades.length === 0) {
        return (
          <div style={{ ...FULL, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>No trades yet</span>
          </div>
        )
      }
      // oldest → newest left → right
      const chronological = [...recentTrades].reverse()
      const netPnl = chronological.reduce((a, t) => a + t.result, 0)

      return (
        <div style={{ ...FULL }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
            <span style={LABEL}>Last {chronological.length} Trades</span>
            <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: pnlColor(netPnl), whiteSpace: 'nowrap' }}>
              {fmtPnl(netPnl, sym)}
            </span>
          </div>

          {/* Dot row — each outcome tile with P&L below */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            {chronological.map((t) => {
              const isWin  = t.outcome === 'win'
              const isLoss = t.outcome === 'loss'
              const bg     = isWin ? 'var(--color-positive-soft)' : isLoss ? 'var(--color-negative-soft)' : 'var(--edge-subtle)'
              const border = isWin ? 'var(--color-positive-strong)' : isLoss ? 'var(--color-negative-strong)' : 'var(--edge-resting)'
              return (
                <div
                  key={t.id}
                  style={{
                    flex: 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  {/* Outcome circle */}
                  <div style={{
                    width: 30, height: 30, borderRadius: 9,
                    background: bg,
                    border: `1px solid ${border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pnlColor(t.result, 'var(--color-neutral-pnl)') }}>
                      {t.outcome === 'win' ? 'W' : t.outcome === 'loss' ? 'L' : 'B'}
                    </span>
                  </div>
                  {/* P&L */}
                  <span style={{ fontSize: 8, fontWeight: 600, color: pnlColor(t.result, 'var(--text-quaternary)'), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center' }}>
                    {fmtPnl(t.result, sym)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // Long/Short Bias — how direction affects P&L and win rate
    case 'medium-v/bias': {
      const { biasStats } = stats
      const { long: l, short: s } = biasStats
      const total = l.trades + s.trades

      if (total === 0) {
        return (
          <div style={{ ...FULL, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>No trades yet</span>
          </div>
        )
      }

      const longPct  = Math.round((l.trades / total) * 100)
      const shortPct = 100 - longPct
      const dominant = longPct > shortPct ? 'Long' : shortPct > longPct ? 'Short' : 'Balanced'
      const domColor = dominant === 'Long' ? 'var(--color-positive)' : dominant === 'Short' ? 'var(--color-negative)' : 'var(--color-neutral-pnl)'

      const sideBlock = (
        d: { trades: number; wins: number; losses: number; pnl: number; winRate: number },
        label: string,
        barPct: number,
        barColor: string,
      ) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={LABEL}>{label}</span>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)', fontVariantNumeric: 'tabular-nums' }}>
              {d.trades} trade{d.trades !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-resting)' }}>
            <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 99, background: barColor, transition: 'width 500ms ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 8, color: 'var(--text-quaternary)', fontVariantNumeric: 'tabular-nums' }}>
              {d.winRate}% win
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: pnlColor(d.pnl), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmtPnl(d.pnl, sym)}
            </span>
          </div>
        </div>
      )

      return (
        <div style={{ ...FULL, gap: 0 }}>
          <span style={LABEL}>Direction</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', marginTop: 8 }}>
            {sideBlock(l, 'LONG',  longPct,  'var(--color-positive-fill)')}
            <div style={{ height: 1, background: 'var(--edge-subtle)' }} />
            {sideBlock(s, 'SHORT', shortPct, 'var(--color-negative-fill)')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--edge-subtle)', paddingTop: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>Bias</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: domColor }}>
              {dominant === 'Balanced' ? 'Balanced' : `${Math.max(longPct, shortPct)}% ${dominant}`}
            </span>
          </div>
        </div>
      )
    }

    // Overtrade Check — are you trading too much today vs your baseline?
    case 'medium-h/overtrade': {
      const { tradesToday, avgDailyTrades, tradesPerDayData } = stats
      const ratio    = avgDailyTrades > 0 ? tradesToday / avgDailyTrades : 0
      const status   = tradesToday === 0 ? 'No trades yet'
        : avgDailyTrades === 0 ? 'First day'
        : ratio < 1.4 ? 'On pace' : ratio < 2.0 ? 'Elevated' : 'Overtrading'
      const statusColor = tradesToday === 0 ? 'var(--text-quaternary)'
        : avgDailyTrades === 0 ? 'var(--text-tertiary)'
        : ratio < 1.4 ? 'var(--color-positive)' : ratio < 2.0 ? 'var(--color-warning)' : 'var(--color-negative)'

      // Mini sparkline of trade counts — last 7 days
      const recent  = tradesPerDayData.slice(-7)
      const maxCount = Math.max(...recent.map((d) => d.count), avgDailyTrades, tradesToday, 1)

      return (
        <div style={{ ...FULL }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
            <span style={LABEL}>Trade Volume</span>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>
              avg {avgDailyTrades > 0 ? avgDailyTrades.toFixed(1) : '—'}/day
            </span>
          </div>

          {/* Hero: today's count + status */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, flexShrink: 0 }}>
            <span style={{ ...NUM, fontSize: 28, fontWeight: 800, color: statusColor, letterSpacing: '-0.03em' }}>
              {tradesToday}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, opacity: 0.8 }}>
              {status}
            </span>
          </div>

          {/* Mini bar chart — last 7 days */}
          {recent.length > 0 && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 6, position: 'relative' }}>
              {/* Avg reference line */}
              {avgDailyTrades > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: `${(avgDailyTrades / maxCount) * 100}%`,
                  left: 0, right: 0,
                  borderTop: '1px dashed var(--text-ghost)',
                  pointerEvents: 'none',
                }} />
              )}
              {recent.map((d, i) => {
                const pct    = (d.count / maxCount) * 100
                const isSpike = d.count > avgDailyTrades * 1.8
                return (
                  <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', borderRadius: 2,
                      background: isSpike ? 'var(--color-negative-fill)' : 'var(--surface-active)',
                      height: `${Math.max(pct, 6)}%`,
                    }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LARGE — deep analysis: "What should influence my decisions?"
    // ══════════════════════════════════════════════════════════════════════════

    // Equity Curve — the full P&L arc with drawdown context
    case 'large/equity': {
      const { equityCurve, totalPnl, maxDrawdown, expectancy } = stats
      const c    = pnlColor(totalPnl, 'var(--color-positive)')
      const last = equityCurve[equityCurve.length - 1]?.cumPnl ?? 0

      let runPeak = 0, currentDd = 0
      equityCurve.forEach((p) => { if (p.cumPnl > runPeak) runPeak = p.cumPnl })
      if (runPeak > 0) currentDd = ((runPeak - last) / runPeak) * 100

      return (
        <div style={{ ...FULL, gap: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, flexShrink: 0 }}>
            <span style={LABEL}>Equity Curve</span>
            <span style={{ ...NUM, fontSize: 18, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>{fmtPnl(last, sym)}</span>
          </div>

          {/* Chart */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {equityCurve.length >= 2
              ? <EquitySpark points={equityCurve} color={c} fillContainer />
              : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>Not enough data</span>
                </div>
              )
            }
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', paddingTop: 10, marginTop: 4, borderTop: '1px solid var(--edge-subtle)', flexShrink: 0 }}>
            {[
              { label: 'Max DD',    value: maxDrawdown > 0 ? fmtPnl(-maxDrawdown, sym) : '—', color: maxDrawdown > 0 ? 'var(--color-negative)' : 'var(--text-quaternary)' },
              { label: 'Cur DD', value: currentDd > 0.5 ? `${currentDd.toFixed(1)}%` : 'At peak', color: currentDd > 20 ? 'var(--color-negative)' : currentDd > 5 ? 'var(--color-warning)' : 'var(--color-positive)' },
              { label: 'Avg/Trade', value: fmtPnl(expectancy, sym), color: pnlColor(expectancy) },
              { label: 'Win Rate',  value: stats.winRate > 0 ? `${stats.winRate}%` : '—', color: stats.winRate >= 55 ? 'var(--color-positive)' : stats.winRate > 0 ? 'var(--color-warning)' : 'var(--text-quaternary)' },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, paddingLeft: i > 0 ? 8 : 0, borderLeft: i > 0 ? '1px solid var(--edge-subtle)' : 'none', overflow: 'hidden' }}>
                <span style={LABEL}>{s.label}</span>
                <div style={{ ...NUM, fontSize: 11, fontWeight: 600, color: s.color, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Discipline Tracker — checklist adherence + rule follow history
    case 'large/discipline': {
      const { ruleFollowRate, ruleFollowStreak, recentRuleFollow, ruleBrokenToday } = stats

      return (
        <div style={{ ...FULL, gap: 0 }}>
          <span style={LABEL}>Discipline</span>

          {/* Today's checklist */}
          <div style={{ marginTop: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-neutral-pnl)' }}>Today's Checklist</span>
              <span style={{ ...NUM, fontSize: 9, fontWeight: 700, color: rateColor(ckPct) }}>
                {ckDone}/{ckItems.length} · {ckPct}%
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--surface-resting)' }}>
              <div style={{
                height: '100%', width: `${ckPct}%`, borderRadius: 99,
                background: ckPct >= 80 ? 'var(--color-positive-fill)' : ckPct >= 50 ? 'var(--color-warning-fill)' : 'var(--color-negative-fill)',
                transition: 'width 500ms ease',
              }} />
            </div>
            {ruleBrokenToday > 0 && (
              <div style={{ fontSize: 8, color: 'var(--color-negative)', marginTop: 5 }}>
                ⚠ {ruleBrokenToday} rule{ruleBrokenToday > 1 ? 's' : ''} broken today
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--edge-subtle)', margin: '10px 0', flexShrink: 0 }} />

          {/* All-time rule follow rate */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-neutral-pnl)' }}>Rule Follow Rate</span>
              <span style={{ ...NUM, fontSize: 9, fontWeight: 700, color: rateColor(ruleFollowRate) }}>
                {ruleFollowRate}%
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--surface-resting)' }}>
              <div style={{
                height: '100%', width: `${ruleFollowRate}%`, borderRadius: 99,
                background: ruleFollowRate >= 80 ? 'var(--color-positive-fill)' : ruleFollowRate >= 60 ? 'var(--color-warning-fill)' : 'var(--color-negative-fill)',
                transition: 'width 500ms ease',
              }} />
            </div>
            {ruleFollowStreak > 1 && (
              <div style={{ fontSize: 8, color: 'var(--color-positive)', marginTop: 5 }}>
                {ruleFollowStreak} consecutive clean trades
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--edge-subtle)', margin: '10px 0', flexShrink: 0 }} />

          {/* Last 10 trades discipline grid */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <span style={{ ...LABEL, display: 'block', marginBottom: 8 }}>
              Last {recentRuleFollow.length} Trades
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {recentRuleFollow.map((followed, i) => (
                <div
                  key={i}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    background: followed ? 'var(--color-positive-soft)' : 'var(--color-negative-soft)',
                    color: followed ? 'var(--color-positive-emphasis)' : 'var(--color-negative-emphasis)',
                    border: `1px solid ${followed ? 'var(--color-positive-strong)' : 'var(--color-negative-strong)'}`,
                    flexShrink: 0,
                  }}
                >
                  {followed ? '✓' : '✗'}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    // Setup Performance — ranked table of what's worth trading
    case 'large/setup': {
      const { setupStats } = stats
      if (setupStats.length === 0) {
        return (
          <div style={{ ...FULL, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>Need ≥ 2 trades per setup</span>
          </div>
        )
      }
      const maxAbsPnl = Math.max(...setupStats.map((s) => Math.abs(s.pnl)), 1)
      return (
        <div style={{ ...FULL, gap: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexShrink: 0 }}>
            <span style={LABEL}>Setup Performance</span>
            <span style={{ fontSize: 8, color: 'var(--text-ghost)' }}>
              {setupStats.length} setup{setupStats.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Column headers */}
          <div style={{ display: 'flex', paddingBottom: 6, borderBottom: '1px solid var(--edge-subtle)', marginBottom: 2, flexShrink: 0 }}>
            <span style={{ flex: 1, fontSize: 7, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Setup</span>
            <span style={{ width: 30, fontSize: 7, color: 'var(--text-ghost)', textTransform: 'uppercase', textAlign: 'right', letterSpacing: '0.08em' }}>Win%</span>
            <span style={{ width: 32, fontSize: 7, color: 'var(--text-ghost)', textTransform: 'uppercase', textAlign: 'right', letterSpacing: '0.08em' }}>Avg R</span>
            <span style={{ width: 50, fontSize: 7, color: 'var(--text-ghost)', textTransform: 'uppercase', textAlign: 'right', letterSpacing: '0.08em' }}>P&L</span>
          </div>

          {/* Rows */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', overflow: 'hidden' }}>
            {setupStats.map((s) => {
              const barW = (Math.abs(s.pnl) / maxAbsPnl) * 100
              return (
                <div key={s.setup} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      flex: 1, fontSize: 10, fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 4,
                    }}>
                      {s.setup}
                    </span>
                    <span style={{ width: 30, fontSize: 10, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: s.winRate >= 50 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                      {s.winRate}%
                    </span>
                    <span style={{ width: 32, fontSize: 10, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: s.avgR != null && s.avgR >= 1 ? 'var(--color-positive)' : 'var(--text-quaternary)' }}>
                      {s.avgR != null ? `${s.avgR.toFixed(1)}R` : '—'}
                    </span>
                    <span style={{ width: 50, fontSize: 10, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: pnlColor(s.pnl) }}>
                      {fmtPnl(s.pnl, sym)}
                    </span>
                  </div>
                  <div style={{ height: 2, borderRadius: 99, background: 'var(--edge-subtle)' }}>
                    <div style={{
                      height: '100%', width: `${barW}%`, borderRadius: 99,
                      background: s.pnl >= 0 ? 'var(--color-positive-fill)' : 'var(--color-negative-fill)',
                      transition: 'width 500ms ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    default: {
      const slug  = type.split('/').pop() ?? type
      const label = slug
        .replace(/-([a-z])/g, (_: string, c: string) => ' ' + c.toUpperCase())
        .replace(/^[a-z]/, (c: string) => c.toUpperCase())
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '0 12px', boxSizing: 'border-box' }}>
          <span style={LABEL}>{label}</span>
        </div>
      )
    }
  }
}
