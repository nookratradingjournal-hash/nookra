// ── Licensing Service ────────────────────────────────────────────────────────
// Single interface for all licensing operations.
// Components import from here — never from validation or localSession directly.
//
// Backend: Supabase RPC functions (activate_license, start_trial, etc.)
// Local:   Session cache in localStorage for fast startup / offline fallback.

import type { ActivationResponse, LicenseStatus } from './types'
import { getSession, saveSession, clearSession } from './localSession'
import {
  validateKey,
  validateTrial,
  validateSession,
  deactivateDevice,
  checkTrialStatus,
  fetchLicenseInfo,
  updateOwnerName,
} from './validation'
import { clearTrialData, transitionToLicensed, isTrialSeeded, getDataMode } from './dataMode'
import { seedDemoData } from './demoData'
import { getDeviceId, getDeviceLabel } from './device'

// ── Network Error Detection ─────────────────────────────────────────────────
// Heuristic: if the error message does NOT contain an explicit rejection string,
// assume it's a network/connectivity issue and the server was simply unreachable.
const REJECTION_PATTERNS = [
  'not found', 'not valid', 'expired', 'revoked', 'not activated',
  'invalid', 'exceeded', 'limit reached',
]

function isNetworkError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase()
  // Positive network signals — definitely a connectivity problem
  if (/fetch|network|timeout|err_|econnrefused|enotfound|socket|dns|abort/i.test(lower)) {
    return true
  }
  // If it matches an explicit rejection, it's NOT a network error
  return !REJECTION_PATTERNS.some((pattern) => lower.includes(pattern))
}

export type { LicenseStatus, Session, ActivationResponse } from './types'
export type { LicenseInfo } from './validation'
export { MAX_DEVICES } from './types'
export { getDataMode } from './dataMode'

// ── Trial Exit Flag ─────────────────────────────────────────────────────────
// When a user explicitly exits a trial, set this flag so checkAccess() doesn't
// auto-resume the trial on next load. Cleared when user explicitly starts/resumes.
const TRIAL_EXITED_KEY = 'tj-trial-exited'

function setTrialExited(): void {
  localStorage.setItem(TRIAL_EXITED_KEY, '1')
}

function clearTrialExited(): void {
  localStorage.removeItem(TRIAL_EXITED_KEY)
}

function isTrialExited(): boolean {
  return localStorage.getItem(TRIAL_EXITED_KEY) === '1'
}

/** The licenseKey of the currently cached session, or null for trial/none.
 *  Thin read-through — avoids components importing from localSession.ts
 *  directly. Used by ActivationGate to key the per-license tutorial-
 *  completion map. */
export function getCurrentLicenseKey(): string | null {
  return getSession()?.licenseKey ?? null
}

/** Activate a paid license key */
export async function activateLicense(key: string): Promise<ActivationResponse> {
  const deviceId = getDeviceId()
  const deviceName = getDeviceLabel()

  clearTrialExited()  // License activation supersedes any trial exit state

  const result = await validateKey(key, deviceId, deviceName)

  if (result.success && result.session) {
    transitionToLicensed()
    saveSession(result.session)
  }

  return result
}

/** Start a free trial — or resume/block based on device history */
export async function startTrial(): Promise<ActivationResponse> {
  const deviceId = getDeviceId()
  const deviceName = getDeviceLabel()

  clearTrialExited()  // User explicitly chose to start/resume — allow auto-resume again

  const result = await validateTrial(deviceId, deviceName)

  if (result.success && result.session) {
    saveSession(result.session)

    // Seed demo data only on first trial start (not on resume)
    if (!isTrialSeeded()) {
      seedDemoData()
    }
  }

  return result
}

/** Check trial status for this device (used by ActivationScreen UI) */
export async function getTrialStatus(): Promise<{
  used: boolean
  active: boolean
  startedAt?: string
  expiresAt?: string
}> {
  return checkTrialStatus(getDeviceId())
}

/**
 * Check the current session state on app launch.
 * 1. Read cached session from localStorage
 * 2. Validate against Supabase (server is source of truth)
 * 3. If offline, trust the cache
 */
