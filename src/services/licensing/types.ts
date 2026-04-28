// ── Licensing Types ───────────────────────────────────────────────────────────

/** Maximum devices allowed per paid license key */
export const MAX_DEVICES = 2

export type LicenseStatus =
  | 'active'          // paid license, fully activated
  | 'trial'           // free trial period
  | 'trialExpired'    // trial ended, needs purchase
  | 'revoked'         // license revoked by admin
  | 'invalid'         // key doesn't exist or is malformed
  | 'none'            // no license or trial on this device

export interface Session {
  deviceId: string
  licenseKey: string | null   // null for trial users
  status: LicenseStatus
  activatedAt: string         // ISO 8601
  expiresAt: string | null    // ISO 8601, null = lifetime
}

export interface ActivationResponse {
  success: boolean
  session: Session | null
  error?: string
}
