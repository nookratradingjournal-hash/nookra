// ── Tutorial State ──────────────────────────────────────────────────────────
// Per-key, per-device persistence of whether the guided tour has been shown.
//
// Two storage tiers, one per onboarding flow:
//
//   LICENSED flow  →  `tutorial_completed_license_by_key`
//     A JSON map  { [licenseKey: string]: '1' }.
//     Completion is scoped to the SPECIFIC license key the user activated.
//     This is the fix for the "new key doesn't re-play the tutorial" bug —
//     the previous version stored a single boolean, so a second key
//     activated on the same device was mistakenly treated as already
//     onboarded.
//
//   TRIAL flow     →  `tutorial_completed_trial`
//     A single '1' flag. Trials are intrinsically per-device (server
//     enforces one trial per device), so there is no key to scope against.
//
// Because localStorage is per-install in Electron / per-origin in the
// browser, both tiers are intrinsically per-device. Combined with the
// per-key map entry, the resulting scope is "per license key per device"
// — the required "only once per key per device, unless reset" rule.
//
// Lifecycle
// ─────────
// The auto-trigger (`ActivationGate`) marks a flow done at the MOMENT the
// tour fires (not when the user finishes it). If a user starts the tour,
// skips halfway, deactivates, and reactivates on the same key, the flag
// is already set and the tour does NOT re-fire.
//
// Reset semantics
// ───────────────
//   clearTutorialDoneForKey(licenseKey)
//       Removes the map entry for ONE key. Every other key previously
//       onboarded on this device keeps its completion. Called by
//       ActivationGate's external-reset effect when an admin reset of the
//       current key is detected.
//
//   clearTutorialDoneForFlow('trial')
//       Clears the trial flag. Used when a trial is externally reset.
//
//   resetTutorial()
//       Nuclear option — wipes every flag. Dev tooling only. Replay
//       Tutorial in Settings does NOT call this (replay just restarts
//       the overlay without touching persistence).
//
// Legacy migration (forward-compat)
// ─────────────────────────────────
// Three earlier schemes are honored read-only and promoted into the map
// on first keyed read:
//
//   v1  tj-tutorial-completed-v1    — single shared boolean (both flows)
//   v2  tj-tutorial-licensed-v2      — per-flow boolean (old names)
//   v3  tutorial_completed_license   — per-flow boolean (pre-key-scoping)
//
// When `isTutorialDone('licensed', currentKey)` is called with a key AND
// any legacy license flag is set, the flag is migrated to `map[currentKey]
// = '1'` and removed. This preserves completion for the existing user's
// current key without assuming the same flag should apply to any future
// key they might activate on the same device.

// ── Canonical keys (current) ────────────────────────────────────────────────
const LICENSED_BY_KEY = 'tutorial_completed_license_by_key'   // JSON { key: '1' }
const TRIAL_KEY       = 'tutorial_completed_trial'             // '1'

// ── Legacy keys (read → migrate → remove) ───────────────────────────────────
const LICENSED_KEY_V3 = 'tutorial_completed_license'  // per-flow boolean
const LICENSED_KEY_V2 = 'tj-tutorial-licensed-v2'
const TRIAL_KEY_V2    = 'tj-tutorial-trial-v2'
const LEGACY_KEY_V1   = 'tj-tutorial-completed-v1'

export type TutorialFlow = 'licensed' | 'trial'

// ── License map helpers ─────────────────────────────────────────────────────
type LicenseMap = Record<string, '1'>

function readLicenseMap(): LicenseMap {
  try {
    const raw = localStorage.getItem(LICENSED_BY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as LicenseMap
    }
    return {}
  } catch {
    return {}
  }
}

function writeLicenseMap(map: LicenseMap): void {
  try {
    localStorage.setItem(LICENSED_BY_KEY, JSON.stringify(map))
  } catch { /* ignore — corrupted storage; next run falls back to empty */ }
}

function hasLegacyLicenseFlag(): boolean {
  return (
    localStorage.getItem(LICENSED_KEY_V3) === '1' ||
    localStorage.getItem(LICENSED_KEY_V2) === '1' ||
    localStorage.getItem(LEGACY_KEY_V1)   === '1'
  )
}

/** Remove every legacy license flag. v1 is shared across licensed+trial, so
 *  we first promote v1 → TRIAL_KEY to preserve trial completion on devices
 *  whose ONLY indicator was the v1 flag. */
