import { Trade } from '../types'
import { localToday, daysAgoInTz } from './dates'

export interface ComputedMetrics {
  // Header-ready
  winRate: number           // 0–100
  totalPnl: number
  avgWinLoss: number | null // avg win ÷ avg loss
  profitFactor: number
  expectancy: number
  maxDrawdown: number       // positive number = max peak-to-trough drop
  bestDay: number
  worstDay: number
  avgR: number | null       // average R multiple per trade
  consecWins: number        // longest consecutive win streak
  consecLosses: number      // longest consecutive loss streak
  ruleFollowRate: number    // 0–100
  // Supporting
  dailyPnl: number
  weeklyPnl: number
  totalTrades: number
  bestSetup: string | null
  grossWins: number
  grossLosses: number
}

export function computeMetrics(trades: Trade[], timezone = 'UTC'): ComputedMetrics {
  const today   = localToday(timezone)
  const weekAgo = daysAgoInTz(timezone, 7)

  const wins        = trades.filter((t) => t.outcome === 'win')
  const losses      = trades.filter((t) => t.outcome === 'loss')
  const withOutcome = trades.filter((t) => t.outcome !== null)
  const todayTrades = trades.filter((t) => t.date === today)
  const weekTrades  = trades.filter((t) => t.date >= weekAgo)

  const grossWins   = wins.reduce((a, t) => a + t.result, 0)
  const grossLosses = Math.abs(losses.reduce((a, t) => a + t.result, 0))
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : wins.length > 0 ? Infinity : 0
  const totalPnl     = trades.reduce((a, t) => a + t.result, 0)
  const expectancy   = trades.length > 0 ? totalPnl / trades.length : 0

  const avgWin = wins.length > 0 ? grossWins / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLosses / losses.length : 0
  const avgWinLoss = avgLoss > 0 ? avgWin / avgLoss : null

  // Setup PnL
  const setupPnl: Record<string, number> = {}
  trades.forEach((t) => {
    if (t.setupType) setupPnl[t.setupType] = (setupPnl[t.setupType] || 0) + t.result
  })
  const bestSetup = Object.entries(setupPnl).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Max drawdown (peak-to-trough on cumulative PnL, sorted by date)
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  let runningPnl = 0, peak = 0, maxDrawdown = 0
  sorted.forEach((t) => {
    runningPnl += t.result
    if (runningPnl > peak) peak = runningPnl
    const dd = peak - runningPnl
    if (dd > maxDrawdown) maxDrawdown = dd
  })

  // Best day / worst day
  const byDay: Record<string, number> = {}
  trades.forEach((t) => { byDay[t.date] = (byDay[t.date] || 0) + t.result })
  const dayValues = Object.values(byDay)
  const bestDay  = dayValues.length ? Math.max(...dayValues) : 0
  const worstDay = dayValues.length ? Math.min(...dayValues) : 0

  // Avg R per trade (only trades where risk can be computed)
  const tradesWithR = trades.filter(
    (t) => t.stopLoss > 0 && t.entry > 0 && t.entry !== t.stopLoss
  )
  const avgR = tradesWithR.length > 0
    ? tradesWithR.reduce((a, t) => a + t.result / Math.abs(t.entry - t.stopLoss), 0) / tradesWithR.length
    : null

  // Consecutive wins / losses (longest streak)
  let consecWins = 0, consecLosses = 0, curW = 0, curL = 0
  sorted.forEach((t) => {
    if (t.outcome === 'win') { curW++; curL = 0 }
    else if (t.outcome === 'loss') { curL++; curW = 0 }
    else { curW = 0; curL = 0 }
    if (curW > consecWins) consecWins = curW
    if (curL > consecLosses) consecLosses = curL
  })

  // Rule follow rate
  const ruleFollowRate = trades.length > 0
    ? Math.round((trades.filter((t) => t.followedRules).length / trades.length) * 100)
    : 0

  return {
    winRate: withOutcome.length ? Math.round((wins.length / withOutcome.length) * 100) : 0,
    totalPnl,
    avgWinLoss,
    profitFactor,
    expectancy,
    maxDrawdown,
    bestDay,
    worstDay,
    avgR,
    consecWins,
    consecLosses,
    ruleFollowRate,
    dailyPnl:  todayTrades.reduce((a, t) => a + t.result, 0),
    weeklyPnl: weekTrades.reduce((a, t) => a + t.result, 0),
    totalTrades: trades.length,
    bestSetup,
    grossWins,
    grossLosses,
  }
}
