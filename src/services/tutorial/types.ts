// ── Tutorial types ──────────────────────────────────────────────────────────
// Shape a tutorial step must satisfy. Tours are arrays of TutorialStep.

import type { TutorialAction } from './actions'

export interface TutorialStep {
  /** Unique key for this step — used as React key + for analytics hooks. */
  id: string
  /** CSS selector for the element to highlight.
   *  Prefer `[data-tutorial="name"]` anchors — robust against className churn. */
  target: string
  /** Short heading shown in the tooltip. One line. */
  title: string
  /** One sentence describing what the highlighted area does. Kept short. */
  description: string
  /** Preferred tooltip placement. 'auto' picks the side with most room. */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** Optional padding in px around the spotlight rectangle. Default 8. */
  padding?: number
  /** Optional tooltip width override in px. Default 320. Use a roomier value
   *  (e.g. 380) on steps whose description lists multiple controls so the
   *  tooltip doesn't feel cramped. */
  tooltipWidth?: number
  /** Optional behavioral actions to run when this step becomes active.
   *  Executed sequentially with a shared AbortController — if the user
   *  advances or skips mid-run, the remaining actions are cancelled.
   *  This is how "show, don't tell" steps work: the tutorial opens a
   *  panel, types into a field, clicks a calendar day, etc. Actions
   *  resolve against the TutorialSceneContext provided at the app root. */
  onEnter?: TutorialAction[]
  /** Optional actions to run when the step is torn down (user advances
   *  off it, or tour closes). Use sparingly — most cleanup belongs in
   *  the final `resetAll` at the end of the tour. */
  onExit?: TutorialAction[]
  /** If true, hide the tooltip entirely for this step — useful for
   *  pure-action frames where the user should watch an animation rather
   *  than read text. Spotlight still draws. */
  hideTooltip?: boolean
  /** Minimum time the step stays visible before auto-advancing. Used
   *  in conjunction with an auto-advance pattern for "film strip" demos
   *  where each step is a single visual beat. */
  minDurationMs?: number
}
