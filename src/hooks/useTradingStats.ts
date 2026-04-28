import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { computeMetrics } from '../utils/metrics'
import { getCurrencySymbol } from '../utils/fmt'
import { localToday } from '../utils/dates'
import {
  currentStreak as computeCurrentStreak,
  avgWin   as computeAvgWin,
  avgLoss  as computeAvgLoss,
} from '../utils/widgetMetrics'
import type { Outcome, Trade } from '../types'

// ── Public contract ──────────────────────────────────────────────────────────

/**
 * All derived trading statistics in one flat object.
 * Computed once per render cycle — widgets read from here, never self-calculate.
 */
export interface TradingStats {
  // ── Trade counts ────────────────────────────────────────────────────────
  totalTrades:  number
  wins:         number   // count of winning trades
  losses:       number   // count of losing trades

  // ── P&L ─────────────────────────────────────────────────────────────────
  totalPnl:    number
  grossWins:   number    // sum of winning trade P&L
  grossLosses: number    // absolute sum of losing trade P&L (positive)
  dailyPnl:    number    // today's net P&L
  weeklyPnl:   number    // trailing-7-day net P&L

  // ── Performance ratios ───────────────────────────────────────────────────
  winRate:      number         // 0–100
  profitFactor: number
  expectancy:   number         // average P&L per trade
  avgWinLoss:   number | null  // avg win ÷ avg loss (ratio)

  // ── Streaks ──────────────────────────────────────────────────────────────
  /** Current active streak. Positive = win streak, negative = loss streak. */
  currentStreak: number
  consecWins:    number  // longest win streak on record
  consecLosses:  number  // longest loss streak on record

  // ── Per-trade averages ───────────────────────────────────────────────────
  avgWin:  number   // average dollar gain on winning trades
  avgLoss: number   // average dollar magnitude of losing trades (positive)

  // ── Risk ─────────────────────────────────────────────────────────────────
  avgR:          number | null  // average R-multiple per trade
  maxDrawdown:   number         // peak-to-trough drawdown (positive)
  ruleFollowRate: number        // 0–100

  // ── Day / setup analytics ────────────────────────────────────────────────
  bestDay:   number
  worstDay:  number
  bestSetup: string | null

  // ── Recent history ───────────────────────────────────────────────────────
  /** Outcomes of the 5 most-recent trades (chronological), for sparkline dots. */
  recentOutcomes: Array<Outcome | null>
  /** Count of trades placed today. */
  tradesToday: number
  /** Last 5 trades, most-recent first, for the Recent Trades list widget. */
  recentTrades: Array<{
    id: string
    instrument: string
    side: 'long' | 'short'
    result: number
    outcome: Outcome | null
    date: string
    setupType: string
    session: string
  }>

  // ── Today's state (small widgets) ───────────────────────────────────────
  /** Trades placed today that had followedRules === false. */
  ruleBrokenToday: number
  /** Average trades per trading day across all history. */
  avgDailyTrades: number
  /** Today's session grade: A–F based on discipline + P&L. null if no trades today. */
  dayGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null

  // ── Overtrade pattern (medium widget) ────────────────────────────────────
  /** Trade count per day for the last 14 trading days, chronological. */
  tradesPerDayData: Array<{ date: string; count: number }>

  // ── Discipline tracking ──────────────────────────────────────────────────
  /** followedRules for the 10 most-recent trades, most-recent first. */
  recentRuleFollow: boolean[]
  /** Consecutive trades at end of history where followedRules is true. */
  ruleFollowStreak: number

  // ── Setup analytics ──────────────────────────────────────────────────────
  /** Per-setup breakdown, sorted by P&L descending, min 2 trades. */
  setupStats: Array<{
    setup:   string
    trades:  number
    wins:    number
    losses:  number
    winRate: number   // 0–100
    pnl:     number
    avgR:    number | null
  }>

  // ── Equity curve ─────────────────────────────────────────────────────────
  /** Cumulative P&L after each trading day, sorted chronologically. */
  equityCurve: Array<{ date: string; cumPnl: number }>

  // ── Daily P&L ────────────────────────────────────────────────────────────
  /** Net P&L per trading day for the last 20 trading days, chronological. */
  dailyPnlData: Array<{ date: string; pnl: number }>

  // ── Session breakdown ────────────────────────────────────────────────────
  /** Per-session stats derived from Trade.session, sorted by net P&L desc. */
  sessionStats: Array<{
    session: string
    trades:  number
    wins:    number
    losses:  number
    pnl:     number
    winRate: number  // 0–100, based on decisive trades only
  }>

