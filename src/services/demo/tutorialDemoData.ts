// ── Tutorial Demo Data ──────────────────────────────────────────────────────
// Generates a realistic set of trades dated TODAY, used ONLY while the
// tutorial is running. This is separate from the trial-seed demo data in
// `services/licensing/demoData.ts`:
//
//   • Trial-seed writes to localStorage and spreads trades over ~10 days so
//     the calendar looks populated for the length of the trial.
//   • Tutorial-demo is INJECTED through a hook swap at render time — it is
//     never written to storage. Exiting the tutorial returns the user to
//     whatever real state they actually have (usually an empty journal).
//
// The trades are hand-tuned, not randomly generated. We want the demo to
// feel like a good-but-imperfect trader's day: a winning majority, one or
// two losses with honest self-critique, varied setups/sessions so the
// filters and widgets have something to show. Random garbage would defeat
// the whole point of demo mode — the user must see a journal that looks
// plausible, not a debug fixture.

import type { Trade } from '../../types'
import { localToday } from '../../utils/dates'

export interface TutorialDemoBundle {
  trades: Trade[]
  startingBalance: number
}

/** Build the set of demo trades for TODAY (in the user's IANA timezone).
 *  Six trades, mixed outcomes, realistic sizes and self-review text. Net
 *  PnL is intentionally positive but NOT euphoric — a +$1,330 day beats
 *  a +$5,000 one because the user should see what a realistic good day
 *  looks like, not a lottery ticket. */
export function generateTutorialDemoData(tz: string): TutorialDemoBundle {
  const today = localToday(tz)

  const trades: Trade[] = [
    {
      id: 'tutorial-demo-01',
      date: today,
      instrument: 'NQ',
      side: 'long',
      entry: 19840,
      stopLoss: 19810,
      takeProfit: 19910,
      result: 420,
      outcome: 'win',
      setupType: 'VWAP Reclaim',
      session: 'Open',
      reasonForEntry:
        'Reclaim of VWAP on strong volume, aligned with HTF trend. Waited for the confirmation candle before sizing in.',
      followedRules: true,
      emotionBefore: 'Focused',
      emotionDuring: 'Calm',
      didRight: 'Patient entry, correct size, held to planned target',
      didWrong: 'Exited slightly early — a few ticks before full TP',
      improve: 'Trust the setup. Let the runner complete when structure holds.',
    },
    {
      id: 'tutorial-demo-02',
      date: today,
      instrument: 'ES',
      side: 'short',
      entry: 5512,
      stopLoss: 5520,
      takeProfit: 5492,
      result: -160,
      outcome: 'loss',
      setupType: 'Failed Breakout',
      session: 'Open',
      reasonForEntry:
        'Rejection at prior-day high with weakening bids. Anticipated failed breakout to drive price back into range.',
      followedRules: true,
      emotionBefore: 'Confident',
      emotionDuring: 'Anxious',
      didRight: 'Correct setup read. Cut loss at planned stop — no averaging down.',
      didWrong: 'Entered before the candle closed, caught a wick and stopped.',
      improve: 'Wait for candle close before entering reversal setups.',
    },
    {
      id: 'tutorial-demo-03',
      date: today,
      instrument: 'NQ',
      side: 'long',
      entry: 19760,
      stopLoss: 19730,
      takeProfit: 19850,
      result: 600,
      outcome: 'win',
      setupType: 'Opening Drive',
      session: 'Open',
      reasonForEntry:
        'Strong gap-up with trend-day characteristics. First pullback to the 9 EMA held — textbook OD continuation.',
      followedRules: true,
      emotionBefore: 'Calm',
      emotionDuring: 'Focused',
      didRight: 'Full position on high conviction, held to target without second-guessing.',
      didWrong: 'Nothing significant.',
      improve: 'Consider a scale-in on the second pullback for larger size on trend days.',
    },
    {
      id: 'tutorial-demo-04',
      date: today,
      instrument: 'AAPL',
      side: 'long',
      entry: 214.2,
      stopLoss: 213.4,
      takeProfit: 216.1,
      result: 235,
      outcome: 'win',
      setupType: 'Bull Flag',
      session: 'Midday',
      reasonForEntry:
        'Clean bull flag after a morning drive. Tight consolidation on declining volume — classic continuation structure.',
      followedRules: true,
      emotionBefore: 'Focused',
      emotionDuring: 'Calm',
      didRight: 'Patient entry. Let the flag fully form before taking the break.',
      didWrong: 'Position size was a notch conservative for the setup quality.',
      improve: 'Grade setups A/B/C and size A setups at full allocation.',
    },
    {
      id: 'tutorial-demo-05',
      date: today,
      instrument: 'NQ',
      side: 'short',
      entry: 20100,
      stopLoss: 20130,
      takeProfit: 20020,
      result: -75,
      outcome: 'loss',
      setupType: 'Distribution',
      session: 'Midday',
      reasonForEntry:
        'HTF resistance with distribution tape. Took half size given midday chop risk.',
      followedRules: true,
      emotionBefore: 'Neutral',
      emotionDuring: 'Calm',
      didRight: 'Reduced size for the lower-quality window. Stopped out cleanly at plan.',
      didWrong: 'Probably should have skipped midday entirely.',
      improve: 'Only trade midday on A+ setups. Default to sitting out.',
    },
    {
      id: 'tutorial-demo-06',
      date: today,
      instrument: 'ES',
      side: 'long',
      entry: 5530,
      stopLoss: 5520,
      takeProfit: 5555,
      result: 310,
      outcome: 'win',
      setupType: 'VWAP Reclaim',
      session: 'Power Hour',
      reasonForEntry:
        'End-of-day VWAP reclaim with strong volume. Good R:R off the reclaim level.',
      followedRules: true,
      emotionBefore: 'Calm',
      emotionDuring: 'Calm',
      didRight: 'Well-timed entry, full target hit.',
      didWrong: 'Could have trailed a portion for the extended close.',
      improve: 'On trend days, trail runners into the close rather than flat-exit.',
    },
  ]

  return {
    trades,
    // A round reference balance that makes the PnL numbers read naturally
    // against the stats (e.g. ~1.3% up-day). Not tied to anything real.
    startingBalance: 25000,
  }
}
