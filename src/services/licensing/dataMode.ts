// ── Data Mode ────────────────────────────────────────────────────────────────
// Tracks whether current app data belongs to trial or licensed usage.
// Trial data is temporary and wiped on expiration.
// Licensed data persists permanently.

export type DataMode = 'trial' | 'licensed' | 'none'

const DATA_MODE_KEY = 'tj-data-mode'
const TRIAL_SEEDED_KEY = 'tj-trial-seeded'

// Keys that hold user-created app data (trades, balance, notes, widgets)
const TRIAL_DATA_KEYS = [
  'tj-trades-v2',
  'tj-starting-balance',
  'tj-focus-note',
  'tj-widget-layout-v6',
]

// ── Mode ─────────────────────────────────────────────────────────────────────

export function getDataMode(): DataMode {
  const v = localStorage.getItem(DATA_MODE_KEY)
  if (v === 'trial' || v === 'licensed') return v
  return 'none'
}

export function setDataMode(mode: DataMode): void {
  if (mode === 'none') {
    localStorage.removeItem(DATA_MODE_KEY)
  } else {
    localStorage.setItem(DATA_MODE_KEY, mode)
  }
}

// ── Trial seeded flag ────────────────────────────────────────────────────────
// Prevents re-seeding demo data when resuming an active trial.

export function isTrialSeeded(): boolean {
  return localStorage.getItem(TRIAL_SEEDED_KEY) === '1'
}

export function markTrialSeeded(): void {
  localStorage.setItem(TRIAL_SEEDED_KEY, '1')
}

// ── Trial data wipe ─────────────────────────────────────────────────────────
// Removes all app data keys created during trial mode.
// Does NOT touch licensing keys (session, trial-used, device-id).

export function clearTrialData(): void {
  for (const key of TRIAL_DATA_KEYS) {
    localStorage.removeItem(key)
  }
  localStorage.removeItem(TRIAL_SEEDED_KEY)
  setDataMode('none')
}

// ── Transition to licensed mode ──────────────────────────────────────────────
// Clears any leftover trial data and sets mode to licensed.
// Ensures paid mode starts clean.

export function transitionToLicensed(): void {
  // Only wipe trial demo data when transitioning FROM trial mode.
  // Re-activating a paid license must NOT clear existing user trades.
  if (getDataMode() === 'trial') {
    for (const key of TRIAL_DATA_KEYS) {
      localStorage.removeItem(key)
    }
    localStorage.removeItem(TRIAL_SEEDED_KEY)
  }
  setDataMode('licensed')
}
