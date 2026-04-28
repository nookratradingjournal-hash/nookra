/**
 * Update-pipeline IPC handlers (shared by main.js + main-admin.js).
 *
 * Data sources (tried in this order for every `update:get-latest` call):
 *   1. Remote manifest   — UPDATES_MANIFEST_URL (env var or constant below).
 *                          A plain JSON document shaped { updates: UpdateEntry[] }
 *                          hosted on any static host (S3, R2, Cloudflare Pages,
 *                          GitHub Pages, Supabase Storage — anything public).
 *   2. Local bundled JSON — data/updates.json next to the app resources.
 *                          Only works in dev (the admin's source checkout) since
 *                          `data/` is not in electron-builder's files[] array.
 *                          Kept as a safety net when the remote is unreachable.
 *
 * Installers:   UpdateEntry.downloadUrls.{mac,windows} — absolute https URLs set
 *               by the admin form. Legacy entries may carry `/updates/{ver}/...`
 *               relative paths that resolve against `public/updates/`; those
 *               only work when installers physically ride with the build.
 *
 * IPC surface:
 *   update:get-current-version   (invoke) -> string          app.getVersion()
 *   update:get-platform          (invoke) -> 'mac'|'windows'|'other'
 *   update:get-latest            (invoke) -> LatestUpdateResult
 *   update:list                  (invoke) -> UpdateEntry[]   (local file only)
 *   update:save                  (invoke) -> { success, id?, error? } (local file only)
 *   update:delete                (invoke) -> { success, error? }       (local file only)
 *   update:open-download         (invoke) -> { success, error? }
 *
 * Everything uses ipcMain.handle so the renderer always gets a Promise
 * (clean error propagation via try/catch).
 */
const { ipcMain, shell, app } = require('electron')
const fs = require('fs')
const path = require('path')

// ── Remote manifest config ──────────────────────────────────────────────
// Production manifest lives in a public Supabase Storage bucket. Publishing
// a new updates.json there is what makes already-installed users see the
// new version on next launch / hourly check — this URL is the authoritative
// feed for every shipped build.
//
// Override: set UPDATES_MANIFEST_URL at process start to point at a staging
// or local manifest without rebuilding. Unset = use production.
const PRODUCTION_MANIFEST_URL =
  'https://cdfkjlrmhfbkrdkqybyz.supabase.co/storage/v1/object/public/updates/updates.json'
const UPDATES_MANIFEST_URL =
  process.env.UPDATES_MANIFEST_URL || PRODUCTION_MANIFEST_URL

// Dev-only visibility — lets devs confirm which manifest the app will hit.
// Using app.isPackaged instead of NODE_ENV because Electron doesn't set
// NODE_ENV in packaged builds, so a NODE_ENV-based guard would leak into
// shipped DMGs/EXEs. app.isPackaged is true iff running from an installed
// bundle, so this log is strictly dev-only.
if (!app.isPackaged) {
  console.info('[updates] manifest URL:', UPDATES_MANIFEST_URL)
}

// Hard cap on the remote fetch so a slow or dead CDN never hangs the launch
// flow. 5 s is generous for a static JSON blob on any real host.
const REMOTE_FETCH_TIMEOUT_MS = 5000

// ── Paths ───────────────────────────────────────────────────────────────
// Resolve once at startup. In packaged builds __dirname points inside the
// asar bundle — we want the writable copy next to the resources.
function dataFilePath() {
  // When packaged, electron-builder typically places `data/` alongside
  // app.asar via extraResources. Try both locations; whichever exists wins.
  const candidates = [
    path.join(app.getAppPath(), '..', 'data', 'updates.json'),     // packaged
    path.join(app.getAppPath(), 'data', 'updates.json'),            // dev (repo root)
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  // Default: repo root (dev). Create on first write.
  return path.join(app.getAppPath(), 'data', 'updates.json')
}

function readUpdates() {
  const file = dataFilePath()
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.updates) ? parsed.updates : []
  } catch (err) {
    console.error('[update-pipeline] failed to read', file, err)
    return []
  }
}

function writeUpdates(list) {
  const file = dataFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ updates: list }, null, 2), 'utf8')
}

