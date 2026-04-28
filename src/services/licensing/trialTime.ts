// ── Trial Time Helpers ───────────────────────────────────────────────────────
// Single source of truth for computing and formatting trial remaining time.
// Used by: ActivationGate context, Settings license section, app header banner.

export interface TrialRemaining {
  hours: number
  minutes: number
  totalMs: number
  expired: boolean
}

/** Compute remaining time from an ISO 8601 expiry timestamp */
export function getTrialRemaining(expiresAt: string | null): TrialRemaining {
  if (!expiresAt) return { hours: 0, minutes: 0, totalMs: 0, expired: true }

  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { hours: 0, minutes: 0, totalMs: 0, expired: true }

  const totalMinutes = Math.floor(ms / 60_000)
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMs: ms,
    expired: false,
  }
}

/** Format remaining time as a human-readable string, e.g. "23h 12m remaining" */
export function formatTrialRemaining(expiresAt: string | null): string {
  const { hours, minutes, expired } = getTrialRemaining(expiresAt)
  if (expired) return 'Expired'
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}
