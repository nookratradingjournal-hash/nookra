// ── Tutorial Overlay ────────────────────────────────────────────────────────
// Spotlight + tooltip renderer. One instance at a time, mounted by
// <TutorialProvider> into a portal so it sits above every other layer.
//
// Visual structure:
//   ┌ backdrop ─────────────────────────────┐
//   │  full-screen dim via SVG mask         │
//   │  ├── spotlight cutout (rounded rect)  │
//   │  │     highlight ring (animated)      │
//   │  └── tooltip card (animated position) │
//   │        title + desc crossfade on step │
//   └───────────────────────────────────────┘
//
// Polish guarantees (why this file is noisier than a "just put a rect on
// screen" version):
//
// 1. Zero-flicker step transitions
//    The spotlight rect is NEVER reset to null between steps — we keep the
//    last valid measurement and let framer-motion tween x/y/width/height on
//    the mask cutout and the highlight ring. No pop, no snap.
//
// 2. Tween stability
//    A short rAF-driven re-measure loop runs for ~800ms after a step change
//    to catch the settling tail of `scrollIntoView({behavior: 'smooth'})`.
//    Sub-pixel jitter is filtered so we don't spam setState during scroll.
//
// 3. Off-screen avoidance
//    Tooltip placement picks the side with the most viewport room when the
//    preferred side can't fit the card + gap. Final x/y is clamped with a
//    16px safe margin on all sides. When the target itself is bigger than
//    the viewport, placement falls back to `bottom` with a best-effort clamp.
//
// 4. Missing targets don't hang the tour
//    If the selector can't resolve after a 900ms grace, we auto-advance via
//    onNext() — same behavior as Skip, just scoped to this one step.
//
// 5. Crossfade for text
//    Title + description are wrapped in AnimatePresence keyed by step.id so
//    changing step content dissolves rather than snapping.
//
// Why an SVG mask for the dim: one composited layer keeps opacity uniform
// and the cutout pixel-perfect regardless of the underlying element's
// background. Four-div approaches bleed at the corners.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { TutorialStep } from '../../services/tutorial/types'