export async function checkAccess(): Promise<{
  status: LicenseStatus
  expiresAt: string | null
}> {
  const currentDeviceId = getDeviceId()
  let cached = getSession()

  // Reconcile: if cached session has a stale device ID (e.g., generated on a
  // different port before the cookie-based ID fix), clear the local cache so
  // the app re-authenticates with the correct device ID.
  // NOTE: we do NOT call deactivateDevice here — the old device's backend slot
  // stays registered. Only explicit user action should free a license slot.
  if (cached && cached.deviceId !== currentDeviceId) {
    clearSession()
    cached = null
  }

  if (!cached) {
    // No cached session — check if server knows about a trial for this device.
    // Wrap in try/catch so network failures don't throw and leave the app stuck.
    try {
      const trialStatus = await getTrialStatus()

      if (trialStatus.active && !isTrialExited()) {
        // Active trial exists on server and user didn't intentionally exit — resume it
        const resumed = await startTrial()
        if (resumed.success && resumed.session) {
          return { status: resumed.session.status, expiresAt: resumed.session.expiresAt }
        }
      }

      if (trialStatus.used && !trialStatus.active) {
        // Trial was used and expired
        clearTrialData()
        return { status: 'trialExpired', expiresAt: trialStatus.expiresAt ?? null }
      }

      // Admin reset of a device that had no cached session locally
      // (e.g., user hit Deactivate before the reset, or cache was cleared
      // independently). Server says {used:false, active:false}, but the
      // previous trial's localStorage — including the tj-trial-seeded flag
      // — may still be present. Without this wipe, the next Start Free
      // Trial would saveSession and then SKIP seedDemoData (because the
      // seeded flag survived), leaving the user staring at their prior
      // trial's edited data instead of the default starter dataset.
      if (!trialStatus.used && !trialStatus.active && getDataMode() === 'trial') {
        clearTrialData()
        clearTrialExited()
      }
    } catch {
      // Network error with no cached session — can't verify anything.
      // Fall through to return 'none' gracefully instead of crashing.
    }

    return { status: 'none', expiresAt: null }
  }

  // Validate cached session against Supabase.
  // If the server is unreachable but we have a cached session, trust the cache
  // (offline fallback) — only an explicit server rejection should clear it.
  let result: ActivationResponse
  try {
    result = await validateSession(cached.licenseKey, cached.deviceId)
  } catch {
    // Unexpected throw (network failure, etc.) — trust the cached session
    return { status: cached.status, expiresAt: cached.expiresAt }
  }

  if (result.success && result.session) {
    saveSession(result.session)
    return { status: result.session.status, expiresAt: result.session.expiresAt }
  }

  // ── Explicit server rejection vs network failure ──────────────────────────
  // validation.validateSession returns a session stub whenever the server
  // responded with a known rejection status ('none' | 'trialExpired' |
  // 'revoked' | 'invalid'). A null session means the RPC itself failed
  // (network / supabase unreachable). This signal is reliable — the old
  // string-matching heuristic on `error` misclassified "No active session"
  // (emitted by validate_session when a trial row has been deleted) as a
  // network error and silently kept the stale trial alive. Use the stub
  // presence instead.
  const rejection = result.session?.status
  if (rejection) {
    // Trial-scoped local data must be wiped when the trial is no longer
    // recognised by the server — covers natural expiration AND admin reset
    // (where `rejection` comes back as 'none' because the trial row is gone).
    if (rejection === 'trialExpired' || cached.status === 'trial') {
      clearTrialData()
      clearTrialExited()  // let the user start fresh cleanly
    }
    clearSession()
    return {
      status: rejection,
      expiresAt: rejection === 'trialExpired' ? (result.session?.expiresAt ?? null) : null,
    }
  }

  // Network / unknown failure — trust cache as offline fallback, unless the
  // cached status is already an end state.
  if (cached.status !== 'trialExpired') {
    return { status: cached.status, expiresAt: cached.expiresAt }
  }

  clearSession()
  return { status: 'none', expiresAt: null }
}

/**
 * Sign out / deactivate on this device.
 *
 * THIS IS THE ONLY INTENTIONAL SLOT-FREEING PATH.
 * Only explicit user action (clicking "Deactivate" in Settings) reaches here.
 * Network errors, cache misses, and stale device ID reconciliation never call
 * deactivateDevice() — they only clear the local cache without touching the
 * server-side activation slot.
 */
export async function deactivate(): Promise<void> {
  const session = getSession()
  clearSession()

  if (session?.status === 'trial') {
    // Mark that user intentionally exited the trial so checkAccess()
    // doesn't auto-resume it on the next load.
    setTrialExited()
  }

  // If paid license, tell server to free the device slot
  if (session?.status === 'active' && session.licenseKey) {
    await deactivateDevice(session.licenseKey, getDeviceId())
  }
}

/** Fetch full license info + device list from server */
export async function getLicenseInfo() {
  const key = getSession()?.licenseKey
  if (!key) return null
  const result = await fetchLicenseInfo(key)
  return result.success ? result.info! : null
}

/** Update the license holder's display name */
export async function setOwnerName(name: string): Promise<boolean> {
  const key = getSession()?.licenseKey
  if (!key) return false
  const result = await updateOwnerName(key, name)
  return result.success
}

/** Remove a specific device from the license (without clearing local session) */
export async function removeDevice(deviceId: string): Promise<boolean> {
  const key = getSession()?.licenseKey
  if (!key) return false
  const result = await deactivateDevice(key, deviceId)
  return result.success
}
