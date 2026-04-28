import { create } from 'zustand'
import { Trade, TradeScreenshot, Settings, CustomOptions, ChecklistItem, ChecklistStrategy, MetricKey } from '../types'
import { systemTimezone } from '../utils/dates'

/**
 * Migrate any screenshot stored in the legacy plain-string format (from before
 * the two-track original/thumb split) to the current TradeScreenshot shape.
 * The string is used as both original and thumb so existing data still displays.
 * Anything malformed (null, undefined, wrong shape) collapses to empty strings
 * rather than crashing the render path downstream.
 */
function migrateScreenshot(s: unknown): TradeScreenshot {
  if (typeof s === 'string') return { original: s, thumb: s }
  if (s && typeof s === 'object') {
    const obj = s as Partial<TradeScreenshot>
    if (typeof obj.original === 'string' && typeof obj.thumb === 'string') {
      return { original: obj.original, thumb: obj.thumb }
    }
  }
  return { original: '', thumb: '' }
}

function migrateTrades(trades: Trade[]): Trade[] {
  if (!Array.isArray(trades)) return []
  return trades.map((t) => ({
    ...t,
    screenshots: Array.isArray(t.screenshots)
      ? t.screenshots.map(migrateScreenshot).filter((s) => s.original || s.thumb)
      : undefined,
  }))
}

// Default checklist for new users: ONE empty strategy. The previous default
// seeded four section spacers as scaffolding, but users read those as
// pre-authored content rather than editable placeholders. Now the Checklist
// component renders a proper empty state ("Your pre-trade routine is empty"
// + Add item) when a strategy has no items. Users build their own routine
// from scratch, inside whichever strategy is active.
function makeDefaultStrategies(): ChecklistStrategy[] {
  return [{ id: 's1', name: 'Strategy 1', items: [] }]
}

const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  timezone: systemTimezone(),   // defaults to the user's browser timezone
  visibleMetrics: ['winRate', 'totalPnl', 'avgWL'],
  quotesEnabled: true,
  fontSize: 'medium',
  radius: 'default',
  tileStyle: 'solid',
}

// ── localStorage helpers ─────────────────────────────────────────────────────

const LS_BALANCE        = 'tj-starting-balance'
const LS_TRADES         = 'tj-trades-v2'
const LS_FOCUS_NOTE     = 'tj-focus-note'
const LS_SETTINGS       = 'tj-settings'
const LS_STRATEGIES     = 'tj-strategies'
const LS_ACTIVE_STRAT   = 'tj-active-strategy'

function loadStartingBalance(): number {
  try {
    const v = localStorage.getItem(LS_BALANCE)
    const n = v !== null ? parseFloat(v) : NaN
    return isFinite(n) ? n : 10000
  } catch { return 10000 }
}

function loadTrades(): Trade[] {
  try {
    const v = localStorage.getItem(LS_TRADES)
    if (v === null) return []
    return migrateTrades(JSON.parse(v) as Trade[])
  } catch { return [] }
}

function saveTrades(trades: Trade[]) {
  try { localStorage.setItem(LS_TRADES, JSON.stringify(trades)) } catch {}
}

function saveStartingBalance(balance: number) {
  try { localStorage.setItem(LS_BALANCE, String(balance)) } catch {}
}

function loadFocusNote(): string {
  try { return localStorage.getItem(LS_FOCUS_NOTE) ?? '' } catch { return '' }
}

function saveFocusNote(note: string) {
  try {
    if (note) localStorage.setItem(LS_FOCUS_NOTE, note)
    else localStorage.removeItem(LS_FOCUS_NOTE)
  } catch {}
}

function loadSettings(): Settings {
  try {
    const v = localStorage.getItem(LS_SETTINGS)
    if (!v) return DEFAULT_SETTINGS
    const parsed = JSON.parse(v) as Partial<Settings>
    const merged = { ...DEFAULT_SETTINGS, ...parsed }
    return merged
  } catch { return DEFAULT_SETTINGS }
}

