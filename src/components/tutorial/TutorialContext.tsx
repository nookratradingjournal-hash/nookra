// ── Tutorial Context ────────────────────────────────────────────────────────
// Provider + hook for the guided tour. Holds:
//   • the active step list (empty when tour isn't running)
//   • the current step index
//   • controls: start, next, back, skip, finish
//
// The provider renders <TutorialOverlay /> when a tour is active. That's the
// only place the overlay mounts, so tours can be started from anywhere in the
// tree via useTutorial() without duplicating render logic.
//
// Persistence note: the "already seen on this device" flag is written by the
// auto-trigger (ActivationGate) at the MOMENT the tour fires — not here.
// Skip and finish therefore only tear down the overlay. This keeps manual
// "Replay Tutorial" invocations from rewriting flags that already reflect
// reality, and it keeps the per-flow flag (licensed vs trial) out of a
// provider that doesn't know which flow is running.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { TutorialStep } from '../../services/tutorial/types'
import { runActions, type TutorialSceneContext } from '../../services/tutorial/actions'
import { useTutorialScene } from '../../services/tutorial/sceneContext'
import { TutorialOverlay } from './TutorialOverlay'

/**
 * Runs the behavioral `onEnter` actions each time the tutorial's active
 * step changes. Lives as a separate component so it can be mounted
 * *inside* App's <TutorialSceneProvider> — the scene context has to be
 * set up by App's own hooks, which happens below <TutorialProvider>.
 *
 * Mount this ONCE, anywhere inside the scene provider. Rendering multiple
 * runners would fire every action list twice.
 *
 * On tour close (active → false) with a previously-seen step, the runner
 * fires a final `resetAll` so we never leak mid-demo state past the tour.
 */
export function TutorialActionRunner(): null {
  const { currentStep, active, _registerScene } = useTutorial()
  const scene = useTutorialScene()
  const abortRef = useRef<AbortController | null>(null)
  const sawActiveRef = useRef(false)

  // Hand the scene ref up to the provider so its `next()` can await the
  // outgoing step's onExit actions before flipping the index. The provider
  // lives above the scene in the tree and can't use useTutorialScene()
  // directly, so we publish it downward-to-upward via this callback.
  // Updates freely as scene reference changes; provider stores the latest.
  useEffect(() => {
    _registerScene(scene)
    return () => _registerScene(null)
  }, [scene, _registerScene])

  // Per-step: abort previous sequence, start a new one. Key off step id so
  // the same step staying selected across unrelated re-renders doesn't
  // restart the animations.
  useEffect(() => {
    if (!scene || !currentStep) return
    sawActiveRef.current = true
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    runActions(currentStep.onEnter, scene, ctrl.signal)
    return () => { ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id])

  // Close cleanup: when the tour flips from active → inactive, abort any
  // in-flight sequence and play resetAll. This is the single authoritative
  // teardown path — skip/finish both route through here via `active`.
  useEffect(() => {
    if (active) return
    if (!sawActiveRef.current) return
    sawActiveRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    if (!scene) return
    const ctrl = new AbortController()
    runActions([{ type: 'resetAll' }], scene, ctrl.signal)
  }, [active, scene])

  return null
}

interface TutorialContextValue {
  /** Begin a tour. If a tour is already running, it is replaced. */
  start: (steps: TutorialStep[]) => void
  /** Advance one step, or finish if on the last step. */
  next: () => void
  /** Go back one step. No-op on the first step. */
  back: () => void
  /** Dismiss the tour and mark it completed. */
  skip: () => void
  /** Finish the tour normally (same persistence effect as skip). */
  finish: () => void
  /** True while a tour is active. */
  active: boolean
  /** The id of the currently-visible step, or null when no tour is running.
   *  Exposed so the app shell can react to specific steps (e.g. auto-open
   *  the Settings panel when the tutorial reaches the Settings step). */
  currentStepId: string | null
  /** The full current step object, or null. Exposed for the action runner,
   *  which needs access to the step's `onEnter` action list. */
  currentStep: TutorialStep | null
  /** Internal — used by TutorialActionRunner to publish the scene context
   *  upward so the provider's `next()` can run onExit actions before the
   *  index advances. Not for external callers. */
  _registerScene: (scene: TutorialSceneContext | null) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext)
  if (!ctx) {
    throw new Error('useTutorial must be used inside <TutorialProvider>')
  }
  return ctx
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TutorialStep[]>([])
  const [index, setIndex] = useState(0)

  // Scene ref published from inside TutorialActionRunner (which lives under
  // <TutorialSceneProvider>). Lets `next()` run the outgoing step's onExit
  // actions — the "hold for modal exit" beat used on step 4 → 5.
  const sceneRef = useRef<TutorialSceneContext | null>(null)
  const _registerScene = useCallback((scene: TutorialSceneContext | null) => {
    sceneRef.current = scene
  }, [])

  // Guards against double-firing when the user spams Next during an onExit.
  const advancingRef = useRef(false)

  const active = steps.length > 0

  const start = useCallback((next: TutorialStep[]) => {
    if (!next.length) return
    setSteps(next)
    setIndex(0)
  }, [])

  const close = useCallback(() => {
    // Signal the final close so the scene-level action runner (mounted
    // inside App.tsx) can play a `resetAll` beat on its way out. We can't
    // call into the scene from here because the scene context lives BELOW
    // this provider in the tree — the runner component handles cleanup
    // when it sees active flip to false.
    setSteps([])
    setIndex(0)
  }, [])

  const next = useCallback(async () => {
    // If the outgoing step declares onExit actions (e.g. step 4 closing the
    // AddTradeModal + waiting for its 220ms exit animation), run them to
    // completion before flipping the index. This keeps the outgoing step
    // visible during the teardown so the incoming step's spotlight doesn't
    // start tweening while the previous UI is still fading out.
    if (advancingRef.current) return
    const current = steps[index]
    if (current?.onExit && current.onExit.length > 0 && sceneRef.current) {
      advancingRef.current = true
      try {
        await runActions(current.onExit, sceneRef.current, new AbortController().signal)
      } finally {
        advancingRef.current = false
      }
    }
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        // finish — just tear down; the flag was already set at fire time.
        setSteps([])
        return 0
      }
      return i + 1
    })
  }, [steps, index])

  const back = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : 0))
  }, [])

  const currentStepId = active ? steps[index]?.id ?? null : null
  const currentStep = active ? steps[index] ?? null : null

  const value = useMemo<TutorialContextValue>(
    () => ({
      start,
      next,
      back,
      skip: close,
      finish: close,
      active,
      currentStepId,
      currentStep,
      _registerScene,
    }),
    [start, next, back, close, active, currentStepId, currentStep, _registerScene],
  )

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {active && (
        <TutorialOverlay
          step={steps[index]}
          stepIndex={index}
          total={steps.length}
          onNext={next}
          onBack={back}
          onSkip={close}
        />
      )}
    </TutorialContext.Provider>
  )
}
