// ── Admin Service ────────────────────────────────────────────────────────────
// Connects to Supabase admin RPC functions for license/trial/device management.

import { supabase } from '../supabase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalLicenses: number
  activeLicenses: number
  disabledLicenses: number
  totalDevices: number
  activeTrials: number
  expiredTrials: number
  totalTrials: number
}

export interface AdminLicense {
  id: string
  license_key: string
  email: string | null
  owner_name: string | null
  status: 'active' | 'disabled' | 'revoked'
  max_devices: number
  created_at: string
  device_count: number
}

export interface AdminTrial {
  id: string
  device_id: string
  device_name: string
  started_at: string
  expires_at: string
  status: 'active' | 'expired'
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats')
  if (error) throw new Error(error.message)
  return data as DashboardStats
}

// ── Licenses ─────────────────────────────────────────────────────────────────

export async function fetchAllLicenses(): Promise<AdminLicense[]> {
  const { data, error } = await supabase.rpc('admin_list_licenses')
  if (error) throw new Error(error.message)
  return (data as AdminLicense[]) ?? []
}

export async function updateLicenseStatus(
  licenseKey: string,
  status: 'active' | 'disabled' | 'revoked'
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_update_license_status', {
    p_license_key: licenseKey,
    p_status: status,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

export async function resetLicenseDevices(
  licenseKey: string
): Promise<{ success: boolean; removedCount?: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_reset_license_devices', {
    p_license_key: licenseKey,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; removedCount?: number; error?: string }
}