function saveSettings(s: Settings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)) } catch {}
}

// ── Checklist strategies persistence ────────────────────────────────────────
// Strategies (multi-checklist) persist across launches. Any malformed payload
// collapses to a single default strategy rather than crashing — the checklist
// is a creative surface, so losing a save is already painful; we never want
// the whole app to blank on top of that.

function sanitizeItems(items: unknown): ChecklistItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((i): i is ChecklistItem =>
      !!i && typeof i === 'object' &&
      typeof (i as ChecklistItem).id === 'string' &&
      ((i as ChecklistItem).kind === 'item' || (i as ChecklistItem).kind === 'spacer') &&
      typeof (i as ChecklistItem).text === 'string' &&
      typeof (i as ChecklistItem).checked === 'boolean'
    )
}

function loadStrategies(): ChecklistStrategy[] {
  try {
    const v = localStorage.getItem(LS_STRATEGIES)
    if (!v) return makeDefaultStrategies()
    const parsed = JSON.parse(v) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return makeDefaultStrategies()
    const out: ChecklistStrategy[] = parsed
      .map((s) => {
        if (!s || typeof s !== 'object') return null
        const obj = s as Partial<ChecklistStrategy>
        if (typeof obj.id !== 'string' || typeof obj.name !== 'string') return null
        return { id: obj.id, name: obj.name, items: sanitizeItems(obj.items) }
      })
      .filter((s): s is ChecklistStrategy => s !== null)
    return out.length > 0 ? out : makeDefaultStrategies()
  } catch { return makeDefaultStrategies() }
}

function saveStrategies(strategies: ChecklistStrategy[]) {
  try { localStorage.setItem(LS_STRATEGIES, JSON.stringify(strategies)) } catch {}
}

function loadActiveStrategyId(strategies: ChecklistStrategy[]): string {
  try {
    const v = localStorage.getItem(LS_ACTIVE_STRAT)
    if (v && strategies.some((s) => s.id === v)) return v
  } catch {}
  return strategies[0]?.id ?? 's1'
}

function saveActiveStrategyId(id: string) {
  try { localStorage.setItem(LS_ACTIVE_STRAT, id) } catch {}
}

// ── State interface ──────────────────────────────────────────────────────────

interface AppState {
  trades: Trade[]
  selectedDate: string | null
  isDayPanelOpen: boolean
  strategies: ChecklistStrategy[]
  activeStrategyId: string
  startingBalance: number
  focusNote: string
  isAddTradeOpen: boolean
  isSettingsOpen: boolean
  settings: Settings
  customOptions: CustomOptions
  /** Render-only trade injected by the behavioral tutorial when its demo
   *  submits the AddTradeModal. Never persisted — it's merged into
   *  `effectiveTrades` at render time so the user sees "their trade"
   *  appear on the dashboard, then it's cleared on tutorial exit. Kept
   *  in the store (not local App state) so the action engine can set it
   *  from anywhere without prop-drilling. Null when not in a demo. */
  tutorialTransientTrade: Trade | null

  selectDate: (date: string | null) => void
  setStartingBalance: (balance: number) => void
  setFocusNote: (note: string) => void
  openDayPanel: (date: string) => void
  closeDayPanel: () => void
  addTrade: (trade: Trade) => void
  removeTrade: (id: string) => void
  updateTrade: (trade: Trade) => void
  clearTrades: () => void
  importTrades: (trades: Trade[]) => void
  openAddTrade: () => void
  closeAddTrade: () => void
  openSettings: () => void
  closeSettings: () => void
  updateSettings: (s: Partial<Settings>) => void
  addCustomOption: (category: keyof CustomOptions, value: string) => void
  removeCustomOption: (category: keyof CustomOptions, value: string) => void

  /** Set or clear the tutorial's transient demo-trade preview (render-only). */
  setTutorialTransientTrade: (trade: Trade | null) => void

