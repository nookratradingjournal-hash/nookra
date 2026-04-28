// ── Update Client (renderer-side) ────────────────────────────────────────
// Thin, typed wrapper around the `window.updateAPI` bridge installed by
// preload.js. Also exposes the one function the rest of the app actually
// cares about: `checkForUpdate()` — which fetches the latest entry,
// compares to the running version, and returns a clear status verdict.

import type { LatestUpdateResult, UpdateEntry, HostPlatform } from './types'
import { compareVersions } from './versionCompare'

// ── Preload bridge contract ──────────────────────────────────────────────
// Narrow the global type so TS callers see a friendly API shape. The actual
// object is injected by preload.js via contextBridge.
interface UpdateAPI {
  getCurrentVersion(): Promise<string>
  getPlatform(): Promise<HostPlatform>
  getLatest(): Promise<LatestUpdateResult>
  openDownload(url: string): Promise<{ success: boolean; error?: string }>
  list(): Promise<UpdateEntry[]>
  save(entry: Partial<UpdateEntry>): Promise<{ success: boolean; id?: string; error?: string }>
  delete(id: string): Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    updateAPI?: UpdateAPI
  }
}

/** True when the renderer has a live IPC bridge (i.e. running inside Electron). */
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.updateAPI
}

// ── Verdict ──────────────────────────────────────────────────────────────
// Every callable downstream reduces to one of these five states. The
// modal/gate render logic is a simple switch on `status`.

export type UpdateVerdict =
  | { status: 'up-to-date';       current: string }
  | { status: 'update-available'; current: string; latest: UpdateEntry; forced: false }
  | { status: 'force-update';     current: string; latest: UpdateEntry; forced: true; reason: 'force' | 'minimum' }
  | { status: 'no-releases';      current: string }
  | { status: 'unsupported-host'; current: string }
  | { status: 'error';            current: string; error: string }

/**
 * Core decision logic — separated so it's testable without the bridge.
 * Mirrors what `checkForUpdate()` does after fetching data.
 */
export function deriveVerdict(
  current: string,
  host: HostPlatform,
  result: LatestUpdateResult,
): UpdateVerdict {
  if (host === 'other') return { status: 'unsupported-host', current }
  if (result.status === 'error')
    return { status: 'error', current, error: result.error }
  if (result.status === 'none' || !result.latest)
    return { status: 'no-releases', current }

  const latest = result.latest

  // Platform gate — main process already filters, but double-check here so
  // a hand-edited updates.json can't leak a wrong-OS installer through.
  if (host === 'mac'     && latest.platform === 'Windows') return { status: 'up-to-date', current }
  if (host === 'windows' && latest.platform === 'macOS')   return { status: 'up-to-date', current }

  const cmp = compareVersions(current, latest.version)

  // Current is newer or equal — nothing to do.
  if (cmp >= 0) return { status: 'up-to-date', current }

  // Minimum-version gate — client below this floor is blocked regardless
  // of the `force` flag. Takes precedence so the reason surfaces correctly.
  if (latest.minimumVersion &&
      compareVersions(current, latest.minimumVersion) === -1) {
    return { status: 'force-update', current, latest, forced: true, reason: 'minimum' }
  }

  if (latest.force) {
    return { status: 'force-update', current, latest, forced: true, reason: 'force' }
  }

  return { status: 'update-available', current, latest, forced: false }
}

/**
 * Fetch latest + decide verdict. Safe to call from effect hooks — never
 * throws; all failure paths return a verdict with `status: 'error'`.
 */
export async function checkForUpdate(): Promise<UpdateVerdict> {
  // Outside Electron (e.g. plain `vite` web preview) — nothing to check.
  if (!hasBridge()) {
    return { status: 'error', current: 'web', error: 'Update bridge unavailable' }
  }
  try {
    const [current, host, latest] = await Promise.all([
      window.updateAPI!.getCurrentVersion(),
      window.updateAPI!.getPlatform(),
      window.updateAPI!.getLatest(),
    ])
    return deriveVerdict(current, host, latest)
  } catch (err) {
    return {
      status: 'error',
      current: 'unknown',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Resolve which download URL to hand to `openDownload`.
 * Returns null if the entry has no installer for this host.
 */
export function pickDownloadUrl(
  entry: UpdateEntry,
  host: HostPlatform,
): string | null {
  if (host === 'mac'     && entry.downloadUrls.mac)     return entry.downloadUrls.mac
  if (host === 'windows' && entry.downloadUrls.windows) return entry.downloadUrls.windows
  return null
}
