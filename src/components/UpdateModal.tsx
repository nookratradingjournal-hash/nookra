// ── Update Modal ────────────────────────────────────────────────────────
// Single pane shown when `checkForUpdate()` returns `update-available` or
// `force-update`. Re-uses the shared Modal primitive so motion + backdrop
// match the rest of the app.
//
// Content:
//   * Title (entry.title)
//   * Version line (current  →  latest)
//   * Summary (entry.summary)
//   * Release-notes body (entry.body, scrollable)
// Actions:
//   * "Update Now"  — always shown; triggers download via shell.openExternal
//   * "Later"       — ONLY shown when not forced
//
// A forced update renders a small "Required update" header chip so the
// user understands why Later is gone.

import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import type { UpdateEntry, HostPlatform } from '../services/update/types'
import { pickDownloadUrl } from '../services/update/updateClient'

interface UpdateModalProps {
  open: boolean
  latest: UpdateEntry
  current: string
  host: HostPlatform
  forced: boolean
  forceReason?: 'force' | 'minimum'
  onDismiss?: () => void
}

export function UpdateModal({
  open, latest, current, host, forced, forceReason, onDismiss,
}: UpdateModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const url = pickDownloadUrl(latest, host)
  const hasInstaller = !!url

  const handleUpdateNow = async () => {
    if (!url || !window.updateAPI) {
      setErr('Download URL missing for this platform.')
      return
    }
    setDownloading(true)
    setErr(null)
    const r = await window.updateAPI.openDownload(url)
    setDownloading(false)
    if (!r.success) setErr(r.error ?? 'Failed to open installer')
  }

  // Forced updates can't be dismissed. Passing a no-op onClose to Modal
  // disables the Escape shortcut + the backdrop click.
  const handleClose = forced ? () => {} : (onDismiss ?? (() => {}))

  return (
    <Modal open={open} onClose={handleClose} width="max-w-md">
      <div className="flex flex-col p-6 gap-4">
        {/* Required-update chip */}
        {forced && (
          <div className="self-start px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-warning bg-warning-soft border border-warning">
            {forceReason === 'minimum' ? 'Required — below minimum version' : 'Required update'}
          </div>
        )}

        {/* Title + version line */}
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-semibold text-primary leading-tight">
            {latest.title || `Update available — ${latest.version}`}
          </h2>
          <p className="text-[11px] font-mono text-tertiary tabular-nums">
            {current} <span className="text-quaternary">→</span> {latest.version}
          </p>
        </div>

        {/* Summary */}
        {latest.summary && (
          <p className="text-[13px] text-secondary leading-relaxed">
            {latest.summary}
          </p>
        )}

        {/* Full body — scrollable so long release notes don't blow out
            the modal. Pre-wrap preserves newlines from the admin form. */}
        {latest.body && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-edge-resting bg-surface-resting px-3 py-2.5 text-[12px] text-tertiary leading-relaxed whitespace-pre-wrap">
            {latest.body}
          </div>
        )}

        {/* Inline error */}
        {err && (
          <div className="px-3 py-2 rounded-lg bg-negative-soft border border-negative text-[11px] text-negative">
            {err}
          </div>
        )}

        {/* No-installer warning — shown when metadata exists but the
            download URL is missing for this host. User still sees release
            info and can dismiss if not forced. */}
        {!hasInstaller && (
          <div className="px-3 py-2 rounded-lg bg-surface-resting border border-edge-resting text-[11px] text-tertiary">
            No installer available for your platform yet. Check back soon.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {!forced && (
            <Button variant="ghost" onClick={onDismiss}>Later</Button>
          )}
          <Button
            variant="primary"
            onClick={handleUpdateNow}
            disabled={!hasInstaller || downloading}
          >
            {downloading ? 'Opening\u2026' : 'Update Now'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