  addChecklistItem: (text: string) => void
  /** Insert a new item immediately after the item/spacer with the given id.
   *  Used by the empty-state quick-start suggestions so a suggestion lands
   *  under its relevant section header (e.g. "Review key levels" slots
   *  right below the "Bias" spacer) instead of piling at the bottom. If
   *  `afterId` isn't found we fall back to appending at the end. */
  addChecklistItemAfter: (afterId: string, text: string) => void
  addChecklistSpacer: (text: string) => void
  removeChecklistItem: (id: string) => void
  toggleChecklistItem: (id: string) => void
  editChecklistItem: (id: string, text: string) => void

  // ── Strategy management ──
  /** Create a new empty strategy and select it. Auto-named "Strategy N"
   *  where N is the smallest positive integer not already taken by a
   *  "Strategy N" name. */
  addStrategy: () => void
  renameStrategy: (id: string, name: string) => void
  /** Remove a strategy. Always keeps at least one strategy — a delete that
   *  would empty the list is a no-op. If the active strategy is removed,
   *  selection falls to the nearest neighbor. */
  removeStrategy: (id: string) => void
  setActiveStrategy: (id: string) => void
  /** Cycle through strategies. Wraps around the ends. No-op if only one. */
  nextStrategy: () => void
  prevStrategy: () => void

  /** Re-read all data from localStorage (call after trial seed or license activation) */
  reloadFromStorage: () => void
}

// ── Store ────────────────────────────────────────────────────────────────────

const INITIAL_STRATEGIES = loadStrategies()

