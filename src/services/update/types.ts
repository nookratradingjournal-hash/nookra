// ── Update Pipeline Types ────────────────────────────────────────────────
// Shared across:
//   • Electron main process (main.js / main-admin.js) — reads/writes JSON
//   • Preload bridge (preload.js) — forwards IPC
//   • Renderer (React) — admin form + update modal
// One file so the data model can't drift between layers.

export type UpdatePlatform = 'macOS' | 'Windows' | 'Both'

export interface UpdateDownloadUrls {
  mac?: string
  windows?: string
}

/** Single release entry persisted to data/updates.json. */
export interface UpdateEntry {
  /** Stable unique id — v<version> with dots stripped (e.g. "v1_2_0"). */
  id: string
  /** Semver (x.y.z). */
  version: string
  title: string
  summary: string
  body: string
  platform: UpdatePlatform
  /** If true, client must install before using the app. */
  force: boolean
  /** Optional gate: clients below this version are blocked even if `force` is false. */
  minimumVersion?: string
  downloadUrls: UpdateDownloadUrls
  /** Unix ms when the entry was created. */
  createdAt: number
}

/** Result of GET /api/latest-update (IPC: update:get-latest). */
export type LatestUpdateResult =
  | { status: 'ok'; latest: UpdateEntry }
  | { status: 'none'; latest: null }
  | { status: 'error'; error: string; latest: null }

/** Host-platform slug used by the renderer when picking a download URL. */
export type HostPlatform = 'mac' | 'windows' | 'other'
