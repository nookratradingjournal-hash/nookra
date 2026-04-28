import { Trade } from '../types'

/**
 * Current active streak (ignores breakeven trades).
 *  > 0  →  N consecutive wins   (e.g. +3 = 3-win streak)
 *  < 0  →  N consecutive losses  (e.g. -2 = 2-loss streak)
 *    0  →  no decisive trades yet
 */
export function currentStreak(trades: Trade[]): number {
  // Strip breakeens and sort chronologically
  const decisive = [...trades]
    .filter((t) => t.outcome === 'win' || t.outcome === 'loss')
    .sort((a, b) => a.date.localeCompare(b.date))

  if (decisive.length === 0) return 0

  const lastOutcome = decisive[decisive.length - 1].outcome
  let count = 0
  for (let i = decisive.length - 1; i >= 0; i--) {
    if (decisive[i].outcome === lastOutcome) count++
    else break
  }
  return lastOutcome === 'win' ? count : -count
}

/** Average dollar amount of winning trades (positive, 0 if no wins). */
export function avgWin(trades: Trade[]): number {
  const wins = trades.filter((t) => t.outcome === 'win')
  if (wins.length === 0) return 0
  return wins.reduce((a, t) => a + t.result, 0) / wins.length
}

/** Average dollar magnitude of losing trades (positive, 0 if no losses). */
export function avgLoss(trades: Trade[]): number {
  const losses = trades.filter((t) => t.outcome === 'loss')
  if (losses.length === 0) return 0
  return Math.abs(losses.reduce((a, t) => a + t.result, 0)) / losses.length
}
