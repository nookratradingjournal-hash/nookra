// ── Motion System ───────────────────────────────────────────────────────────
// Single source of truth for every animation duration, easing curve, and
// shared variant spec used across the app. Any component that animates
// should import from here rather than invent its own numbers — that's how
// we keep the whole product feeling like one piece (the ActivationGate
// transition, SettingsPanel open/close, Modal scale-fade, etc.).
//
// Design brief (condensed):
//   • Premium Mac-app feel: subtle fades, slight scale, smooth panels.
//   • Fast — most UI settles in 150–300ms.
//   • No bounce / no cartoon spring on functional UI. The only overshoot
//     allowed is the WelcomeScreen success pop (a one-off moment).
//   • GPU-friendly: opacity + transform only. Never animate width/height.
//   • Respect `prefers-reduced-motion` — the index.css global block
//     collapses durations to ~60ms and removes transforms.
//
// Choose tokens, not raw numbers. If a component needs a value that isn't
// here, prefer extending this file over inlining — that keeps drift out
// of the product.

import type { Transition, Variants } from 'framer-motion'

// ── Duration tokens (ms) ────────────────────────────────────────────────────
// Chosen to cluster around the three durations already in the codebase:
// 150 (btn-press / tab-card), 220 (tooltip / panel), 300 (view transition).
export const DURATION = {
  /** State flip / reduced-motion fallback. */
  instant:    60,
  /** Hover color shifts, focus ring fade-in. */
  micro:     120,
  /** Button press settle, small hover lift. */
  quick:     150,
  /** Tooltip / popover, activation input action. */
  short:     180,
  /** Panel open / close, tab switch, modal content. */
  base:      220,
  /** Page / scene crossfade, tutorial spotlight, welcome reveal. */
  deliberate: 300,
} as const

// ── Easing curves ──────────────────────────────────────────────────────────
// Apple's snappy ease (0.32, 0.72, 0, 1) is the north star — quick initial
// acceleration, clean trailing settle. That's the one we reach for 95% of
// the time. Standard is a gentler default for hover tints. Emphasis is
// the ONLY spring-ish curve and is reserved for the welcome pop.
//
// Tuples are typed as readonly 4-number arrays so Framer Motion accepts
// them as cubic-bezier `Easing` values.
type CubicBezier = [number, number, number, number]

export const EASE: {
  standard: CubicBezier
  snappy:   CubicBezier
  emphasis: CubicBezier
} = {
  /** Default transition curve — for hover tints, simple state changes.  */
  standard: [0.25, 0.46, 0.45, 0.94],
  /** Apple-style snappy ease — primary UI motion.                        */
  snappy:   [0.32, 0.72, 0, 1],
  /** Controlled overshoot — welcome / success moments ONLY.              */
  emphasis: [0.34, 1.56, 0.64, 1],
}

// CSS-string forms for inline `style` + stylesheet use.
export const EASE_CSS = {
  standard: `cubic-bezier(${EASE.standard.join(', ')})`,
  snappy:   `cubic-bezier(${EASE.snappy.join(', ')})`,
  emphasis: `cubic-bezier(${EASE.emphasis.join(', ')})`,
} as const

// ── Framer Motion: scene transition (matches ActivationGate) ────────────
// Reused for anything that should feel like a "screen change" — its values
// are identical to ActivationGate's VIEW_TRANSITION / VIEW_VARIANTS so the
// onboarding shell and any future scene-level transition share a tempo.
export const VIEW_TRANSITION: Transition = {
  duration: DURATION.deliberate / 1000,
  ease: EASE.snappy,
}

export const VIEW_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 0 },
  animate: { opacity: 1, scale: 1,    y: 0 },
  exit:    { opacity: 0, scale: 0.9,  y: 6 },
}

// ── Framer Motion: modal scale-fade ────────────────────────────────────────
// A slightly tighter version of the scene transition, tuned for modals and
// right-side panels. Enter lifts from 0.96 (vs the scene's 0.95) so the
// element feels anchored rather than arriving from nowhere.
export const MODAL_TRANSITION: Transition = {
  duration: DURATION.base / 1000,
  ease: EASE.snappy,
}

export const MODAL_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.98 },
}

// ── Framer Motion: backdrop fade ───────────────────────────────────────────
// Pairs with MODAL_VARIANTS — the dim layer behind a modal or drawer.
// Slightly shorter than the panel so it clears first and doesn't linger.
export const BACKDROP_TRANSITION: Transition = {
  duration: DURATION.short / 1000,
  ease: EASE.standard,
}

export const BACKDROP_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
}

// ── Framer Motion: right-side panel (SettingsPanel) ────────────────────────
// Enters from the right with a slight scale-up to feel anchored to the
// window edge. Exit mirrors the enter — NOT a bounce/overshoot.
export const PANEL_TRANSITION: Transition = {
  duration: DURATION.deliberate / 1000,
  ease: EASE.snappy,
}

export const PANEL_VARIANTS: Variants = {
  initial: { opacity: 0, x: 24, scale: 0.985 },
  animate: { opacity: 1, x: 0,  scale: 1 },
  exit:    { opacity: 0, x: 16, scale: 0.99 },
}

// ── Framer Motion: banner / pill mount-unmount (TrialBanner) ───────────────
// A small chip-style element that should appear / disappear cleanly when
// license state changes. Subtle vertical slide + fade — no scale.
export const BANNER_TRANSITION: Transition = {
  duration: DURATION.base / 1000,
  ease: EASE.snappy,
}

export const BANNER_VARIANTS: Variants = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
}
