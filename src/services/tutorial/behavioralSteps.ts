// ── Behavioral walkthrough ──────────────────────────────────────────────────
// The "show, don't tell" half of the tutorial.
//
// Trade-demo pacing (the important part):
//
//   • Step `demo-trade-fill-1` opens the AddTradeModal and typewriter-fills
//     every field on PANE 1 (instrument, side, prices, result, outcome,
//     setup, session). Then it STOPS. Tooltip stays up. User clicks Next.
//
//   • Step `demo-trade-fill-2` sends a second DemoScript that contains the
//     PANE 2 fields (reason, rules, emotions, journal). The modal's built-in
//     FIELD_STEP map flips the pane on the first pane-2 field, then
//     typewriter-fills the rest. STOPS. Tooltip stays up. User clicks Next.
//
//   • The next step after the demo (`recent-trades`, in steps.ts) closes
//     the modal on its `onEnter`.
//
// `autoSubmit: false` on both scripts means the form never submits — no
// transient trade is created, no rushed close-out. Each pane completes
// typing then waits for the user.

import type { TutorialStep } from './types'
import type { DemoScript } from './actions'
import type { Trade } from '../../types'
import { useAppStore } from '../../store/useAppStore'

// ── Live strategy resolver ──────────────────────────────────────────────────
// The demo used to bake `'Strategy 1'` into both the pane-1 script and the
// transient-trade factory. That desynced if the user renamed their default
// strategy before replaying the tutorial. Reading from the store at call
// time keeps the demo honest — it shows whatever the user actually has
// selected in the switcher. Falls back to `'Strategy 1'` only if the active
// id somehow fails to resolve, which would already be an inconsistent state.
function getActiveStrategyName(): string {
  const s = useAppStore.getState()
  return s.strategies.find((x) => x.id === s.activeStrategyId)?.name ?? 'Strategy 1'
}

// ── Transient-trade factory (retained for back-compat) ──────────────────────
// Not invoked while `autoSubmit: false`. Kept exported because App.tsx's
// `safeAddTrade` still references it.
export function makeDemoTransientTrade(dateStr: string): Trade {
  return {
    id: 'tutorial-transient-trade',
    date: dateStr,
    instrument: 'NQ',
    side: 'long',
    entry: 18420,
    stopLoss: 18400,
    takeProfit: 18470,
    result: 250,
    outcome: 'win',
    setupType: 'VWAP Reclaim',
    strategy: getActiveStrategyName(),
    session: 'Open',
    reasonForEntry: 'Clean reclaim of VWAP on the open; range extension with volume.',
    followedRules: true,
    emotionBefore: 'Focused',
    emotionDuring: 'Calm',
    didRight: 'Waited for confirmation before sizing in.',
    didWrong: 'Trimmed too early — left a third of the move on the table.',
    improve: 'Let runners breathe past the first target when the trend is clean.',
  }
}

// ── Per-pane scripts ────────────────────────────────────────────────────────
// Fields are grouped to match AddTradeModal's FIELD_STEP map exactly:
//   Pane 1 = instrument, side, entry, stopLoss, takeProfit, result, outcome,
//            setupType, session
//   Pane 2 = reasonForEntry, followedRules, emotionBefore, emotionDuring,
//            didRight, didWrong, improve