  // ── Today's best setup ───────────────────────────────────────────────────
  /** The setup with the highest net P&L today, or null if no trades today. */
  bestSetupToday: { setup: string; pnl: number; trades: number } | null

  // ── Long / short bias ────────────────────────────────────────────────────
  biasStats: {
    long:  { trades: number; wins: number; losses: number; pnl: number; winRate: number }
    short: { trades: number; wins: number; losses: number; pnl: number; winRate: number }
  }

  // ── Display helpers ──────────────────────────────────────────────────────
  currencySymbol: string
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Central hook — single source of truth for all trading stats.
 *
 * Reads `trades` and `settings.currency` from the Zustand store via fine-grained
 * selectors, then computes the full stat set with `useMemo` so the work only
 * reruns when the underlying data actually changes.
 */
export function useTradingStats(): TradingStats {
  const trades   = useAppStore((s) => s.trades)
  const currency = useAppStore((s) => s.settings.currency)
  const timezone = useAppStore((s) => s.settings.timezone)

  return useMemo((): TradingStats => {
    const m = computeMetrics(trades, timezone)
    const today = localToday(timezone)

    // Chronological sort needed for streak dots and recency
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))

    return {
      // counts
      totalTrades: m.totalTrades,
      wins:   trades.filter((t) => t.outcome === 'win').length,
      losses: trades.filter((t) => t.outcome === 'loss').length,

      // P&L
      totalPnl:    m.totalPnl,
      grossWins:   m.grossWins,
      grossLosses: m.grossLosses,
      dailyPnl:    m.dailyPnl,
      weeklyPnl:   m.weeklyPnl,

      // ratios
      winRate:      m.winRate,
      profitFactor: m.profitFactor,
      expectancy:   m.expectancy,
      avgWinLoss:   m.avgWinLoss,

      // streaks
      currentStreak: computeCurrentStreak(trades),
      consecWins:    m.consecWins,
      consecLosses:  m.consecLosses,

      // per-trade averages
      avgWin:  computeAvgWin(trades),
      avgLoss: computeAvgLoss(trades),

      // risk
      avgR:           m.avgR,
      maxDrawdown:    m.maxDrawdown,
      ruleFollowRate: m.ruleFollowRate,

      // day / setup
      bestDay:   m.bestDay,
      worstDay:  m.worstDay,
      bestSetup: m.bestSetup,

      // recent outcomes for sparkline dots (last 5 trades chronologically)
      recentOutcomes: sorted.slice(-5).map((t) => t.outcome),

      // trades placed today
      tradesToday: trades.filter((t) => t.date === today).length,

      // last 5 trades, most-recent first
      recentTrades: sorted.slice(-5).reverse().map((t) => ({
        id:         t.id,
        instrument: t.instrument,
        side:       t.side,
        result:     t.result,
        outcome:    t.outcome,
        date:       t.date,
        setupType:  t.setupType,
        session:    t.session,
      })),

      // today's state metrics
      ruleBrokenToday: trades.filter((t) => t.date === today && !t.followedRules).length,

      avgDailyTrades: (() => {
        const byDate: Record<string, number> = {}
        trades.forEach((t) => { byDate[t.date] = (byDate[t.date] ?? 0) + 1 })
        const days = Object.keys(byDate).length
        return days > 0 ? trades.length / days : 0
      })(),

      dayGrade: (() => {
        const todayT = trades.filter((t) => t.date === today)
        if (todayT.length === 0) return null
        const ruleRate = (todayT.filter((t) => t.followedRules).length / todayT.length) * 100
        const pnl      = todayT.reduce((a, t) => a + t.result, 0)
        const maxRef   = Math.abs(m.worstDay) || 1
        const pnlScore = pnl > 0 ? 100
          : pnl === 0   ? 70
          : Math.abs(pnl) < maxRef * 0.25 ? 50
          : Math.abs(pnl) < maxRef * 0.5  ? 30
          : Math.abs(pnl) < maxRef        ? 10
          : 0
        const score = ruleRate * 0.6 + pnlScore * 0.4
        return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F'
      })(),

      // trade-count per day for overtrade detection (last 14 trading days)
      tradesPerDayData: (() => {
        const byDate: Record<string, number> = {}
        sorted.forEach((t) => { byDate[t.date] = (byDate[t.date] ?? 0) + 1 })
        return Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-14)
          .map(([date, count]) => ({ date, count }))
      })(),

      // rule follow history (last 10, most-recent first)
      recentRuleFollow: sorted.slice(-10).reverse().map((t) => t.followedRules),

      // consecutive trades from most-recent backward with followedRules true
      ruleFollowStreak: (() => {
        let n = 0
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].followedRules) n++
          else break
        }
        return n
      })(),

      // per-setup breakdown (min 2 trades, sorted by P&L desc)
      setupStats: (() => {
        const map: Record<string, {
          trades: number; wins: number; losses: number; pnl: number; rVals: number[]
        }> = {}
        trades.forEach((t) => {
          const key = t.setupType || 'Unknown'
          if (!map[key]) map[key] = { trades: 0, wins: 0, losses: 0, pnl: 0, rVals: [] }
          map[key].trades++
          map[key].pnl += t.result
          if (t.outcome === 'win')        map[key].wins++
          else if (t.outcome === 'loss')  map[key].losses++
          if (t.stopLoss > 0 && t.entry > 0 && t.entry !== t.stopLoss)
            map[key].rVals.push(t.result / Math.abs(t.entry - t.stopLoss))
        })
        return Object.entries(map)
          .map(([setup, d]) => ({
            setup,
            trades:  d.trades,
            wins:    d.wins,
            losses:  d.losses,
            pnl:     d.pnl,
            winRate: d.wins + d.losses > 0
              ? Math.round((d.wins / (d.wins + d.losses)) * 100) : 0,
            avgR: d.rVals.length > 0
              ? d.rVals.reduce((a, b) => a + b, 0) / d.rVals.length : null,
          }))
          .filter((s) => s.trades >= 2)
          .sort((a, b) => b.pnl - a.pnl)
      })(),

      // equity curve — cumulative P&L per trading day
      equityCurve: (() => {
        const byDate: Record<string, number> = {}
        sorted.forEach((t) => { byDate[t.date] = (byDate[t.date] ?? 0) + t.result })
        let cum = 0
        return Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, pnl]) => { cum += pnl; return { date, cumPnl: cum } })
      })(),

      // daily P&L — last 20 trading days
      dailyPnlData: (() => {
        const byDate: Record<string, number> = {}
        sorted.forEach((t) => { byDate[t.date] = (byDate[t.date] ?? 0) + t.result })
        return Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-20)
          .map(([date, pnl]) => ({ date, pnl }))
      })(),

      // session breakdown
      sessionStats: (() => {
        const map: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {}
        trades.forEach((t) => {
          const s = t.session || 'Other'
          if (!map[s]) map[s] = { trades: 0, wins: 0, losses: 0, pnl: 0 }
          map[s].trades++
          map[s].pnl += t.result
          if (t.outcome === 'win')  map[s].wins++
          else if (t.outcome === 'loss') map[s].losses++
        })
        return Object.entries(map)
          .map(([session, d]) => ({
            session,
            ...d,
            winRate: d.wins + d.losses > 0
              ? Math.round((d.wins / (d.wins + d.losses)) * 100)
              : 0,
          }))
          .sort((a, b) => b.pnl - a.pnl)
      })(),

      // today's best-performing setup by net P&L
      bestSetupToday: (() => {
        const map: Record<string, { pnl: number; trades: number }> = {}
        trades.filter((t) => t.date === today).forEach((t) => {
          const key = t.setupType || 'Unknown'
          if (!map[key]) map[key] = { pnl: 0, trades: 0 }
          map[key].pnl    += t.result
          map[key].trades += 1
        })
        const entries = Object.entries(map)
        if (entries.length === 0) return null
        const [setup, d] = entries.reduce((best, cur) => cur[1].pnl > best[1].pnl ? cur : best)
        return { setup, pnl: d.pnl, trades: d.trades }
      })(),

      // long / short bias breakdown
      biasStats: (() => {
        const make = () => ({ trades: 0, wins: 0, losses: 0, pnl: 0 })
        const l = make(), s = make()
        trades.forEach((t) => {
          const b = t.side === 'long' ? l : s
          b.trades++
          b.pnl += t.result
          if (t.outcome === 'win')       b.wins++
          else if (t.outcome === 'loss') b.losses++
        })
        const rate = (d: { wins: number; losses: number }) =>
          d.wins + d.losses > 0 ? Math.round((d.wins / (d.wins + d.losses)) * 100) : 0
        return {
          long:  { ...l, winRate: rate(l) },
          short: { ...s, winRate: rate(s) },
        }
      })(),

      // display
      currencySymbol: getCurrencySymbol(currency),
    }
  }, [trades, currency, timezone])
}