interface Props {
  step: TutorialStep
  stepIndex: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Default tooltip width. Individual steps can override via step.tooltipWidth
// (e.g. settings-* steps that list multiple controls use 380–400 so the
// description doesn't wrap into a cramped column).
const TOOLTIP_W = 320
const TOOLTIP_GAP = 14
const EDGE_PAD = 16

// Matches the rest of the app's "snappy ease" curve (see ActivationGate).
const EASE = [0.32, 0.72, 0, 1] as const
// Position/size tween sits in the 200–300ms Apple band — fast enough to feel
// responsive, slow enough to read as motion rather than a snap.
const TWEEN_DURATION = 0.26
// (The prior inner content-crossfade duration was removed along with the
// inner AnimatePresence — the outer keyed remount now handles content swap
// in a single fade-out / fade-in at the old and new anchors respectively.)
// Hard upper bound for the scroll-settle poll loop. Prevents a pathological
// target-moves-forever scenario from pinning the rAF loop.
const SETTLE_TIMEOUT_MS = 900
// How many consecutive stable frames mark "scroll has finished settling".
// 3 frames ≈ 50ms on a 60Hz display, 25ms on 120Hz. Low enough to feel
// responsive, high enough to avoid false positives at the apex of a scroll.
const SETTLE_FRAMES = 3

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

// Sub-pixel-tolerant equality. Prevents spamming setState during scroll when
// the rect moves by 0.00x pixels due to fractional viewport math.
function rectsClose(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

function pickPlacement(
  rect: Rect,
  preferred: TutorialStep['placement'],
  tooltipH: number,
  tooltipW: number,
  viewportH: number,
  viewportW: number,
): 'top' | 'bottom' | 'left' | 'right' {
  const spaceTop = rect.y
  const spaceBottom = viewportH - (rect.y + rect.height)
  const spaceLeft = rect.x
  const spaceRight = viewportW - (rect.x + rect.width)

  if (preferred && preferred !== 'auto') {
    const room = { top: spaceTop, bottom: spaceBottom, left: spaceLeft, right: spaceRight }[preferred]
    const need =
      preferred === 'top' || preferred === 'bottom'
        ? tooltipH + TOOLTIP_GAP + EDGE_PAD
        : tooltipW + TOOLTIP_GAP + EDGE_PAD
    if (room >= need) return preferred
  }
  // Fall back to whichever side has most room.
  const entries: Array<['top' | 'bottom' | 'left' | 'right', number]> = [
    ['bottom', spaceBottom],
    ['top', spaceTop],
    ['right', spaceRight],
    ['left', spaceLeft],
  ]
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

export function TutorialOverlay({
  step,
  stepIndex,
  total,
  onNext,
  onBack,
  onSkip,
}: Props) {
  // Keep the last valid rect across step changes — this is the anti-flicker
  // trick. `setRect(measure(...))` is never called with null; we only
  // replace on a successful measurement.
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipH, setTooltipH] = useState(140)
  const primaryBtnRef = useRef<HTMLButtonElement>(null)

  // ── Measurement lifecycle ────────────────────────────────────────────────
  // Two-phase strategy so scroll and spotlight don't race:
  //
  //   Phase 1 — SCROLL (0 → scroll-settle)
  //     If the target is off-screen, kick smooth scrollIntoView. The old
  //     spotlight + tooltip stay frozen at their last-known rect so the user
  //     isn't watching the highlight "chase" the scroll. A rAF poll watches
  //     getBoundingClientRect; when the rect is stable across SETTLE_FRAMES
  //     consecutive frames (or SETTLE_TIMEOUT_MS fires), we consider the
  //     scroll complete.
  //
  //   Phase 2 — TWEEN (scroll-settle → +TWEEN_DURATION)
  //     Once settled, a single setRect() hands the new rect to framer-motion.
  //     Framer tweens cutout + ring + tooltip position in one coordinated
  //     motion. No further rect updates during the tween — avoids framer
  //     re-targeting mid-animation.
  //
  //   Phase 3 — TRACKING (after)
  //     Scroll + resize listeners attach once the tween is complete, so
  //     post-tour manual scrolls still keep the spotlight aligned without
  //     interfering with the planned tween. If target can't be measured
  //     within SETTLE_TIMEOUT_MS (unmounted / missing), the separate
  //     grace-period effect auto-advances the tour via onNext().
  useLayoutEffect(() => {
    let cancelled = false
    let rafId: number | null = null
    let trackingScrollHandler: (() => void) | null = null
    let trackingResizeHandler: (() => void) | null = null
    let trackingAttachTimeout: ReturnType<typeof setTimeout> | null = null
    // needsScroll is decided inside runPass but hoisted here so the tracking-
    // listener attach-delay below can read the correct value regardless of
    // which branch (immediate-element vs mount-wait) got us there.
    let neededScroll = false

    // The scroll-and-settle measurement pass. Factored out so both branches
    // below (element already in DOM vs element appears after a mount-wait)
    // can invoke the same logic once they've resolved the target.
    const runPass = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      neededScroll = !(
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= window.innerHeight &&
        r.right <= window.innerWidth
      )
      if (neededScroll) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }

      // On-screen path: commit immediately so framer tweens from the previous
      // spotlight to the new target in ~260ms (zero-delay motion).
      if (!neededScroll) {
        const m = measure(step.target)
        if (m) setRect((prev) => (rectsClose(prev, m) ? prev : m))
      }

      // Scroll-settle poll. When `neededScroll` we defer the first commit
      // until the scroll settles (rect frozen at prev step prevents the old
      // spotlight from chasing the scroll). When the target is already
      // on-screen we still run the poll as a safety net to catch any
      // in-progress CSS transition (e.g. a panel slide-in finishing just
      // as this step activates) — idempotent setRect + rectsClose dedup
      // makes this free for the static case.
      const start = performance.now()
      let lastSampled: Rect | null = null
      let stableFrames = 0

      const pollSettle = () => {
        if (cancelled) return
        const sampled = measure(step.target)
        if (sampled) {
          if (lastSampled && rectsClose(lastSampled, sampled)) {
            stableFrames++
            if (stableFrames >= SETTLE_FRAMES) {
              setRect((prev) => (rectsClose(prev, sampled) ? prev : sampled))
              return
            }
          } else {
            stableFrames = 0
          }
          lastSampled = sampled
        }
        if (performance.now() - start < SETTLE_TIMEOUT_MS) {
          rafId = requestAnimationFrame(pollSettle)
        } else if (sampled) {
          setRect((prev) => (rectsClose(prev, sampled) ? prev : sampled))
        }
      }
      rafId = requestAnimationFrame(pollSettle)
    }

    // ── Target resolution ───────────────────────────────────────────────────
    // Two shapes of target-availability at effect-fire time:
    //
    //   (A) Target is already in the DOM.
    //       Most steps. Happens when the step's target is on an always-
    //       rendered page (calendar, stats, widgets-menu drawer) or was
    //       mounted by a previous step's scene side-effect.
    //
    //   (B) Target is NOT in the DOM yet.
    //       Happens on settings section-swaps (e.g. settings-balance →
    //       settings-metrics). The overlay's useLayoutEffect fires BEFORE
    //       App.tsx's scene-controller useEffect in the same commit, so
    //       the new section's root hasn't mounted yet. Without the mount-
    //       wait poll, the effect would do nothing at all for this step
    //       (no settle poll, no setRect) and the spotlight would stay
    //       stuck on the PREVIOUS step's rect while the tooltip updates
    //       to this step's text.
    //
    // For (B) we poll for the target until it appears, bounded by the same
    // 900ms timeout that governs the settle loop, then hand off to runPass.
    // If it never appears the grace-period effect below auto-advances via
    // onNext() — same behavior as a skip, scoped to this step.
    const el = document.querySelector(step.target) as HTMLElement | null
    if (el) {
      runPass(el)
    } else {
      const waitStart = performance.now()
      const waitForMount = () => {
        if (cancelled) return
        const found = document.querySelector(step.target) as HTMLElement | null
        if (found) {
          runPass(found)
          return
        }
        if (performance.now() - waitStart < SETTLE_TIMEOUT_MS) {
          rafId = requestAnimationFrame(waitForMount)
        }
      }
      rafId = requestAnimationFrame(waitForMount)
    }

    // Attach tracking listeners AFTER the planned scroll + tween complete
    // so they don't fight the initial animation. For on-screen targets this
    // is the tween duration only; for off-screen (or mount-wait) it adds a
    // safety margin so the settle loop owns the handoff window.
    const trackingDelay = SETTLE_TIMEOUT_MS + 60
    trackingAttachTimeout = setTimeout(() => {
      if (cancelled) return
      // If nothing ever needed a scroll or a mount-wait, we could have used
      // the shorter tween-only delay — but attaching a touch late is harmless
      // (the settle poll already owns the first commit) and keeps the code
      // simpler than branching on neededScroll post-hoc.
      void neededScroll
      trackingScrollHandler = () => {
        const m = measure(step.target)
        if (m) setRect((prev) => (rectsClose(prev, m) ? prev : m))
      }
      trackingResizeHandler = () => {
        setViewport({ w: window.innerWidth, h: window.innerHeight })
        const m = measure(step.target)
        if (m) setRect((prev) => (rectsClose(prev, m) ? prev : m))
      }
      window.addEventListener('scroll', trackingScrollHandler, { passive: true, capture: true })
      window.addEventListener('resize', trackingResizeHandler)
    }, trackingDelay)

    return () => {
      cancelled = true
      if (rafId != null) cancelAnimationFrame(rafId)
      if (trackingAttachTimeout) clearTimeout(trackingAttachTimeout)
      if (trackingScrollHandler) {
        window.removeEventListener(
          'scroll',
          trackingScrollHandler,
          { capture: true } as EventListenerOptions,
        )
      }
      if (trackingResizeHandler) {
        window.removeEventListener('resize', trackingResizeHandler)
      }
    }
  }, [step.target])