// Factory — called at dispatch time by the action runner (see actions.ts's
// `openAddTrade` case) so the `strategy` field reflects whatever the user
// has currently selected in the pre-trade checklist switcher, not a stale
// value baked at module load. All other fields stay static — they describe
// a fictional trade and don't need live data.
function makeDemoTradeScriptPane1(): DemoScript {
  return {
    typeDelayMs: 38,
    autoSubmit: false,
    // First script sent. Budget:
    //   • 380ms — modal's open-slide animation
    //   • 900ms — time for the user to read the tooltip before typing starts
    // The old design used a separate `wait: 900` action in onEnter BEFORE
    // `openAddTrade`, but that left the modal target missing from the DOM
    // past the overlay's 1020ms grace-period auto-advance, causing step 3
    // to silently skip to step 4. Baking the pause into initialDelayMs lets
    // us open the modal immediately (target present, no auto-advance) and
    // still hold off typing long enough to read the tooltip.
    initialDelayMs: 1280,
    fields: [
      // Strategy is the first field the demo "fills" so viewers see the
      // auto-wire from the active pre-trade checklist strategy into the
      // trade log. Value is read from store at dispatch time so a renamed
      // strategy still shows up correctly in replays. `instant: true`
      // because TagSelect chips don't animate a typewriter cleanly, and
      // the short pauseAfterMs gives the chip a beat to register before
      // the rest of the form starts typing.
      { key: 'strategy',   value: getActiveStrategyName(), instant: true, pauseAfterMs: 500 },
      { key: 'instrument', value: 'NQ',           typeDelayMs: 90 },
      { key: 'side',       value: 'long' },
      { key: 'entry',      value: '18420',        typeDelayMs: 55 },
      { key: 'stopLoss',   value: '18400',        typeDelayMs: 55 },
      { key: 'takeProfit', value: '18470',        typeDelayMs: 55 },
      { key: 'result',     value: '250',          typeDelayMs: 60, pauseAfterMs: 200 },
      { key: 'outcome',    value: 'win' },
      { key: 'setupType',  value: 'VWAP Reclaim', instant: true },
      { key: 'session',    value: 'Open',         instant: true },
    ],
  }
}

const DEMO_TRADE_SCRIPT_PANE2: DemoScript = {
  typeDelayMs: 38,
  autoSubmit: false,
  // Pane 2 runs against an already-open modal — no open-animation cost.
  initialDelayMs: 0,
  fields: [
    // First field here is on pane 2; FIELD_STEP auto-flips the pane before
    // typing begins (the modal waits 420ms for the transition).
    {
      key: 'reasonForEntry',
      value: 'Clean reclaim of VWAP on the open; range extension with volume.',
      instant: true,
      pauseAfterMs: 200,
    },
    { key: 'followedRules', value: 'true' },
    { key: 'emotionBefore', value: 'Focused',  instant: true },
    { key: 'emotionDuring', value: 'Calm',     instant: true },
    {
      key: 'didRight',
      value: 'Waited for confirmation before sizing in.',
      instant: true,
    },
    {
      key: 'didWrong',
      value: 'Trimmed too early — left a third of the move on the table.',
      instant: true,
    },
    {
      key: 'improve',
      value: 'Let runners breathe past the first target when the trend is clean.',
      instant: true,
    },
  ],
}

// ── Steps ───────────────────────────────────────────────────────────────────

