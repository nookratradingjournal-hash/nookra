// ── Local Session Cache ─────────────────────────────────────────────────────
// Caches the current session in localStorage so the app can show UI instantly
// on launch before the Supabase validation call completes.
//
// Server (Supabase) is the source of truth for:
//   - license keys & device activations  →  licenses + activations tables
//   - trial status & timing              →  trials table
//
// localStorage is the source of truth for:
//   - cached session (offline fallback / fast startup)
//   - data mode (trial vs licensed — local UI concern)
//   - trial-seeded flag (prevent re-seeding demo data)

import type { Session } from './types'

const SESSION_KEY = 'tj-license-session'

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