export const useAppStore = create<AppState>((set) => ({
  trades: loadTrades(),
  selectedDate: null,
  isDayPanelOpen: false,
  strategies: INITIAL_STRATEGIES,
  activeStrategyId: loadActiveStrategyId(INITIAL_STRATEGIES),
  startingBalance: loadStartingBalance(),
  focusNote: loadFocusNote(),
  isAddTradeOpen: false,
  isSettingsOpen: false,
  settings: loadSettings(),
  tutorialTransientTrade: null,
  customOptions: {
    sessions: ['Pre-Market', 'Open', 'Midday', 'Power Hour', 'After Hours'],
    emotions: ['Calm', 'Focused', 'Confident', 'Anxious', 'Fearful', 'Greedy', 'Neutral', 'Revenge'],
    setupTypes: ['VWAP Reclaim', 'Bull Flag', 'Opening Drive', 'Failed Breakout', 'Distribution', 'Reversal', 'Inside Bar'],
  },

  selectDate: (date) => set({ selectedDate: date }),

  setStartingBalance: (balance) => {
    saveStartingBalance(balance)
    set({ startingBalance: balance })
  },

  setFocusNote: (note) => {
    saveFocusNote(note)
    set({ focusNote: note })
  },

  openDayPanel: (date) => set({ selectedDate: date, isDayPanelOpen: true }),
  closeDayPanel: () => set({ isDayPanelOpen: false }),

  addTrade: (trade) => set((s) => {
    const trades = [...s.trades, trade]
    saveTrades(trades)
    return { trades }
  }),

  removeTrade: (id) => set((s) => {
    const trades = s.trades.filter((t) => t.id !== id)
    saveTrades(trades)
    return { trades }
  }),

  updateTrade: (trade) => set((s) => {
    const trades = s.trades.map((t) => t.id === trade.id ? trade : t)
    saveTrades(trades)
    return { trades }
  }),

  clearTrades: () => {
    saveTrades([])
    set({ trades: [] })
  },

  importTrades: (trades) => {
    saveTrades(trades)
    set({ trades })
  },

  openAddTrade: () => set({ isAddTradeOpen: true }),
  closeAddTrade: () => set({ isAddTradeOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  updateSettings: (partial) => set((s) => {
    const next = { ...s.settings, ...partial }
    saveSettings(next)
    return { settings: next }
  }),

  addCustomOption: (category, value) =>
    set((s) => ({ customOptions: { ...s.customOptions, [category]: [...s.customOptions[category], value] } })),
  removeCustomOption: (category, value) =>
    set((s) => ({ customOptions: { ...s.customOptions, [category]: s.customOptions[category].filter((v) => v !== value) } })),

  setTutorialTransientTrade: (trade) => set({ tutorialTransientTrade: trade }),

  // ── Checklist mutations (operate on the ACTIVE strategy's items) ──
  // Each action finds the currently active strategy and updates only its
  // items array, leaving other strategies untouched. The whole strategies
  // array is persisted after every change so switching away and back
  // preserves state across launches.
  addChecklistItem: (text) =>
    set((s) => {
      const strategies = s.strategies.map((st) =>
        st.id === s.activeStrategyId
          ? { ...st, items: [...st.items, { id: Date.now().toString(), kind: 'item' as const, text, checked: false }] }
          : st,
      )
      saveStrategies(strategies)
      return { strategies }
    }),
  addChecklistItemAfter: (afterId, text) =>
    set((s) => {
      const strategies = s.strategies.map((st) => {
        if (st.id !== s.activeStrategyId) return st
        const idx = st.items.findIndex((i) => i.id === afterId)
        const newItem: ChecklistItem = { id: Date.now().toString(), kind: 'item', text, checked: false }
        if (idx < 0) return { ...st, items: [...st.items, newItem] }
        const next = st.items.slice()
        next.splice(idx + 1, 0, newItem)
        return { ...st, items: next }
      })
      saveStrategies(strategies)
      return { strategies }
    }),
  addChecklistSpacer: (text) =>
    set((s) => {
      const strategies = s.strategies.map((st) =>
        st.id === s.activeStrategyId
          ? { ...st, items: [...st.items, { id: `s${Date.now()}`, kind: 'spacer' as const, text, checked: false }] }
          : st,
      )
      saveStrategies(strategies)
      return { strategies }
    }),
  removeChecklistItem: (id) =>
    set((s) => {
      const strategies = s.strategies.map((st) =>
        st.id === s.activeStrategyId ? { ...st, items: st.items.filter((i) => i.id !== id) } : st,
      )
      saveStrategies(strategies)
      return { strategies }
    }),
  toggleChecklistItem: (id) =>
    set((s) => {
      const strategies = s.strategies.map((st) =>
        st.id === s.activeStrategyId
          ? { ...st, items: st.items.map((i) => (i.id === id && i.kind === 'item' ? { ...i, checked: !i.checked } : i)) }
          : st,
      )
      saveStrategies(strategies)
      return { strategies }
    }),
  editChecklistItem: (id, text) =>
    set((s) => {
      const strategies = s.strategies.map((st) =>
        st.id === s.activeStrategyId
          ? { ...st, items: st.items.map((i) => (i.id === id ? { ...i, text } : i)) }
          : st,
      )
      saveStrategies(strategies)
      return { strategies }
    }),

  // ── Strategy management ──
  addStrategy: () =>
    set((s) => {
      // Auto-name "Strategy N" with the smallest positive integer not in
      // use — keeps names stable and predictable even after deletes.
      const taken = new Set(s.strategies.map((x) => x.name))
      let n = 1
      while (taken.has(`Strategy ${n}`)) n++
      const id = `s${Date.now()}`
      const next: ChecklistStrategy = { id, name: `Strategy ${n}`, items: [] }
      const strategies = [...s.strategies, next]
      saveStrategies(strategies)
      saveActiveStrategyId(id)
      return { strategies, activeStrategyId: id }
    }),
  renameStrategy: (id, name) =>
    set((s) => {
      // Hardening guards — silently reject anything that would produce an
      // invalid or ambiguous state. UI reverts the draft to the current
      // name when the `name` prop doesn't change (see StrategySwitcher's
      // `useEffect(() => setDraft(name), [name, editing])`), so a rejected
      // rename naturally snaps back without extra plumbing.
      const trimmed = name.trim()
      if (!trimmed) return {}
      const target = s.strategies.find((st) => st.id === id)
      if (!target) return {}                           // unknown id — no-op
      if (target.name === trimmed) return {}           // no-op on identical
      const lower = trimmed.toLowerCase()
      const dup = s.strategies.some(
        (st) => st.id !== id && st.name.toLowerCase() === lower,
      )
      if (dup) return {}                               // case-insensitive duplicate → reject
      const strategies = s.strategies.map((st) => (st.id === id ? { ...st, name: trimmed } : st))
      saveStrategies(strategies)
      return { strategies }
    }),
  removeStrategy: (id) =>
    set((s) => {
      if (s.strategies.length <= 1) return {}
      const idx = s.strategies.findIndex((st) => st.id === id)
      if (idx < 0) return {}
      const strategies = s.strategies.filter((st) => st.id !== id)
      let activeStrategyId = s.activeStrategyId
      if (activeStrategyId === id) {
        // fall through to the next strategy, or the previous if we removed the tail
        const fallbackIdx = Math.min(idx, strategies.length - 1)
        activeStrategyId = strategies[fallbackIdx].id
      }
      // Final stability guard — if activeStrategyId was already dangling
      // before this delete (shouldn't happen in normal flow, but defensive
      // against corrupted localStorage), heal to the first strategy rather
      // than leaving selection pointed at nothing.
      if (!strategies.some((st) => st.id === activeStrategyId)) {
        activeStrategyId = strategies[0].id
      }
      saveActiveStrategyId(activeStrategyId)
      saveStrategies(strategies)
      return { strategies, activeStrategyId }
    }),
  setActiveStrategy: (id) =>
    set((s) => {
      if (!s.strategies.some((st) => st.id === id)) return {}
      saveActiveStrategyId(id)
      return { activeStrategyId: id }
    }),
  nextStrategy: () =>
    set((s) => {
      if (s.strategies.length < 2) return {}
      const idx = s.strategies.findIndex((st) => st.id === s.activeStrategyId)
      const nextIdx = (idx + 1) % s.strategies.length
      const id = s.strategies[nextIdx].id
      saveActiveStrategyId(id)
      return { activeStrategyId: id }
    }),
  prevStrategy: () =>
    set((s) => {
      if (s.strategies.length < 2) return {}
      const idx = s.strategies.findIndex((st) => st.id === s.activeStrategyId)
      const prevIdx = (idx - 1 + s.strategies.length) % s.strategies.length
      const id = s.strategies[prevIdx].id
      saveActiveStrategyId(id)
      return { activeStrategyId: id }
    }),

  reloadFromStorage: () => {
    const strategies = loadStrategies()
    set({
      trades: loadTrades(),
      startingBalance: loadStartingBalance(),
      focusNote: loadFocusNote(),
      settings: loadSettings(),
      strategies,
      activeStrategyId: loadActiveStrategyId(strategies),
    })
  },
}))

// ── Selectors ────────────────────────────────────────────────────────────────

/** Items for the currently active strategy. Falls back to an empty list if
 *  the active id somehow doesn't resolve (shouldn't happen — defensive). */
export function selectActiveChecklist(state: AppState): ChecklistItem[] {
  return state.strategies.find((s) => s.id === state.activeStrategyId)?.items ?? []
}

/** Currently active strategy (or null if none resolves). */
export function selectActiveStrategy(state: AppState): ChecklistStrategy | null {
  return state.strategies.find((s) => s.id === state.activeStrategyId) ?? null
}

export const tradesForDate = (trades: Trade[], date: string) =>
  trades.filter((t) => t.date === date)

// Re-export centralized metrics as the canonical stats function
export { computeMetrics as statsFromTrades } from '../utils/metrics'

// Re-export MetricKey so it can be imported from here if needed
export type { MetricKey }