export const BEHAVIORAL_TUTORIAL_STEPS: TutorialStep[] = [
  // ── 1. Calendar ─────────────────────────────────────────────────────────
  {
    id: 'demo-calendar-today',
    target: '#section-calendar',
    title: 'Your calendar',
    description: 'Each square is one day. Click any day to review it.',
    placement: 'top',
    onEnter: [
      { type: 'selectDate', date: 'today' },
      { type: 'pulseSelector', selector: '#section-calendar [data-today="true"]', ms: 1400 },
    ],
  },

  // ── 2. Trade — pane 1 (the setup) ───────────────────────────────────────
  // Opens the modal, types the full first pane, stops. User clicks Next.
  // Description is intentionally substantive: page 1 IS the heart of trade
  // logging and deserves more than a one-liner.
  {
    id: 'demo-trade-fill-1',
    target: '[data-tutorial="add-trade-modal"]',
    title: 'Logging a trade — the setup',
    description:
      'Page 1 captures the objective facts of the trade — everything that happened on the chart.\n\n' +
      '• Instrument & direction — what you traded, long or short\n' +
      '• Entry, stop and target — the plan you risked on\n' +
      '• Result & outcome — what actually happened in P&L\n' +
      '• Setup type & session — tags that power filters and stats later\n\n' +
      'Every trade you log follows this same shape, which is why your journal stays scannable as it grows. Click Next to see page 2.',
    placement: 'auto',
    tooltipWidth: 400,
    padding: 4,
    onEnter: [
      // Open the modal IMMEDIATELY so the spotlight target
      // `[data-tutorial="add-trade-modal"]` is in the DOM before the
      // overlay's 1020ms grace-period measures it. The read-the-tooltip
      // pause is baked into the script's `initialDelayMs` instead of a
      // separate wait action — see makeDemoTradeScriptPane1 for details.
      // Pass the factory (not an invocation) so the runner resolves the
      // active strategy name at dispatch time.
      { type: 'openAddTrade', demoScript: makeDemoTradeScriptPane1 },
    ],
  },

  // ── 3. Trade — pane 2 (the reflection) ──────────────────────────────────
  // Modal stays open. Sending the pane-2 script restarts the modal's
  // typewriter useEffect: cleanup cancels the pane-1 run (already finished
  // in practice, but safe), then the new run walks pane-2 fields only. The
  // first pane-2 field triggers FIELD_STEP's auto-flip to the reflection
  // pane before typing, so the flip is visible to the user.
  //
  // onExit — the 4 → 5 handoff.
  //
  //   Two things have to happen before step 5 (`recent-trades`) can land
  //   cleanly:
  //     (a) the AddTradeModal has to fully exit (220ms scale+fade)
  //     (b) `#section-recent-trades` — which sits below the fold on most
  //         viewports — has to be scrolled INTO view
  //
  //   Previously only (a) was handled here, so step 5's first act was to
  //   scrollIntoView the target itself. That scroll (300–500ms) ran
  //   AFTER the index had already flipped, meaning step 5's tooltip was
  //   already on screen with its new content but still pinned to step 4's
  //   modal anchor, while the page scrolled beneath it. The tooltip
  //   appeared to float as the page slid away. Textbook jumpy handoff.
  //
  //   Running BOTH (a) and (b) here — in parallel — is the fix. The
  //   modal fades while the page smooth-scrolls to Recent Trades, all
  //   while the step 4 tooltip stays anchored to the vacating modal slot.
  //   By the time wait completes, the modal is gone AND Recent Trades is
  //   already in view, so step 5 enters a settled viewport and the
  //   spotlight + tooltip tween a short, deliberate distance.
  //
  //   Timing budget:
  //     T=0       user clicks Next
  //     T=0       closeAddTrade → modal starts 220ms exit
  //     T=0       scrollIntoView → browser smooth-scrolls Recent Trades
  //               to viewport center (~320–500ms depending on distance)
  //     T=0–540   step 4 tooltip frozen on modal rect; user sees modal
  //               fade + page compose itself beneath it
  //     T=540     wait completes → index advances → step 5 enters clean
  //               viewport, short position tween to its anchor
  //
  //   540ms is the wait tuned from:
  //     • 220ms modal exit
  //     • up to 500ms for the longest likely smooth scroll
  //     • cap at 540 so the overall "step 4 settles" beat still feels
  //       responsive rather than sluggish. In practice the scroll
  //       finishes well under the cap on typical viewports.
  {
    id: 'demo-trade-fill-2',
    target: '[data-tutorial="add-trade-modal"]',
    title: 'Logging a trade — the reflection',
    description:
      'Page 2 is where trades turn into lessons — the part most journals skip.\n\n' +
      '• Reason for entry — your one-line thesis going in\n' +
      '• Followed rules — the yes/no that outranks any single P&L\n' +
      '• Emotion before & during — surface patterns you can\u2019t see from numbers alone\n' +
      '• What went right, wrong, and how to improve — the feedback loop\n\n' +
      'Over time this pane is what separates a traders\u2019 journal from a spreadsheet. Click Next to close the form and keep exploring.',
    placement: 'auto',
    tooltipWidth: 400,
    padding: 4,
    onEnter: [
      { type: 'openAddTrade', demoScript: DEMO_TRADE_SCRIPT_PANE2 },
    ],
    onExit: [
      { type: 'closeAddTrade' },
      { type: 'scrollIntoView', selector: '#section-recent-trades', block: 'center' },
      { type: 'wait', ms: 540 },
    ],
  },
]
