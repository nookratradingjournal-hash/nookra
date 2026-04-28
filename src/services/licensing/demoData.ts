// ── Demo Data Seeder ─────────────────────────────────────────────────────────
// Seeds realistic sample trades into localStorage for trial mode.
// Dates are relative to the current date so the journal feels alive.

import type { Trade } from '../../types'
import { markTrialSeeded, setDataMode } from './dataMode'

/** Returns a date string YYYY-MM-DD offset by `daysAgo` from today */
function ago(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

/**
 * A compact set of 8 realistic trades spread across the last ~10 days.
 * Covers multiple instruments, setups, sessions, emotions, and outcomes
 * so the app feels like a real journal on first launch.
 */
function buildDemoTrades(): Trade[] {
  return [
    {
      id: 'demo-01', date: ago(9), instrument: 'NQ', side: 'long',
      entry: 19840, stopLoss: 19810, takeProfit: 19910, result: 420, outcome: 'win',
      setupType: 'VWAP Reclaim', session: 'Open',
      reasonForEntry: 'Clean reclaim of VWAP with volume confirmation, HTF trend aligned',
      followedRules: true, emotionBefore: 'Focused', emotionDuring: 'Calm',
      didRight: 'Waited for confirmation, sized correctly',
      didWrong: 'Exited slightly early before full TP',
      improve: 'Trust the setup and let it run to full target',
    },
    {
      id: 'demo-02', date: ago(9), instrument: 'ES', side: 'short',
      entry: 5512, stopLoss: 5520, takeProfit: 5492, result: -160, outcome: 'loss',
      setupType: 'Failed Breakout', session: 'Open',
      reasonForEntry: 'Rejection at previous day high, weak bid',
      followedRules: true, emotionBefore: 'Confident', emotionDuring: 'Anxious',
      didRight: 'Correct setup identification',
      didWrong: 'Entered too early before candle close confirmation',
      improve: 'Wait for candle close before entry on reversal setups',
    },
    {
      id: 'demo-03', date: ago(7), instrument: 'NQ', side: 'long',
      entry: 19760, stopLoss: 19730, takeProfit: 19850, result: 600, outcome: 'win',
      setupType: 'Opening Drive', session: 'Open',
      reasonForEntry: 'Strong gap up, trend day setup, first pullback to 9 EMA',
      followedRules: true, emotionBefore: 'Calm', emotionDuring: 'Focused',
      didRight: 'Full position, held to target',
      didWrong: 'Nothing significant',
      improve: 'Could scale in on second entry for larger size',
    },
    {
      id: 'demo-04', date: ago(5), instrument: 'ES', side: 'long',
      entry: 5498, stopLoss: 5490, takeProfit: 5520, result: 550, outcome: 'win',
      setupType: 'Bull Flag', session: 'Open',
      reasonForEntry: 'Textbook bull flag after opening drive, tight consolidation',
      followedRules: true, emotionBefore: 'Focused', emotionDuring: 'Calm',
      didRight: 'Patient entry, let the flag form fully',
      didWrong: 'None',
      improve: 'Continue being patient with entries',
    },
    {
      id: 'demo-05', date: ago(4), instrument: 'NQ', side: 'short',
      entry: 20100, stopLoss: 20130, takeProfit: 20020, result: -300, outcome: 'loss',
      setupType: 'Distribution', session: 'Midday',
      reasonForEntry: 'HTF resistance, distribution pattern forming',
      followedRules: false, emotionBefore: 'Greedy', emotionDuring: 'Anxious',
      didRight: 'Stopped out at planned level',
      didWrong: 'Traded midday chop, ignored rules',
      improve: 'Do not trade midday unless A+ setup',
    },
    {
      id: 'demo-06', date: ago(3), instrument: 'NQ', side: 'long',
      entry: 19920, stopLoss: 19890, takeProfit: 19990, result: 350, outcome: 'win',
      setupType: 'VWAP Reclaim', session: 'Power Hour',
      reasonForEntry: 'EOD VWAP reclaim with strong volume',
      followedRules: true, emotionBefore: 'Calm', emotionDuring: 'Calm',
      didRight: 'Great timing on entry',
      didWrong: 'Position size was conservative',
      improve: 'Size up on high conviction power hour setups',
    },
    {
      id: 'demo-07', date: ago(1), instrument: 'ES', side: 'long',
      entry: 5530, stopLoss: 5520, takeProfit: 5555, result: 480, outcome: 'win',
      setupType: 'Bull Flag', session: 'Open',
      reasonForEntry: 'Clean flag after gap-up open, volume confirmed',
      followedRules: true, emotionBefore: 'Focused', emotionDuring: 'Focused',
      didRight: 'Held full position to target',
      didWrong: 'Could have trailed for more',
      improve: 'Consider trailing on trend days',
    },
    {
      id: 'demo-08', date: ago(1), instrument: 'NQ', side: 'short',
      entry: 20050, stopLoss: 20075, takeProfit: 19980, result: -250, outcome: 'loss',
      setupType: 'Reversal', session: 'Midday',
      reasonForEntry: 'Overextended move, reversal candle at resistance',
      followedRules: false, emotionBefore: 'Revenge', emotionDuring: 'Anxious',
      didRight: 'Identified the zone correctly',
      didWrong: 'Revenge traded after morning loss',
      improve: 'Walk away after a loss, do not revenge trade',
    },
  ]
}

/**
 * Seed demo data into localStorage for trial mode.
 * Sets trades, starting balance, and a focus note.
 */
export function seedDemoData(): void {
  const trades = buildDemoTrades()

  localStorage.setItem('tj-trades-v2', JSON.stringify(trades))
  localStorage.setItem('tj-starting-balance', '25000')
  localStorage.setItem('tj-focus-note', 'Focus on A+ setups only. No midday trades unless conviction is high.')

  setDataMode('trial')
  markTrialSeeded()
}
