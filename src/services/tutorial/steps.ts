// ── Main-app walkthrough ────────────────────────────────────────────────────
// The first-run tour. Ordered to follow the user's natural gaze down the
// main column, then out to the header controls (which auto-open their
// panels so the tour can actually SHOW what's inside). One sentence per
// step; each step surfaces ONE purpose so nothing overwhelms.
//
// Targets rely on data-tutorial anchors (preferred) or stable section IDs
// that are already in the markup. The Widgets step targets the opened
// Widgets drawer; the `settings-*` steps target individual controls inside
// the Settings panel. App.tsx listens to the active step id and opens the
// Settings panel (plus the correct nav section) for each sub-step, so the
// spotlight always has a real element to land on.
//
// Settings sub-steps are intentionally picked to cover only HIGH-IMPACT
// controls — things that change how the app feels or how numbers are
// calculated. Obvious / low-value toggles are left out so the sequence
// doesn't overwhelm a first-time user. The last `settings-*` step triggers
// the panel close-out in App.tsx's scene controller.
//
// If a target can't be found at runtime, the overlay silently advances to
// the next step rather than hanging.

import type { TutorialStep } from './types'
import { BEHAVIORAL_TUTORIAL_STEPS } from './behavioralSteps'

export const MAIN_TUTORIAL_STEPS: TutorialStep[] = [
  // Note: the old `calendar` step was removed — the behavioral
  // `demo-calendar-today` step already explains the same concept AND
  // pulses today's cell, so a static tooltip restating it was pure
  // duplication.
  {
    id: 'recent-trades',
    target: '#section-recent-trades',
    title: 'Jump to any day',
    description:
      'Click any row in Recent Trades to open that day\u2019s log instantly — fastest way to revisit or edit a trade.',
    placement: 'top',
    // Modal teardown now happens in the PREVIOUS step's onExit (see
    // `demo-trade-fill-2` in behavioralSteps.ts), which holds step 4 on
    // screen long enough for the 220ms modal-exit animation to complete
    // before the index advances. By the time this step renders, the
    // viewport is clean — no redundant close action needed here.
    //
    // We keep closeAddTrade as a safety net: if a user reaches this step
    // via Replay or by skipping mid-flow (onExit won't have fired), the
    // call ensures the modal is gone before the spotlight tweens.
    onEnter: [
      { type: 'closeAddTrade' },
    ],
  },
  {
    id: 'checklist',
    target: '#section-checklist',
    title: 'Pre-trade checklist',
    description:
      'Review your criteria before every trade — tick each rule to confirm the setup is clean.',
    placement: 'bottom',
  },
  {
    id: 'strategy-switcher',
    target: '[data-tutorial="strategy-switcher"]',
    title: 'Run multiple strategies',
    description:
      'Keep a separate checklist for each strategy — use ◀ ▶ to switch, + to create, and click the name to rename. The selected strategy auto-fills when you add a trade.',
    placement: 'bottom',
    tooltipWidth: 360,
  },
  {
    id: 'stats',
    target: '[data-tutorial="stats"]',
    title: 'Performance at a glance',
    description:
      'Balance, P&L and win rate update automatically as you log trades.',
    placement: 'bottom',
  },
  // ── Widgets sub-walkthrough ───────────────────────────────────────────────
  // Progressive onboarding for the Widgets drawer. All three size sections
  // auto-expand while any `widgets*` step is active (handled in App.tsx).
  // The `widgets-highlight` step is ADVANCE-ON-EVENT — App.tsx listens for
  // the first widget placement and calls tutorial.next() so the user
  // learns by doing, not by reading.
  {
    id: 'widgets',
    // When this step is active, App.tsx opens the Widgets drawer so the
    // spotlight can land inside it. `[data-tutorial="widgets-menu"]` is
    // on the drawer root.
    //
    // We ALSO fire an explicit `openWidgetMenu` action on entry. The scene
    // controller in App.tsx opens the drawer via a useEffect tied to
    // `tutorialStepId`, but that can race the overlay's target lookup —
    // the spotlight can resolve before the drawer has rendered, find no
    // match, and silently skip. Driving the open through the action engine
    // (which waits for the drawer's 220ms slide-in) makes the step land
    // deterministically, regardless of what step preceded it.
    target: '[data-tutorial="widgets-menu"]',
    title: 'Customize your dashboard',
    description:
      'Widgets are insight cards you can place on the side rails. Three sizes — Small, Medium, and Large — each suited to a different level of detail.',
    placement: 'left',
    tooltipWidth: 340,
    onEnter: [
      { type: 'openWidgetMenu' },
      // Bumped from 260 → 360. The drawer's slide-in transition is 300ms
      // (`duration-300` on the panel). 260 left a 40ms window where the
      // overlay's polling loop sampled the drawer mid-animation, so the
      // spotlight + tooltip occasionally landed on the in-flight rect
      // (drawer still partly off-screen to the right) before settling.
      // 360 gives the slide a full 60ms to settle before measurement.
      { type: 'wait', ms: 360 },
    ],
  },
  {
    id: 'widgets-highlight',
    // Anchors directly to the Daily Risk small widget so the spotlight
    // isolates one card. App.tsx auto-advances this step when a widget
    // is dropped — the user learns by doing.
    target: '[data-tutorial="widget-daily-risk"]',
    title: 'Drag this into your dashboard',
    description:
      'Grab Daily Risk and drop it onto either side rail. The rails highlight available slots as you drag.',
    placement: 'left',
    tooltipWidth: 320,
    padding: 8,
  },
  // Note: the old `widgets-sizes` step was removed. The three sizes are
  // restated in the `widgets` step's body copy — a dedicated step was pure
  // repetition.

  // ── Settings sub-walkthrough ──────────────────────────────────────────────
  // The scene controller opens the Settings panel AND switches its active
  // section for each of these steps. Each sub-step targets a single control
  // inside the panel, so the spotlight lands on exactly what the tooltip
  // describes. Placement is 'left' because the panel lives on the right
  // edge — tooltips appear in the spare space to the left.
  {
    id: 'settings-font',
    target: '[data-tutorial="settings-font"]',
    title: 'Font size',
    description:
      'Sets the text size across the whole app — calendar, journal, stats and widgets all follow.\n• Small — denser layout, more on screen\n• Medium — balanced default\n• Large — easier reading, taller rows',
    placement: 'left',
    tooltipWidth: 380,
    padding: 12,
  },
  {
    id: 'settings-radius',
    target: '[data-tutorial="settings-radius"]',
    title: 'Corner style',
    description:
      'Controls how rounded or sharp every surface feels — calendar tiles, cards, inputs and buttons all follow.\n• Subtle — crisper, more precise edges\n• Default — balanced app-wide\n• Soft — rounder, friendlier surfaces',
    placement: 'left',
    tooltipWidth: 380,
    padding: 12,
  },
  {
    id: 'settings-tile-style',
    target: '[data-tutorial="settings-tile-style"]',
    title: 'Calendar tile style',
    description:
      'Changes how win and loss days show up on the calendar.\n• Solid — filled colored tiles, easiest to scan at a glance\n• Muted — softer tint, blends into the grid\n• Outlined — color only on the border, data-dense look',
    placement: 'left',
    tooltipWidth: 380,
    padding: 12,
  },
  {
    id: 'settings-currency',
    target: '[data-tutorial="settings-currency"]',
    title: 'Currency',
    description:
      'Controls the currency used for balance, P&L and every stat display. The selected currency applies app-wide — calendar totals, recent trades, header metrics and widgets all switch together.',
    placement: 'left',
    tooltipWidth: 380,
    padding: 12,
  },
  {
    id: 'settings-balance',
    target: '[data-tutorial="settings-balance"]',
    title: 'Starting balance',
    description:
      'Your reference account size. Equity curve and drawdown are measured from here.',
    placement: 'left',
  },
  {
    id: 'settings-metrics',
    target: '[data-tutorial="settings-metrics"]',
    title: 'Headline metrics',
    description:
      'The stats pinned to the top of the journal. Pick up to 3 that matter most to how you trade — win rate, profit factor, average R, expectancy, and more. Toggle any metric off to swap it for another; only the pinned three follow you into every day view.',
    placement: 'left',
    tooltipWidth: 380,
    padding: 12,
  },
  {
    id: 'settings-license',
    target: '[data-tutorial="settings-license"]',
    title: 'License & devices',
    description:
      'Your combined license management area.\n• License — activation status, key and renewal info\n• Devices — every machine currently using this license\n\nEach license activates on a fixed number of devices. Release a slot from the device list when you move to a new machine.',
    placement: 'left',
    tooltipWidth: 400,
    padding: 12,
  },
]

/**
 * Full first-run tour: behavioral demos FIRST (show the app driving itself),
 * then the classic tooltip walkthrough. ActivationGate and the "Replay"
 * button in Settings both import this so the two invocations never drift.
 */
export const FULL_TUTORIAL_STEPS: TutorialStep[] = [
  ...BEHAVIORAL_TUTORIAL_STEPS,
  ...MAIN_TUTORIAL_STEPS,
]