export async function createLicense(params: {
  licenseKey: string
  ownerName?: string
  email?: string
  maxDevices?: number
  status?: 'active' | 'disabled' | 'revoked'
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_license', {
    p_license_key: params.licenseKey,
    p_owner_name: params.ownerName ?? null,
    p_email: params.email ?? null,
    p_max_devices: params.maxDevices ?? 2,
    p_status: params.status ?? 'active',
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

export async function deleteLicense(
  licenseKey: string
): Promise<{ success: boolean; deletedActivations?: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_delete_license', {
    p_license_key: licenseKey,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; deletedActivations?: number; error?: string }
}

// ── Trials ───────────────────────────────────────────────────────────────────

export async function fetchAllTrials(): Promise<AdminTrial[]> {
  const { data, error } = await supabase.rpc('admin_list_trials')
  if (error) throw new Error(error.message)
  return (data as AdminTrial[]) ?? []
}

export async function resetTrial(
  trialId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_reset_trial', {
    p_trial_id: trialId,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

// ── Updates ─────────────────────────────────────────────────────────────
// Release-entry data model. `version`, `title`, `summary`, `body`, and
// `status` are the fields the Supabase `admin_create_update` /
// `admin_update_update` RPCs currently persist. The remaining fields
// (`release_type`, `force_update`, `min_version`, `platform`) are captured
// on the client now as part of the release-entry contract; they will be
// written to the server once the matching Supabase migration adds columns
// + RPC params (see `UPDATE_RPC_EXTRA_PARAMS` below). Until then they are
// locally composed into the `summary` string tail so they round-trip into
// the list view without silently disappearing.

export type ReleaseType = 'major' | 'minor' | 'patch'
export type UpdatePlatform = 'mac' | 'windows' | 'both'
export type UpdateStatus = 'draft' | 'published'

export interface AdminUpdate {
  id: string
  title: string
  summary: string
  body: string
  version: string
  status: UpdateStatus
  published_at: string | null
  created_at: string
  updated_at: string
  // ── Extended release-entry fields ──
  // These are currently derived on the client from the encoded `summary`
  // tail (see `decodeUpdateMeta`). Once the Supabase schema adds columns,
  // the server will populate them directly and the client decoder becomes
  // a no-op.
  release_type?: ReleaseType
  force_update?: boolean
  min_version?: string | null
  platform?: UpdatePlatform
  /** Absolute http(s) URL to the macOS installer (DMG). */
  mac_url?: string | null
  /** Absolute http(s) URL to the Windows installer (EXE). */
  win_url?: string | null
}

/** Full release-entry payload, used by both create + edit forms. */
export interface UpdateInput {
  title: string
  summary: string
  body: string
  version: string
  releaseType: ReleaseType
  forceUpdate: boolean
  minVersion?: string | null
  platform: UpdatePlatform
  status?: UpdateStatus
  /** Absolute http(s) URL to the macOS installer. Optional. */
  macUrl?: string | null
  /** Absolute http(s) URL to the Windows installer. Optional. */
  winUrl?: string | null
}

/** True if `s` is a non-empty absolute http(s) URL. Empty/missing counts as valid (URL is optional). */
export function isValidDownloadUrl(s: string | null | undefined): boolean {
  if (!s) return true
  const trimmed = s.trim()
  if (!trimmed) return true
  try {
    const u = new URL(trimmed)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

// ── Semver validation ────────────────────────────────────────────────────
// Strict-enough pattern for an x.y.z release string. Allows optional
// pre-release / build-metadata suffixes (e.g. 1.2.0-rc.1, 1.2.0+build.5).
// Rejects v-prefixed strings ("v1.2.0") so versions stay canonical.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function isValidSemver(v: string): boolean {
  return SEMVER_RE.test(v.trim())
}

/** Returns a human-readable reason, or null if the input is valid. */
export function validateUpdateInput(
  input: UpdateInput,
  existingUpdates: AdminUpdate[],
  currentId?: string,
): string | null {
  const version = input.version.trim()
  if (!version) return 'Version is required'
  if (!isValidSemver(version))
    return 'Invalid version — use semantic format like 1.2.0'

  // Duplicate check — same version not allowed on another entry.
  const clash = existingUpdates.find(
    (u) => u.version.trim() === version && u.id !== currentId,
  )
  if (clash) return `Version ${version} already exists`

  if (input.minVersion && input.minVersion.trim() && !isValidSemver(input.minVersion))
    return 'Minimum version must be valid semver (e.g. 1.0.0)'

  if (!isValidDownloadUrl(input.macUrl))
    return 'macOS download URL must be an absolute http(s) URL'

  if (!isValidDownloadUrl(input.winUrl))
    return 'Windows download URL must be an absolute http(s) URL'

  return null
}

// ── Meta encoding (temporary) ────────────────────────────────────────────
// The Supabase RPC only accepts title/summary/body/version/status today.
// To persist the extended fields without a DB migration, we append a
// machine-readable tail to `summary` and strip it back out on read. The
// tail is a single JSON payload prefixed with `|meta:` so humans reading
// the raw summary see the user-entered text first.
//
// Example stored summary:
//   "Quick bug fix for calendar|meta:{"rt":"patch","fu":false,"pl":"both"}"
//
// Once the DB migration adds native columns, `encodeUpdateMeta` becomes
// `return summary` and the caller passes the fields as real RPC params.

const META_PREFIX = '|meta:'

interface MetaTail {
  rt: ReleaseType
  fu: boolean
  mv?: string | null
  pl: UpdatePlatform
  /** Download URL — macOS installer. */
  dm?: string | null
  /** Download URL — Windows installer. */
  dw?: string | null
}

function encodeUpdateMeta(summary: string, input: UpdateInput): string {
  const tail: MetaTail = {
    rt: input.releaseType,
    fu: input.forceUpdate,
    mv: input.minVersion?.trim() || null,
    pl: input.platform,
    dm: input.macUrl?.trim() || null,
    dw: input.winUrl?.trim() || null,
  }
  const clean = summary.split(META_PREFIX)[0]
  return `${clean}${META_PREFIX}${JSON.stringify(tail)}`
}

export function decodeUpdateMeta(u: AdminUpdate): AdminUpdate {
  const idx = u.summary.indexOf(META_PREFIX)
  if (idx === -1) return u
  const displaySummary = u.summary.slice(0, idx)
  const tailJson = u.summary.slice(idx + META_PREFIX.length)
  try {
    const tail = JSON.parse(tailJson) as MetaTail
    return {
      ...u,
      summary: displaySummary,
      release_type: tail.rt,
      force_update: tail.fu,
      min_version: tail.mv ?? null,
      platform: tail.pl,
      mac_url: tail.dm ?? null,
      win_url: tail.dw ?? null,
    }
  } catch {
    // Corrupt tail — fall back to raw summary, leave extended fields unset.
    return { ...u, summary: displaySummary }
  }
}

export async function fetchAllUpdates(): Promise<AdminUpdate[]> {
  const { data, error } = await supabase.rpc('admin_list_updates')
  if (error) throw new Error(error.message)
  const raw = (data as AdminUpdate[]) ?? []
  return raw.map(decodeUpdateMeta)
}

export async function createUpdate(
  input: UpdateInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_update', {
    p_title: input.title,
    p_summary: encodeUpdateMeta(input.summary, input),
    p_body: input.body,
    p_version: input.version,
    p_status: input.status ?? 'draft',
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; id?: string; error?: string }
}

export async function editUpdate(
  input: UpdateInput & { id: string },
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_update_update', {
    p_id: input.id,
    p_title: input.title,
    p_summary: encodeUpdateMeta(input.summary, input),
    p_body: input.body,
    p_version: input.version,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

export async function publishUpdate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_publish_update', { p_id: id })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

export async function unpublishUpdate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_unpublish_update', { p_id: id })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

export async function deleteUpdate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_delete_update', { p_id: id })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; error?: string }
}

// ── Key Generation ───────────────────────────────────────────────────────────

/** Generate a random license key in XXXX-XXXX-XXXX-XXXX format */
export function generateKeyString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 for readability
  const rand = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  // First segment starts with "N", remaining 3 chars are random
  return `N${rand(3)}-${rand(4)}-${rand(4)}-${rand(4)}`
}
