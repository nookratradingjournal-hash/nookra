// ── Trigger rule for the guided tutorial ───────────────────────────────────
// The tour auto-starts at most once per device per flow:
//
//   • licensed flow → first time this device reaches the journal with an
//     active paid license AND the licensed-flag has not been set.
//   • trial flow    → first time this device reaches the journal with a
//     running trial AND the trial-flag has not been set.
//
// Key behavioral guarantees this enforces:
//
//   1. Deactivate → reactivate on the same device does NOT retrigger the
//      tour. Deactivation preserves the flag; reactivation sees it set and
//      skips the trigger.
//   2. Resuming an existing trial does NOT retrigger the tour. The trial
//      flag is set on the FIRST trial start; any subsequent launch (with
//      status=trial) sees the flag and skips the trigger.
//   3. Starting a brand-new trial on a device that never had one shows the
//      tour once. On that first journal entry the flag is unset → fire →
//      mark-done → never again on this device.
//   4. A licensed user on a new device (with the license already known on
//      the server) still sees the tour once on that device — each device
//      keeps its own flag.
//
// The legacy v1 single flag is honored via isTutorialDone() so devices that
// completed the old tour aren't surprised by a re-run after this upgrade.

import { useEffect, useRef, useState } from 'react'
import type { LicenseStatus } from '../licensing/licensingService'
import { isTutorialDone, type TutorialFlow } from './tutorialState'

export type TutorialPhase = 'nameEntry' | 'journal' | null

// Accepts the gate's wider status (which includes its internal 'loading'
// sentinel) in addition to LicenseStatus — the hook only branches on the
// 'active' / 'trial' strings.
type StatusLike = LicenseStatus | 'loading' | (string & {})

/** Pure helper — map license status to the tutorial flow it belongs to.
 *  Exposed so callers that need to mark the flag can use the same mapping. */
export function tutorialFlowFromStatus(status: StatusLike): TutorialFlow | null {
  if (status === 'active') return 'licensed'
  if (status === 'trial')  return 'trial'
  return null
}

export function useShouldStartTutorial(
  phase: TutorialPhase,
  status: StatusLike,
): boolean {
  const [shouldStart, setShouldStart] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    if (phase !== 'journal') return

    const flow = tutorialFlowFromStatus(status)
    if (!flow) return

    // Flow-specific completion check — licensed and trial are independent,
    // with legacy v1 migration baked in.
    if (isTutorialDone(flow)) return

    firedRef.current = true
    setShouldStart(true)
  }, [phase, status])

  return shouldStart
}