  // Missing-target grace period: if the selector can't resolve within the
  // settle timeout + a small buffer, advance the tour rather than showing a
  // stale rect. Buffer ensures we never race the settle loop's own timeout.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!measure(step.target)) onNext()
    }, SETTLE_TIMEOUT_MS + 120)
    return () => clearTimeout(t)
  }, [step.target, onNext])

  // Measure the tooltip BEFORE paint so placement uses the real height of
  // this step's content, not the previous step's. Using `useEffect` left a
  // one-frame window where the clamp's upper bound (`viewport.h -
  // tooltipH - EDGE_PAD`) was computed from a stale height — if the
  // previous step's tooltip was taller, the new (shorter) content
  // committed to a lower tipY than was safe, and on tall actual content
  // the box ran off the bottom of the viewport. `useLayoutEffect` fires
  // synchronously after render but before paint, so the height is updated
  // before the browser draws the first frame of the new step.
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height
      if (h > 0) setTooltipH(h)
    }
  }, [step.id])

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSkip()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowLeft' && stepIndex > 0) {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onBack, onSkip, stepIndex])

  // Focus the primary action on first mount so Enter works immediately for
  // keyboard users. Don't steal focus on every step change — the window-
  // level key handler covers subsequent navigation.
  useEffect(() => {
    primaryBtnRef.current?.focus()
  }, [])

  const pad = step.padding ?? 8

  // Compute placement + tooltip anchor from the CURRENT rect. Before the
  // first measurement lands, render nothing animated — just the dim layer.
  // Once rect is populated, every subsequent change tweens via framer.
  const hasRect = rect !== null
  const safeRect = rect ?? {
    x: viewport.w / 2 - 60,
    y: viewport.h / 2 - 60,
    width: 120,
    height: 120,
  }

  // Per-step tooltip width. Steps with multi-point descriptions (settings-*)
  // opt into a wider card via step.tooltipWidth to avoid cramped wrapping.
  // `effectiveTipW` caps the configured width to what actually fits inside
  // the viewport (minus a 16px safe margin on each side). Without this cap
  // a 340px tooltip in a narrow window would render its full width but get
  // pinned at x=16 by the clamp below, overflowing the right edge. All
  // downstream placement + clamp + inline-width math reads this value so
  // the card CAN'T physically exceed the viewport regardless of step config.
  const tipW = step.tooltipWidth ?? TOOLTIP_W
  const effectiveTipW = Math.min(tipW, Math.max(120, viewport.w - 2 * EDGE_PAD))

  const placement = pickPlacement(
    safeRect,
    step.placement ?? 'auto',
    tooltipH,
    effectiveTipW,
    viewport.h,
    viewport.w,
  )

  let tipX = 0
  let tipY = 0
  if (placement === 'bottom') {
    tipX = safeRect.x + safeRect.width / 2 - effectiveTipW / 2
    tipY = safeRect.y + safeRect.height + TOOLTIP_GAP
  } else if (placement === 'top') {
    tipX = safeRect.x + safeRect.width / 2 - effectiveTipW / 2
    tipY = safeRect.y - TOOLTIP_GAP - tooltipH
  } else if (placement === 'right') {
    tipX = safeRect.x + safeRect.width + TOOLTIP_GAP
    tipY = safeRect.y + safeRect.height / 2 - tooltipH / 2
  } else {
    tipX = safeRect.x - TOOLTIP_GAP - effectiveTipW
    tipY = safeRect.y + safeRect.height / 2 - tooltipH / 2
  }
  tipX = clamp(tipX, EDGE_PAD, Math.max(EDGE_PAD, viewport.w - effectiveTipW - EDGE_PAD))
  tipY = clamp(tipY, EDGE_PAD, Math.max(EDGE_PAD, viewport.h - tooltipH - EDGE_PAD))

  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1

  // Clamp cutout to viewport bounds. Without this, viewport-edge anchored
  // targets (e.g. the Widgets drawer — `fixed top-0 right-0 bottom-0`) have
  // their spotlight ring extend `pad` pixels past the top/right/bottom
  // edges. The SVG clips those edges, leaving a visible 1px stroke "line"
  // sticking across the viewport where the ring's off-screen side would be.
  // Clamping makes the ring sit flush with the viewport on any edge the
  // target touches.
  const rawL = safeRect.x - pad
  const rawT = safeRect.y - pad
  const rawR = safeRect.x + safeRect.width + pad
  const rawB = safeRect.y + safeRect.height + pad
  const cutoutX = Math.max(0, rawL)
  const cutoutY = Math.max(0, rawT)
  const cutoutW = Math.min(viewport.w, rawR) - cutoutX
  const cutoutH = Math.min(viewport.h, rawB) - cutoutY

  return createPortal(
    <div
      className="tutorial-root"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      <svg
        className="tutorial-backdrop"
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
      >
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            {hasRect && (
              <motion.rect
                rx={10}
                ry={10}
                fill="black"
                initial={{ x: cutoutX, y: cutoutY, width: cutoutW, height: cutoutH }}
                animate={{ x: cutoutX, y: cutoutY, width: cutoutW, height: cutoutH }}
                transition={{ duration: TWEEN_DURATION, ease: EASE }}
              />
            )}
          </mask>
        </defs>

        {/* Dim layer — punched through by the mask above. */}
        <rect
          x="0"
          y="0"
          width={viewport.w}
          height={viewport.h}
          fill="rgba(0,0,0,0.62)"
          mask="url(#tutorial-spotlight-mask)"
        />

        {/* Highlight ring — tweens alongside the cutout. On each step change
            the ring pulses its opacity (0.22 → 0.42 → 0.22) in sync with
            the position tween. Very subtle; reads as "focus landed" rather
            than an effect. Keyed by step.id so the keyframed animate re-
            fires at every step. */}
        {hasRect && (
          <motion.rect
            key={step.id}
            rx={10}
            ry={10}
            fill="none"
            stroke="rgba(255,255,255,1)"
            strokeWidth={1}
            initial={{
              x: cutoutX,
              y: cutoutY,
              width: cutoutW,
              height: cutoutH,
              opacity: 0.22,
            }}
            animate={{
              x: cutoutX,
              y: cutoutY,
              width: cutoutW,
              height: cutoutH,
              opacity: [0.22, 0.42, 0.22],
            }}
            transition={{
              x: { duration: TWEEN_DURATION, ease: EASE },
              y: { duration: TWEEN_DURATION, ease: EASE },
              width: { duration: TWEEN_DURATION, ease: EASE },
              height: { duration: TWEEN_DURATION, ease: EASE },
              opacity: {
                duration: TWEEN_DURATION + 0.18,
                ease: 'easeOut',
                times: [0, 0.55, 1],
              },
            }}
          />
        )}
      </svg>

      {/* Tooltip card.
          Keyed by step.id and wrapped in AnimatePresence mode="wait" so the
          tooltip DISMISSES at its old anchor before the new one mounts at
          its new anchor, instead of rubber-banding across the screen with
          content/width/height snapping mid-flight. The spotlight (SVG
          mask + ring) still tweens smoothly between targets so the user's
          eye tracks the moving focus; only the card remounts. This is the
          fix for the step 4 → 5 handoff, where the tooltip was flying from
          a 400px-wide modal anchor to a 320px-wide Recent-Trades anchor
          with an 80px width snap and a large position jump mid-tween.
          Every transition benefits — adjacent steps now dismiss/appear
          cleanly, distant steps no longer rubber-band. The inner
          AnimatePresence-on-content is removed because the outer keyed
          remount already handles content swap. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={tooltipRef}
          className="tutorial-tooltip"
          style={{ left: 0, top: 0, width: effectiveTipW, maxWidth: `calc(100vw - ${EDGE_PAD * 2}px)` }}
          data-placement={placement}
          initial={{ opacity: 0, scale: 0.97, x: tipX, y: tipY }}
          animate={{ opacity: hasRect ? 1 : 0, scale: 1, x: tipX, y: tipY }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{
            // Position still tweens in case the SAME step's rect updates
            // (e.g. scroll/resize within a step). On step change, the
            // outer key swap short-circuits this — the exiting tooltip
            // holds its position while fading out, and the new tooltip
            // mounts at its final position.
            x: { duration: TWEEN_DURATION, ease: EASE },
            y: { duration: TWEEN_DURATION, ease: EASE },
            opacity: { duration: 0.18, ease: 'easeOut' },
            scale: { duration: 0.18, ease: 'easeOut' },
          }}
        >
          <div className="tutorial-tooltip__header">
            <span className="tutorial-tooltip__progress">
              {stepIndex + 1} / {total}
            </span>
            <button
              type="button"
              className="tutorial-tooltip__skip"
              onClick={onSkip}
              aria-label="Skip tutorial"
            >
              Skip
            </button>
          </div>

          <div className="tutorial-tooltip__body">
            <h3 className="tutorial-tooltip__title">{step.title}</h3>
            {/* whiteSpace: pre-line lets steps with multi-point
                descriptions (settings-*) use `\n` for hard line breaks
                without introducing markdown or a new render path. */}
            <p
              className="tutorial-tooltip__desc"
              style={{ whiteSpace: 'pre-line' }}
            >
              {step.description}
            </p>
          </div>

          <div className="tutorial-tooltip__controls">
            <button
              type="button"
              className="tutorial-tooltip__btn tutorial-tooltip__btn--ghost"
              onClick={onBack}
              disabled={isFirst}
            >
              Back
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              className="tutorial-tooltip__btn tutorial-tooltip__btn--primary"
              onClick={onNext}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}
