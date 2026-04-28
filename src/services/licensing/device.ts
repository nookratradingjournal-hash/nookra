// ── Device Identity ──────────────────────────────────────────────────────────
// Persistent device ID + human-readable display label.
//
// Device ID uses cookies as cross-port source of truth because localStorage
// is origin-scoped (localhost:5173 and localhost:5174 have separate storage).
// Cookies are domain-scoped (shared across all ports on the same hostname).

const DEVICE_ID_KEY = 'tj-device-id'
const COOKIE_NAME = 'tj_device_id'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

/** Get or create a persistent device UUID.
 *  Cookies are the cross-port source of truth; localStorage is a fast cache. */
export function getDeviceId(): string {
  // 1. Cookie = cross-port source of truth
  const fromCookie = getCookie(COOKIE_NAME)
  if (fromCookie) {
    localStorage.setItem(DEVICE_ID_KEY, fromCookie)
    return fromCookie
  }

  // 2. Fallback to localStorage (first run after this fix, or Electron)
  const fromStorage = localStorage.getItem(DEVICE_ID_KEY)
  if (fromStorage) {
    setCookie(COOKIE_NAME, fromStorage)
    return fromStorage
  }

  // 3. Generate new UUID and persist to both
  const id = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, id)
  setCookie(COOKIE_NAME, id)
  return id
}

/** Detect a human-readable device label from the environment */
export function getDeviceLabel(): string {
  // In Electron, the preload script exposes the real machine name
  const electronName = (window as unknown as Record<string, unknown>).electronAPI as
    | { deviceName?: string }
    | undefined
  if (electronName?.deviceName) return electronName.deviceName

  // Browser fallback — generic labels based on user agent
  const ua = navigator.userAgent

  if (/Macintosh|Mac OS X/i.test(ua)) return 'This Mac'
  if (/Windows/i.test(ua)) return 'This Windows PC'
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'This Linux PC'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android Device'

  return 'Current Device'
}