// ── Remote manifest fetch ───────────────────────────────────────────────
// Returns the parsed `updates` array on success, or null on any failure
// (no URL configured, timeout, non-2xx, malformed JSON, wrong shape).
// Always returns — never throws — so the caller can short-circuit to the
// local fallback without a try/catch.
async function fetchRemoteManifest() {
  if (!UPDATES_MANIFEST_URL) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(UPDATES_MANIFEST_URL, {
      signal: controller.signal,
      // `no-store` keeps us from consuming a stale entry out of Electron's
      // shared HTTP cache — we want the freshest manifest on each launch.
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      console.warn('[update-pipeline] remote manifest HTTP', res.status)
      return null
    }
    const json = await res.json()
    if (!Array.isArray(json?.updates)) {
      console.warn('[update-pipeline] remote manifest missing updates[] array')
      return null
    }
    return json.updates
  } catch (err) {
    console.warn('[update-pipeline] remote manifest fetch failed:',
      err && err.message ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Semver helpers (main-side copy so we don't depend on renderer code) ──
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function isValidSemver(v) {
  return typeof v === 'string' && SEMVER_RE.test(v.trim())
}

function parseSemver(v) {
  const m = String(v).trim().match(SEMVER_RE)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  }
}

function compareVersions(a, b) {
  const pa = parseSemver(a); const pb = parseSemver(b)
  if (!pa || !pb) return 0
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  const len = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < len; i++) {
    const aId = pa.pre[i]; const bId = pb.pre[i]
    if (aId === undefined) return -1
    if (bId === undefined) return 1
    const aNum = /^\d+$/.test(aId); const bNum = /^\d+$/.test(bId)
    if (aNum && bNum) {
      const na = Number(aId); const nb = Number(bId)
      if (na !== nb) return na < nb ? -1 : 1
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1
    } else if (aId !== bId) {
      return aId < bId ? -1 : 1
    }
  }
  return 0
}

function hostPlatformSlug() {
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'win32') return 'windows'
  return 'other'
}

/** Pick the highest-version entry installable on the host platform. */
function pickLatestForHost(updates, host) {
  let best = null
  for (const u of updates) {
    // Platform filter — match against entry.platform (macOS/Windows/Both)
    if (host === 'mac'     && u.platform === 'Windows') continue
    if (host === 'windows' && u.platform === 'macOS')   continue
    // 'other' gets any entry (fallback)
    if (!best || compareVersions(u.version, best.version) === 1) best = u
  }
  return best
}

// ── Register handlers ───────────────────────────────────────────────────
// Idempotent — safe to call once per process, and both main.js and
// main-admin.js call this.
let registered = false
function register() {
  if (registered) return
  registered = true

  ipcMain.handle('update:get-current-version', () => app.getVersion())
  ipcMain.handle('update:get-platform', () => hostPlatformSlug())

  // "GET /api/latest-update" — returns the latest published update for
  // the host platform, or { status: 'none' } if nothing is available.
  //
  // Resolution order (first non-empty source wins):
  //   1. Remote manifest at UPDATES_MANIFEST_URL
  //   2. Local data/updates.json (dev fallback)
  // This is what makes already-installed users see newly published updates
  // without rebuilding the app — the remote manifest is the authoritative feed.
  ipcMain.handle('update:get-latest', async () => {
    try {
      const remote = await fetchRemoteManifest()
      const all = remote ?? readUpdates()
      if (all.length === 0) return { status: 'none', latest: null }
      const host = hostPlatformSlug()
      const latest = pickLatestForHost(all, host)
      if (!latest) return { status: 'none', latest: null }
      return { status: 'ok', latest }
    } catch (err) {
      return {
        status: 'error',
        latest: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle('update:list', () => readUpdates())

  // Save (create or overwrite by id / version).
  ipcMain.handle('update:save', (_e, entry) => {
    if (!entry || typeof entry !== 'object') {
      return { success: false, error: 'Invalid update payload' }
    }
    if (!isValidSemver(entry.version)) {
      return { success: false, error: 'Invalid semver — use x.y.z' }
    }
    if (entry.minimumVersion && !isValidSemver(entry.minimumVersion)) {
      return { success: false, error: 'Invalid minimumVersion' }
    }

    const list = readUpdates()
    const id = entry.id || `v${String(entry.version).replace(/\./g, '_')}`

    // Duplicate-version guard. If replacing the same id, allow it.
    const clash = list.find((u) => u.version === entry.version && u.id !== id)
    if (clash) {
      return { success: false, error: `Version ${entry.version} already exists` }
    }

    // Auto-generate download URLs relative to the installer folder. The
    // renderer resolves these against the app URL at open time.
    const downloadUrls = entry.downloadUrls ?? {
      mac:     entry.platform !== 'Windows' ? `/updates/${entry.version}/mac.dmg`     : undefined,
      windows: entry.platform !== 'macOS'   ? `/updates/${entry.version}/windows.exe` : undefined,
    }

    const record = {
      id,
      version: entry.version,
      title: entry.title ?? '',
      summary: entry.summary ?? '',
      body: entry.body ?? '',
      platform: entry.platform ?? 'Both',
      force: Boolean(entry.force),
      minimumVersion: entry.minimumVersion || undefined,
      downloadUrls,
      createdAt: entry.createdAt ?? Date.now(),
    }

    const idx = list.findIndex((u) => u.id === id)
    if (idx >= 0) list[idx] = record
    else list.push(record)

    writeUpdates(list)
    return { success: true, id }
  })

  ipcMain.handle('update:delete', (_e, id) => {
    if (!id) return { success: false, error: 'missing id' }
    const list = readUpdates()
    const next = list.filter((u) => u.id !== id)
    if (next.length === list.length) return { success: false, error: 'not found' }
    writeUpdates(next)
    return { success: true }
  })

  // Open the installer in the user's default handler.
  // The renderer sends a URL; if relative (/updates/…), we resolve it to
  // an absolute file:// URL rooted at public/updates.
  ipcMain.handle('update:open-download', async (_e, url) => {
    if (typeof url !== 'string' || !url) return { success: false, error: 'no url' }
    try {
      let target = url
      if (url.startsWith('/updates/')) {
        const abs = path.join(app.getAppPath(), 'public', url.replace(/^\//, ''))
        if (!fs.existsSync(abs)) {
          return { success: false, error: `Installer not found: ${url}` }
        }
        target = 'file://' + abs
      }
      await shell.openExternal(target)
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

module.exports = { register }
