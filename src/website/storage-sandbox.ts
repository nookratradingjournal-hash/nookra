/**
 * In-memory localStorage polyfill for the marketing-site bundle.
 *
 * MUST be imported as the very first import in `src/website-entry.tsx`. ES6
 * module evaluation is depth-first in import order, so sitting at position
 * [0] guarantees this runs before the real app's `useAppStore` module
 * initializes — which is important because that module calls
 * `loadTrades()` / `loadSettings()` / `loadStartingBalance()` etc. at the
 * top level, all of which read from `localStorage`.
 *
 * Why sandbox at all?
 *   The website bundle imports the real Nookra components (HeroStats,
 *   Calendar, TradeList, Checklist, WidgetContent) and the real zustand
 *   store, so the marketing preview is literally the same code that ships
 *   in the Electron app. If we let the real `localStorage` through, every
 *   demo toggle would write persistent state into the visitor's browser.
 *   With this shim, every read/write lives in a Map that dies when the
 *   tab closes.
 *
 * Scope: only `localStorage`. `sessionStorage`, cookies, IndexedDB, and
 * anything else stay untouched. The real Electron app uses its own
 * per-app storage and is not reachable from the website origin — it was
 * never at risk.
 */

type StorageShim = Storage & { __nookraSandbox: true }

function makeShim(): StorageShim {
  const memory = new Map<string, string>()
  const shim: Storage = {
    get length() { return memory.size },
    clear() { memory.clear() },
    getItem(k) { return memory.has(k) ? memory.get(k)! : null },
    setItem(k, v) { memory.set(k, String(v)) },
    removeItem(k) { memory.delete(k) },
    key(i) { return Array.from(memory.keys())[i] ?? null },
  }
  ;(shim as StorageShim).__nookraSandbox = true
  return shim as StorageShim
}

// HMR guard — keep the same shim across dev reloads so mid-session state
// (e.g. "I clicked a checkbox") survives Vite's hot-module reshuffling.
const g = globalThis as unknown as { __nookraStorageShim?: StorageShim }

if (!g.__nookraStorageShim) {
  g.__nookraStorageShim = makeShim()
  try {
    Object.defineProperty(window, 'localStorage', {
      value: g.__nookraStorageShim,
      configurable: true,
      writable: false,
    })
  } catch {
    // Some browser extensions lock `localStorage`. If redefinition fails,
    // the demo still works — it'll just persist across visits on the
    // website origin, which is fine (still separate from Electron app data).
  }
}

export {}
