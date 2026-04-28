// ── Validation (Supabase) ────────────────────────────────────────────────────
// Calls Supabase RPC functions for all licensing operations.
// Each function returns the same ActivationResponse shape the rest of the app expects.

import type { Session, ActivationResponse } from './types'
import { supabase } from '../supabase'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse the session object that Supabase RPC returns inside its JSON */
function parseSession(raw: Record<string, unknown>): Session {
  return {
    deviceId: raw.deviceId as string,
    licenseKey: (raw.licenseKey as string) ?? null,
    status: raw.status as Session['status'],
    activatedAt: raw.activatedAt as string,
    expiresAt: (raw.expiresAt as string) ?? null,
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Validate a license key and register this device */
export async function validateKey(
  key: string,
  deviceId: string,
  deviceName: string,
): Promise<ActivationResponse> {
  const { data, error } = await supabase.rpc('activate_license', {
    p_license_key: key,
    p_device_id: deviceId,
    p_device_name: deviceName,
  })

  if (error) {
    return { success: false, session: null, error: error.message }
  }

  const result = data as Record<string, unknown>

  if (!result.success) {
    return { success: false, session: null, error: result.error as string }
  }

  return {
    success: true,
    session: parseSession(result.session as Record<string, unknown>),
  }
}

/** Start or resume a trial for this device */
export async function validateTrial(
  deviceId: string,
  deviceName: string,
): Promise<ActivationResponse> {
  const { data, error } = await supabase.rpc('start_trial', {
    p_device_id: deviceId,
    p_device_name: deviceName,
  })

  if (error) {
    return { success: false, session: null, error: error.message }
  }

  const result = data as Record<string, unknown>

  if (!result.success) {
    return { success: false, session: null, error: result.error as string }
  }

  return {
    success: true,
    session: parseSession(result.session as Record<string, unknown>),
  }
}

/** Validate an existing session against the server */
export async function validateSession(
  licenseKey: string | null,
  deviceId: string,
): Promise<ActivationResponse> {
  const { data, error } = await supabase.rpc('validate_session', {
    p_license_key: licenseKey,
    p_device_id: deviceId,
  })

  if (error) {
    return { success: false, session: null, error: error.message }
  }

  const result = data as Record<string, unknown>

  if (!result.success) {
    const status = result.status as string
    // Return session stubs so checkAccess can preserve the real status
    if (status === 'trialExpired' || status === 'revoked' || status === 'invalid' || status === 'none') {
      return {
        success: false,
        session: {
          deviceId,
          licenseKey: status === 'trialExpired' ? null : licenseKey,
          status: status as 'trialExpired' | 'revoked' | 'invalid' | 'none',
          activatedAt: '',
          expiresAt: null,
        },
        error: result.error as string,
      }
    }
    return { success: false, session: null, error: result.error as string }
  }

  return {
    success: true,
    session: parseSession(result.session as Record<string, unknown>),
  }
}

/** Deactivate a device from a license */
export async function deactivateDevice(
  licenseKey: string,
  deviceId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('deactivate_device', {
    p_license_key: licenseKey,
    p_device_id: deviceId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>
  return { success: result.success as boolean, error: result.error as string | undefined }
}

/** License info with device list */
export interface LicenseInfo {
  ownerName: string | null
  maxDevices: number
  deviceCount: number
  devices: {
    deviceId: string
    deviceName: string
    activatedAt: string
    lastSeenAt: string
  }[]
}

/** Fetch license details + all activated devices */
export async function fetchLicenseInfo(
  licenseKey: string,
): Promise<{ success: boolean; info?: LicenseInfo; error?: string }> {
  const { data, error } = await supabase.rpc('get_license_info', {
    p_license_key: licenseKey,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>

  if (!result.success) {
    return { success: false, error: result.error as string }
  }

  return {
    success: true,
    info: {
      ownerName: (result.ownerName as string) ?? null,
      maxDevices: result.maxDevices as number,
      deviceCount: result.deviceCount as number,
      devices: (result.devices as LicenseInfo['devices']) ?? [],
    },
  }
}

/** Update the license holder name on the server */
export async function updateOwnerName(
  licenseKey: string,
  ownerName: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_license_owner_name', {
    p_license_key: licenseKey,
    p_owner_name: ownerName,
  })
  if (error) return { success: false, error: error.message }
  const result = data as Record<string, unknown>
  return { success: result.success as boolean, error: result.error as string | undefined }
}

/** Check trial status for a device (used by ActivationScreen) */
export async function checkTrialStatus(
  deviceId: string,
): Promise<{ used: boolean; active: boolean; startedAt?: string; expiresAt?: string }> {
  const { data, error } = await supabase.rpc('check_trial_status', {
    p_device_id: deviceId,
  })

  if (error) {
    return { used: false, active: false }
  }

  const result = data as Record<string, unknown>
  return {
    used: result.used as boolean,
    active: result.active as boolean,
    startedAt: result.startedAt as string | undefined,
    expiresAt: result.expiresAt as string | undefined,
  }
}
