/**
 * Static demo data for the marketing-site preview.
 *
 * Shaped to the real app's `Trade` and `ChecklistStrategy` types so it feeds
 * directly into the real components. Setup names and checklist items are
 * deliberately generic (no personal strategy terminology) so the preview
 * reads as product, not personal playbook.
 *
 * SAFETY
 *   - Pure data, no side effects
 *   - Loaded into the sandboxed store on preview mount
 *   - Never writes real localStorage (see storage-sandbox.ts)
 */

import type { Trade, ChecklistStrategy } from '../../types'

export const DEMO_STARTING_BALANCE = 50000

export const DEMO_TRADES: Trade[] = [
  mk('t01', '2026-04-02', 'ES', 'long',  'Breakout',    'Trend',       'Morning',   'Broke the prior-day high with momentum',  4512.25, 4498.50, 4546.00,  472, 'win'),
  mk('t02', '2026-04-02', 'ES', 'short', 'Pullback',    'Mean revert', 'Morning',   'Rejected the overnight high',              4584.50, 4588.75, 4575.00,  228, 'win'),
  mk('t03', '2026-04-02', 'ES', 'long',  'Reversal',    'Trend',       'Morning',   'Failed reclaim after sweep',               4488.00, 4480.50, 4515.00, -164, 'loss'),
  mk('t04', '2026-04-03', 'GC', 'long',  'Continuation','Trend',       'Morning',   'Higher-timeframe structure in agreement',  2384.60, 2381.40, 2392.00,  710, 'win'),
  mk('t05', '2026-04-04', 'ES', 'short', 'Breakout',    'Trend',       'Morning',   'Failed breakout at prior high',            4576.00, 4586.25, 4555.00, -150, 'loss'),
  mk('t06', '2026-04-07', 'ES', 'long',  'Pullback',    'Trend',       'Afternoon', 'Clean retest of breakout level',           4520.00, 4510.25, 4548.00,  434, 'win'),
  mk('t07', '2026-04-08', 'ES', 'long',  'Range',       'Mean revert', 'Morning',   'Range support held with volume',           4540.25, 4537.50, 4546.00,  186, 'win'),
  mk('t08', '2026-04-08', 'ES', 'long',  'Breakout',    'Trend',       'Afternoon', 'Tight consolidation broke upward',          4510.00, 4498.00, 4542.00,  392, 'win'),
  mk('t09', '2026-04-10', 'ES', 'short', 'News',        'Mean revert', 'Morning',   'News spike reverted to the mean',          4495.00, 4510.00, 4465.00, -208, 'loss'),
  mk('t10', '2026-04-11', 'ES', 'long',  'Breakout',    'Trend',       'Morning',   'Second attempt broke clean',                4488.00, 4478.50, 4516.00,  372, 'win'),
  mk('t11', '2026-04-12', 'GC', 'long',  'Continuation','Trend',       'Morning',   'Structure continuation with correlation',   2352.10, 2349.60, 2358.00,  540, 'win'),
  mk('t12', '2026-04-15', 'ES', 'long',  'Breakout',    'Trend',       'Morning',   'Multi-timeframe alignment',                 4580.00, 4565.00, 4620.00,  624, 'win'),
  mk('t13', '2026-04-15', 'ES', 'long',  'Pullback',    'Mean revert', 'Afternoon', 'Shallow pullback held on first test',       4610.00, 4605.75, 4620.00,  292, 'win'),
  mk('t14', '2026-04-16', 'ES', 'short', 'News',        'Mean revert', 'Morning',   'FOMC spike reverted back to VWAP',         4622.00, 4635.00, 4590.00, -112, 'loss'),
  mk('t15', '2026-04-17', 'ES', 'long',  'Reversal',    'Trend',       'Morning',   'Structure break confirmed',                 4602.00, 4586.00, 4640.00,  472, 'win'),
  mk('t16', '2026-04-18', 'ES', 'long',  'Continuation','Trend',       'Morning',   'Cleared the overnight range',               4680.00, 4668.00, 4708.00,  186, 'win'),
  mk('t17', '2026-04-21', 'GC', 'long',  'Continuation','Trend',       'Morning',   'Daily continuation with correlation',       2368.40, 2364.90, 2378.00,  540, 'win'),
  mk('t18', '2026-04-22', 'ES', 'long',  'Breakout',    'Trend',       'Morning',   'Tight range broke with momentum',           4740.00, 4728.50, 4772.00,  332, 'win'),
  mk('t19', '2026-04-23', 'ES', 'long',  'Breakout',    'Trend',       'Morning',   'First leg up, held pullback to open',       4810.00, 4798.00, 4840.00,  472, 'win'),
  mk('t20', '2026-04-23', 'ES', 'short', 'Pullback',    'Mean revert', 'Morning',   'Quick mitigation into supply',              4834.50, 4838.75, 4826.00,  228, 'win'),
  mk('t21', '2026-04-23', 'ES', 'long',  'Reversal',    'Trend',       'Morning',   'Reclaim attempt failed',                    4782.00, 4774.50, 4808.00, -164, 'loss'),
  mk('t22', '2026-04-23', 'GC', 'long',  'Continuation','Trend',       'Afternoon', 'Clean continuation with higher low',        2390.60, 2387.40, 2398.00,  710, 'win'),
  mk('t23', '2026-04-23', 'ES', 'short', 'Breakout',    'Trend',       'Morning',   'Failed breakout rejection',                 4796.00, 4806.00, 4776.00,  372, 'win'),
]

// Two short demo strategies — preview uses these to showcase the switcher.
// Each one stays small on purpose so the preview reads as clean instead of
// crowded. Items are generic and don't claim Nookra teaches strategies.
export const DEMO_STRATEGIES: ChecklistStrategy[] = [
  {
    id: 'breakout',
    name: 'Breakout',
    items: [
      { id: 'b1', kind: 'item', text: 'Range marked',         checked: true  },
      { id: 'b2', kind: 'item', text: 'Risk planned',         checked: true  },
      { id: 'b3', kind: 'item', text: 'Entry reason written', checked: false },
    ],
  },
  {
    id: 'pullback',
    name: 'Pullback',
    items: [
      { id: 'p1', kind: 'item', text: 'Level marked',         checked: true  },
      { id: 'p2', kind: 'item', text: 'Risk planned',         checked: false },
      { id: 'p3', kind: 'item', text: 'Entry reason written', checked: false },
    ],
  },
]

export const DEMO_ACTIVE_STRATEGY_ID = 'breakout'

// ─────────────────────────────────────────────────────────────────────────────

function mk(
  id: string,
  date: string,
  instrument: string,
  side: 'long' | 'short',
  setupType: string,
  strategy: string,
  session: string,
  reasonForEntry: string,
  entry: number,
  stopLoss: number,
  takeProfit: number,
  result: number,
  // Match the Outcome type in src/types/index.ts (no 'be' shortcut).
  outcome: 'win' | 'loss' | 'breakeven',
): Trade {
  return {
    id, date, instrument, side, setupType, strategy, session, reasonForEntry,
    entry, stopLoss, takeProfit, result, outcome,
    followedRules: outcome !== 'loss',
    emotionBefore: 'Calm',
    emotionDuring: 'Focused',
    didRight: '',
    didWrong: '',
    improve: '',
  }
}
