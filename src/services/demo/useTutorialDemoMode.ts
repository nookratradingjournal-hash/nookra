// ── Tutorial Demo Mode hook ─────────────────────────────────────────────────
// Global boolean flag that gates whether the app renders injected demo data
// in place of real user data. Persisted in localStorage under `tj-tutorial-
// demo-mode` so a mid-tutorial refresh stays in demo mode instead of
// snapping the user back to an empty journal while the tour is still on
// screen.
//
// Storage is a single '1' / absent flag — no JSON, no versioning, because
// the value has exactly one semantic (on or off) and cross-tab sync isn't
// a concern in a single-window Electron app. The `storage` event listener
// is still included defensively so a second window of the app (rare but
// possible during development) stays in sync.
//
// IMPORTANT: This flag controls RENDER behavior only. Every consumer is
// expected to swap in generated demo data when the flag is true, and to
// never write to real storage while the flag is set. See App.tsx for the
// injection points.

import { useCallback, useEffect, useState } from 'react'

const LS_KEY = 'tj-tutorial-demo-mode'

/** Read current demo-mode flag from localStorage. Safe to call at module
 *  scope / during SSR — returns false if storage isn't available. */
export function getTutorialDemoMode(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

/** Write the demo-mode flag. Dispatches a synthetic storage event so any
 *  hooks subscribed in this tab re-read immediately — the native `storage`
 *  event only fires for OTHER tabs. */
export function setTutorialDemoModeFlag(value: boolean): void {
  try {
    if (value) localStorage.setItem(LS_KEY, '1')
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
  try {
    window.dispatchEvent(new CustomEvent('tj-tutorial-demo-mode-change'))
  } catch {
    /* ignore in non-DOM contexts */
  }
}

/** React hook returning `[isDemoMode, setDemoMode]`. The setter updates
 *  localStorage and broadcasts to all other subscribers in the same tab. */
export function useTutorialDemoMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getTutorialDemoMode())

  useEffect(() => {
    const sync = () => setEnabled(getTutorialDemoMode())
    window.addEventListener('storage', sync)
    window.addEventListener('tj-tutorial-demo-mode-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('tj-tutorial-demo-mode-change', sync)
    }
  }, [])

  const set = useCallback((v: boolean) => {
    setTutorialDemoModeFlag(v)
    setEnabled(v)
  }, [])

  return [enabled, set]
}
