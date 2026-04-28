// ── UpdateGate ──────────────────────────────────────────────────────────
// Wraps the app root. On mount:
//   1. Runs `checkForUpdate()` once.
//   2. If an update is available  → renders children + <UpdateModal/>.
//   3. If an update is FORCED     → renders <UpdateModal/> without
//      children (effectively blocking the app until the user downloads).
//   4. If up-to-date / no-releases / error → renders children transparently.
//
// Keeping the gate as a component (not a hook) makes the "block the app"
// case trivial: just don't render children. No global flags, no portals.
//
// We deliberately do not re-check on interval. For a v1 manual pipeline
// one check per launch is enough — if we need periodic later we'll pass
// an `intervalMs` prop through.

import { useEffect, useState, type ReactNode } from 'react'
import { UpdateModal } from './UpdateModal'
import {
  checkForUpdate,
  hasBridge,
  type UpdateVerdict,
} from '../services/update/updateClient'
import type { HostPlatform } from '../services/update/types'

interface UpdateGateProps {
  children: ReactNode
}

export function UpdateGate({ children }: UpdateGateProps) {
  const [verdict, setVerdict] = useState<UpdateVerdict | null>(null)
  const [host, setHost] = useState<HostPlatform>('other')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    // Outside Electron → nothing to check. Render children immediately.
    if (!hasBridge()) {
      setVerdict({ status: 'error', current: 'web', error: 'no bridge' })
      return
    }
    ;(async () => {
      const h = await window.updateAPI!.getPlatform()
      if (!mounted) return
      setHost(h)
      const v = await checkForUpdate()
      if (!mounted) return
      setVerdict(v)
    })()
    return () => { mounted = false }
  }, [])

  // While we're checking, show children without flicker. The IPC call is
  // near-instant for a local JSON file — no need for a loading state.
  if (!verdict) return <>{children}</>

  const showModal =
    (verdict.status === 'update-available' && !dismissed) ||
    verdict.status === 'force-update'

  const blockApp = verdict.status === 'force-update'

  return (
    <>
      {!blockApp && children}
      {showModal && (verdict.status === 'update-available' || verdict.status === 'force-update') && (
        <UpdateModal
          open
          latest={verdict.latest}
          current={verdict.current}
          host={host}
          forced={verdict.status === 'force-update'}
          forceReason={verdict.status === 'force-update' ? verdict.reason : undefined}
          onDismiss={() => setDismissed(true)}
        />
      )}
      {/* Forced mode with no children underneath — cover the window with a
          dimmed background so the blank state doesn't look broken while
          the modal is open on top. */}
      {blockApp && (
        <div className="fixed inset-0 z-40 bg-[#09090b]" aria-hidden />
      )}
    </>
  )
}