function clearLegacyLicenseFlags(): void {
  try {
    if (localStorage.getItem(LEGACY_KEY_V1) === '1') {
      if (localStorage.getItem(TRIAL_KEY) !== '1') {
        localStorage.setItem(TRIAL_KEY, '1')
      }
      localStorage.removeItem(LEGACY_KEY_V1)
    }
    localStorage.removeItem(LICENSED_KEY_V3)
    localStorage.removeItem(LICENSED_KEY_V2)
  } catch { /* ignore */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** True if the tour has already been shown on this device for this flow.
 *  Licensed flow is scoped by licenseKey; trial flow is device-scoped.
 *  Legacy flags are migrated forward on first keyed read so existing users
 *  on their current key do not see a surprise re-run after this upgrade. */
export function isTutorialDone(flow: TutorialFlow, licenseKey?: string | null): boolean {
  try {
    if (flow === 'trial') {
      if (localStorage.getItem(TRIAL_KEY)     === '1') return true
      if (localStorage.getItem(TRIAL_KEY_V2)  === '1') return true
      if (localStorage.getItem(LEGACY_KEY_V1) === '1') return true
      return false
    }

    // Licensed flow needs a key to resolve completion precisely.
    if (!licenseKey) {
      // No key yet (e.g., pre-activation query). Fall back to any legacy
      // license flag so existing callers that don't pass a key still get
      // a sensible answer until the session is ready.
      return hasLegacyLicenseFlag()
    }

    const map = readLicenseMap()
    if (map[licenseKey] === '1') return true

    // Map entry missing but a legacy flag is set — almost certainly an
    // existing user on their current key. Promote the flag INTO the map
    // (scoped to this key) and clear the legacy flag so future key
    // changes on this device are correctly seen as first-time.
    if (hasLegacyLicenseFlag()) {
      map[licenseKey] = '1'
      writeLicenseMap(map)
      clearLegacyLicenseFlags()
      return true
    }

    return false
  } catch {
    return false
  }
}

/** Mark the tour as shown for this flow. Called when the tour first fires
 *  (not on completion) so that mid-tour deactivation cannot re-arm the
 *  trigger on re-entry.
 *
 *  Licensed flow requires a license key so completion can be scoped to
 *  exactly that key. If called without a key, licensed marking is a no-op
 *  — the trigger effect in ActivationGate always passes the active key. */
export function markTutorialDone(flow: TutorialFlow, licenseKey?: string | null): void {
  try {
    if (flow === 'trial') {
      localStorage.setItem(TRIAL_KEY, '1')
      return
    }
    if (!licenseKey) return
    const map = readLicenseMap()
    map[licenseKey] = '1'
    writeLicenseMap(map)
    // Migrating forward — once a scoped entry exists we don't need legacy
    // flags shadowing the map's answer for this key anymore.
    clearLegacyLicenseFlags()
  } catch { /* ignore */ }
}

/** Clear a flow's completion WHOLESALE.
 *    • trial    → trial flag + its v2 form (v1's licensed side is preserved).
 *    • licensed → wipes the ENTIRE per-key map. Prefer
 *                  clearTutorialDoneForKey for targeted resets.
 *
 *  Kept so existing callers that didn't know about key scoping (e.g., older
 *  admin-reset paths) still behave sensibly. */
export function clearTutorialDoneForFlow(flow: TutorialFlow): void {
  try {
    if (flow === 'trial') {
      localStorage.removeItem(TRIAL_KEY)
      localStorage.removeItem(TRIAL_KEY_V2)
      // Remove v1's trial side by clearing v1 (licensed side is preserved
      // via the licensed map which is untouched here).
      localStorage.removeItem(LEGACY_KEY_V1)
      return
    }
    // Licensed: wipe map + every legacy license flag so re-activation on
    // any key triggers a fresh onboarding.
    localStorage.removeItem(LICENSED_BY_KEY)
    localStorage.removeItem(LICENSED_KEY_V3)
    localStorage.removeItem(LICENSED_KEY_V2)
    if (localStorage.getItem(LEGACY_KEY_V1) === '1') {
      if (localStorage.getItem(TRIAL_KEY) !== '1') {
        localStorage.setItem(TRIAL_KEY, '1')
      }
      localStorage.removeItem(LEGACY_KEY_V1)
    }
  } catch { /* ignore */ }
}

/** Clear tutorial completion for ONE licensed key, preserving completion
 *  for every other key previously onboarded on this device. Called by
 *  ActivationGate's external-reset effect the moment it detects an admin
 *  reset of the key the user is currently (or was most recently) on. */
export function clearTutorialDoneForKey(licenseKey: string | null | undefined): void {
  if (!licenseKey) return
  try {
    const map = readLicenseMap()
    if (map[licenseKey]) {
      delete map[licenseKey]
      writeLicenseMap(map)
    }
    // Legacy flags would shadow the map's "missing" answer for this key
    // (see isTutorialDone's legacy fallback). Clear them so the next
    // activation of THIS key actually re-fires. v1 is shared with trial,
    // so promote its trial side first.
    if (localStorage.getItem(LEGACY_KEY_V1) === '1') {
      if (localStorage.getItem(TRIAL_KEY) !== '1') {
        localStorage.setItem(TRIAL_KEY, '1')
      }
      localStorage.removeItem(LEGACY_KEY_V1)
    }
    localStorage.removeItem(LICENSED_KEY_V3)
    localStorage.removeItem(LICENSED_KEY_V2)
  } catch { /* ignore */ }
}

/** Reset every tutorial flag — licensed map + trial + legacy. Intended for
 *  dev tooling / explicit full-wipe only. "Replay Tutorial" in Settings
 *  does NOT call this — replay just restarts the overlay without touching
 *  persistence, so the auto-trigger stays correctly armed. */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(LICENSED_BY_KEY)
    localStorage.removeItem(LICENSED_KEY_V3)
    localStorage.removeItem(LICENSED_KEY_V2)
    localStorage.removeItem(TRIAL_KEY)
    localStorage.removeItem(TRIAL_KEY_V2)
    localStorage.removeItem(LEGACY_KEY_V1)
  } catch { /* ignore */ }
}

// ── Back-compat aliases ─────────────────────────────────────────────────────
// Older callers without key awareness. Both route through the licensed flow
// without a key; legacy fallback preserves their prior behavior.

/** @deprecated use isTutorialDone('licensed', currentLicenseKey) */
export function isTutorialCompleted(): boolean {
  return isTutorialDone('licensed')
}

/** @deprecated use markTutorialDone('licensed', currentLicenseKey) */
export function markTutorialCompleted(): void {
  markTutorialDone('licensed')
}
