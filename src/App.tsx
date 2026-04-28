import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, tradesForDate, statsFromTrades } from './store/useAppStore'
import { getCurrencySymbol, fmtPnlCompact } from './utils/fmt'
import { localToday, fmtDateShort } from './utils/dates'
import { HeroStats } from './components/HeroStats'
import { Checklist } from './components/Checklist'
import { StrategySwitcher } from './components/StrategySwitcher'
import { Calendar } from './components/Calendar'
import { TradeList } from './components/TradeList'
import { DayPanel } from './components/DayPanel'
import { AddTradeModal } from './components/AddTradeModal'
import { SettingsPanel, type SectionId } from './components/settings/SettingsPanel'
import { CLOSE_BTN_CLASS } from './components/ui/Modal'
import { clsx } from 'clsx'
import { WidgetContent } from './components/widgets/WidgetContent'
import { ActivationGate, useLicense } from './components/ActivationGate'
import { UpdateGate } from './components/UpdateGate'
import { formatTrialRemaining } from './services/licensing/trialTime'
import { useTutorial, TutorialActionRunner } from './components/tutorial/TutorialContext'
import { TutorialSceneProvider } from './services/tutorial/sceneContext'
import type { DemoScript, TutorialSceneContext } from './services/tutorial/actions'
import { makeDemoTransientTrade } from './services/tutorial/behavioralSteps'
import { BANNER_TRANSITION, BANNER_VARIANTS } from './services/motion/motion'
import { useTutorialDemoMode } from './services/demo/useTutorialDemoMode'
import { generateTutorialDemoData } from './services/demo/tutorialDemoData'

// ── Trial Banner (header) ────────────────────────────────────────────────────

function TrialBanner() {
  const { status, expiresAt } = useLicense()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (status !== 'trial') return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [status])

  const isTrial = status === 'trial'
  const text = isTrial ? formatTrialRemaining(expiresAt) : ''

  // AnimatePresence handles mount/unmount so the pill fades+slides cleanly
  // when the user transitions into or out of the trial state (trial start,
  // upgrade to paid, trial expiry). Previously the chip appeared/disappeared
  // in a single frame, which felt abrupt against the rest of the header
  // chrome. Variants live in the shared motion module — 220ms, snappy ease,
  // small -4px y offset; no scale (chip is already tiny and a scale would
  // read as noise).
  return (
    <AnimatePresence>
      {isTrial && (
        <motion.div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning-soft border border-warning"
          variants={BANNER_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={BANNER_TRANSITION}
        >
          <div className="w-[4px] h-[4px] rounded-full bg-warning" />
          <span className="text-[10px] text-warning font-medium tabular-nums">{text}</span>
          <span className="text-[8px] text-warning uppercase tracking-wider ml-0.5 opacity-60">· Sample Data</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

type PlacedWidget = {
  id: string
  type: string
  zone: 'left' | 'right'
  row: number
  col: number
  size: { w: number; h: number }
}

const WIDGET_CARD_BASE = 'group rounded-xl border border-white/[0.06] bg-white/[0.02] text-left flex flex-col justify-between'

// Wrapper for the collapsed-state preview card above each widget size
// section (Small / Medium / Large) in the widgets drawer.
const COLLAPSED_PREVIEW_CARD = 'rounded-xl border border-white/[0.06] bg-white/[0.03] p-4'

const WIDGET_TILE = {
  small: { width: 140, height: 140 },
  medH:  { width: 292, height: 140 },
  medV:  { width: 140, height: 292 },
  large: { width: 292, height: 292 },
} as const

const WIDGET_LABELS: Record<string, string> = {
  // small — state indicators
  'small/day-grade':         'Day Grade',
  'small/daily-risk':        'Daily Risk',
  // small/rule-status removed: fully covered by large/discipline
  'small/streak':            'Streak',
  // small/overtrade removed: medium-h/overtrade is a strict superset
  'small/best-today':        "Best Today",
  // medium — pattern insight
  'medium-h/daily-pnl':      'Daily P&L',
  'medium-v/session':        'Sessions',
  'medium-v/bias':           'Direction',      // replaces medium-v/streak (was non-functional + duplicated recent-trades)
  'medium-h/recent-trades':  'Recent Trades',
  'medium-h/overtrade':      'Overtrade Check',
  // large — analysis tools
  'large/equity':            'Equity Curve',
  'large/discipline':        'Discipline',
  'large/setup':             'Setup Performance',
}

/**
 * Canonical (default) grid footprint for each widget type.
 * Single source of truth used by: drawer placement, load-time validation,
 * and anywhere else a type needs to resolve to a concrete {w, h}.
 */
const WIDGET_CANONICAL_SIZES: Record<string, { w: number; h: number }> = {
  // small — state indicators (1×1)
  'small/day-grade':         { w: 1, h: 1 },
  'small/daily-risk':        { w: 1, h: 1 },
  'small/streak':            { w: 1, h: 1 },
  'small/best-today':        { w: 1, h: 1 },
  // medium — pattern insight
  'medium-h/daily-pnl':      { w: 2, h: 1 },
  'medium-v/session':        { w: 1, h: 2 },
  'medium-v/bias':           { w: 1, h: 2 },
  'medium-h/recent-trades':  { w: 2, h: 1 },
  'medium-h/overtrade':      { w: 2, h: 1 },
  // large — analysis tools
  'large/equity':            { w: 2, h: 2 },
  'large/discipline':        { w: 2, h: 2 },
  'large/setup':             { w: 2, h: 2 },
}

const WIDGET_SIZES = [
  { label: 'Small', w: 1, h: 1 },
  { label: 'Wide',  w: 2, h: 1 },
  { label: 'Tall',  w: 1, h: 2 },
  { label: 'Large', w: 2, h: 2 },
] as const

function occupiesCells(pw: PlacedWidget): Set<string> {
  const s = new Set<string>()
  for (let r = pw.row; r < pw.row + pw.size.h; r++)
    for (let c = pw.col; c < pw.col + pw.size.w; c++)
      s.add(`${pw.zone}:${r}:${c}`)
  return s
}

function hasOverlap(
  placed: PlacedWidget[],
  zone: 'left' | 'right', row: number, col: number, w: number, h: number,
  excludeId?: string,
): boolean {
  const target = new Set<string>()
  for (let r = row; r < row + h; r++)
    for (let c = col; c < col + w; c++)
      target.add(`${zone}:${r}:${c}`)
  for (const pw of placed) {
    if (pw.id === excludeId) continue
    for (const cell of occupiesCells(pw))
      if (target.has(cell)) return true
  }
  return false
}

/**
 * Try to place a widget at (zone, targetRow, targetCol) with automatic reflow.
 *
 * Returns the updated widget list for the target zone — WITHOUT the new/moved widget
 * (caller appends it) — or null if no valid arrangement exists.
 *
 * Reflow strategy:
 *  1. Mark the target footprint as occupied.
 *  2. Leave stable widgets (non-blockers) in place.
 *  3. For each blocker (top-to-bottom), find the first free slot preferring
 *     rows BELOW the incoming widget, then falling back to rows above.
 *  4. If any blocker cannot be placed → return null (reject the drop).
 */
function tryReflow(
  allWidgets: PlacedWidget[],
  zone: 'left' | 'right',
  targetRow: number,
  targetCol: number,
  newW: number,
  newH: number,
  excludeId?: string,
  maxRowCount = N_ROWS,  // hard ceiling: no widget bottom edge may exceed this row index
): PlacedWidget[] | null {
  // Only consider widgets in the target zone that aren't being moved
  const zoneWidgets = allWidgets.filter(pw => pw.zone === zone && pw.id !== excludeId)

  // Cells claimed by the incoming widget
  const newCells = new Set<string>()
  for (let r = targetRow; r < targetRow + newH; r++)
    for (let c = targetCol; c < targetCol + newW; c++)
      newCells.add(`${r}:${c}`)

  // Partition zone widgets into blockers (overlap target) and stable (don't)
  const blockers: PlacedWidget[] = []
  const stable: PlacedWidget[] = []
  for (const pw of zoneWidgets) {
    let collision = false
    for (let r = pw.row; r < pw.row + pw.size.h && !collision; r++)
      for (let c = pw.col; c < pw.col + pw.size.w && !collision; c++)
        if (newCells.has(`${r}:${c}`)) collision = true
    if (collision) blockers.push(pw)
    else stable.push(pw)
  }

  // Fast path: nothing to move
  if (blockers.length === 0) return stable

  // Build occupancy from new widget + stable widgets
  const occupied = new Set<string>(newCells)
  for (const pw of stable)
    for (let r = pw.row; r < pw.row + pw.size.h; r++)
      for (let c = pw.col; c < pw.col + pw.size.w; c++)
        occupied.add(`${r}:${c}`)

  // Process blockers top-to-bottom for deterministic results
  blockers.sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)

  const reflowed: PlacedWidget[] = []
  for (const blocker of blockers) {
    // Valid row start indices for this blocker — capped to the visible row budget
    // so reflow can never push a widget below the aside's visible bottom edge.
    const rowCap = Math.min(N_ROWS, maxRowCount)
    const validRows = Array.from({ length: Math.max(0, rowCap - blocker.size.h + 1) }, (_, i) => i)
    // Prefer rows below the incoming widget, then rows above (top-to-bottom within each band)
    const rowOrder = [
      ...validRows.filter(r => r >= targetRow + newH),
      ...validRows.filter(r => r < targetRow + newH),
    ]
    let placed = false
    for (const r of rowOrder) {
      if (placed) break
      for (let c = 0; c <= COLS - blocker.size.w; c++) {
        let fits = true
        for (let dr = 0; dr < blocker.size.h && fits; dr++)
          for (let dc = 0; dc < blocker.size.w && fits; dc++)
            if (occupied.has(`${r + dr}:${c + dc}`)) fits = false
        if (fits) {
          reflowed.push({ ...blocker, row: r, col: c })
          for (let dr = 0; dr < blocker.size.h; dr++)
            for (let dc = 0; dc < blocker.size.w; dc++)
              occupied.add(`${r + dr}:${c + dc}`)
          placed = true
          break
        }
      }
    }
    if (!placed) return null // no room for this blocker — reject entirely
  }

  return [...stable, ...reflowed]
}

// ── Widget grid constants — single source of truth ───────────────────────────
const CELL     = 108   // cell size (px) — each grid unit is a 108×108 square
const GAP      = 12    // gap between grid cells (px)
const COLS     = 2     // columns per sidebar
const BORDER_W = 2     // aside CSS border width — must match Tailwind border-2
const ZONE_PAD = 12    // horizontal padding (left/right) inside the aside (px)
const PAD_V    = 16    // vertical padding (top/bottom) inside the aside (px)
const N_ROWS   = 12    // auto-growing row count; grid only creates rows that are used

/**
 * Magnetic snap helper — finds the nearest valid (row, col) slot for a widget
 * inside a zone, starting from the preferred position and expanding outward.
 *
 * Tries columns closest to `preferredCol` first at each row distance so the
 * snap feels "pulled" toward the cursor rather than jumping unpredictably.
 * Returns null only when the zone is genuinely full (no placement possible).
 */
function findSnapSlot(
  placed: PlacedWidget[],
  zone: 'left' | 'right',
  preferredRow: number,
  preferredCol: number,
  w: number,
  h: number,
  excludeId?: string,
  maxStartRow?: number,     // viewport-derived cap so widgets never overflow the aside
): { row: number; col: number } | null {
  const maxRow = Math.max(0, Math.min(N_ROWS - h, maxStartRow ?? N_ROWS - h))
  // Total visible row budget to forward to tryReflow so blockers are also bounded
  const maxRowCount = maxStartRow !== undefined ? maxStartRow + h : N_ROWS
  const maxCol = COLS - w

  // Build column list sorted by proximity to the preferred column
  const cols: number[] = []
  for (let c = 0; c <= maxCol; c++) cols.push(c)
  cols.sort((a, b) => Math.abs(a - preferredCol) - Math.abs(b - preferredCol))

  // Expand outward from preferredRow (up and down symmetrically)
  for (let dr = 0; dr <= maxRow; dr++) {
    for (const rSign of (dr === 0 ? [0] : [-1, 1])) {
      const baseR = preferredRow + dr * rSign
      if (baseR < 0 || baseR > maxRow) continue
      for (const c of cols) {
        // Use cursor-derived row directly — allow intentional gaps anywhere in the grid
        const r = baseR
        if (tryReflow(placed, zone, r, c, w, h, excludeId, maxRowCount) !== null) {
          return { row: r, col: c }
        }
      }
    }
  }
  return null
}

/** Pixel size of a widget spanning (w) columns and (h) rows in the grid. */
function widgetPxSize(w: number, h: number, cellH: number = CELL) {
  return { w: w * CELL + (w - 1) * GAP, h: h * cellH + (h - 1) * GAP }
}

/**
 * getSlotRect — viewport-space rectangle for a widget slot.
 * Columns and rows both use the fixed CELL stride.
 * Multi-row widgets always align with the rendered CSS grid.
 */
function getSlotRect(
  zone: 'left' | 'right',
  row: number,
  col: number,
  size: { w: number; h: number },
) {
  const el = document.getElementById(`widget-zone-${zone}`)
  const gridEl = document.getElementById(`widget-grid-${zone}`)
  if (!el || !gridEl) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0) return null
  const gr = gridEl.getBoundingClientRect()
  return {
    x: r.left + BORDER_W + ZONE_PAD + col * (CELL + GAP),
    y: gr.top + PAD_V + row * (CELL + GAP),
    ...widgetPxSize(size.w, size.h),
  }
}

// ── Layout persistence ────────────────────────────────────────────────────────
const LAYOUT_KEY = 'tj-widget-layout-v6'

function loadLayout(): PlacedWidget[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlacedWidget[]
    const validSizeKeys = new Set(WIDGET_SIZES.map(s => `${s.w}x${s.h}`))
    const valid = parsed.filter(pw => {
      if (typeof pw.id !== 'string' || typeof pw.type !== 'string') return false
      if (pw.zone !== 'left' && pw.zone !== 'right') return false
      const { w, h } = pw.size ?? {}
      if (!validSizeKeys.has(`${w}x${h}`)) return false
      if (pw.col < 0 || pw.col + w > COLS) return false
      // Drop any types that no longer exist in the widget registry
      if (!(pw.type in WIDGET_LABELS)) return false
      return true
    })
    // Preserve user-chosen positions — no compaction on load
    return valid
  } catch {
    return []
  }
}

function saveLayout(widgets: PlacedWidget[]): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(widgets)) } catch { /* ignore */ }
}

function SectionLabel({
  label,
  right,
}: {
  label: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.14em] whitespace-nowrap shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/[0.05]" />
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// Left gutter: all-time overview strip
function OverviewPanel({ trades, currency }: { trades: import('./types').Trade[]; currency: string }) {
  const sym = getCurrencySymbol(currency)
  const s = statsFromTrades(trades)

  const allTimePnl = trades.reduce((a, t) => a + t.result, 0)
  const bestDay = useMemo(() => {
    const byDay: Record<string, number> = {}
    trades.forEach((t) => { byDay[t.date] = (byDay[t.date] || 0) + t.result })
    return Math.max(0, ...Object.values(byDay))
  }, [trades])

  return (
    <div className="flex flex-col gap-5">
      <span className="text-[9px] font-bold text-white/15 uppercase tracking-[0.14em]">Overview</span>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/20 uppercase tracking-wide">All-time P&amp;L</span>
          <span className={clsx(
            'text-sm font-semibold tabular-nums',
            allTimePnl > 0 ? 'text-emerald-400' : allTimePnl < 0 ? 'text-red-400' : 'text-white/40'
          )}>
            {fmtPnlCompact(allTimePnl, sym)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/20 uppercase tracking-wide">Total Trades</span>
          <span className="text-sm font-semibold text-white/60 tabular-nums">{s.totalTrades}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/20 uppercase tracking-wide">Win Rate</span>
          <span className={clsx(
            'text-sm font-semibold tabular-nums',
            s.winRate >= 55 ? 'text-emerald-400' : s.winRate < 45 && s.winRate > 0 ? 'text-red-400' : 'text-white/60'
          )}>
            {s.winRate ? `${s.winRate}%` : '\u2014'}
          </span>
        </div>
        {bestDay > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-white/20 uppercase tracking-wide">Best Day</span>
            <span className="text-sm font-semibold text-emerald-400 tabular-nums">
              +{sym}{bestDay >= 1000 ? `${(bestDay / 1000).toFixed(1)}k` : bestDay.toFixed(0)}
            </span>
          </div>
        )}
        {s.bestSetup && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-white/20 uppercase tracking-wide">Best Setup</span>
            <span className="text-xs font-medium text-white/50 leading-tight">{s.bestSetup}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Right gutter: selected day snapshot
function DaySnapshot({
  date,
  trades,
  currency,
}: {
  date: string | null
  trades: import('./types').Trade[]
  currency: string
}) {
  const sym = getCurrencySymbol(currency)

  if (!date) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[9px] font-bold text-white/15 uppercase tracking-[0.14em]">Day</span>
        <p className="text-[10px] text-white/15 leading-relaxed mt-2">
          Click a date on the calendar to review it here.
        </p>
      </div>
    )
  }

  const dayPnl = trades.reduce((a, t) => a + t.result, 0)
  const wins = trades.filter((t) => t.outcome === 'win').length
  const losses = trades.filter((t) => t.outcome === 'loss').length
  const setups = [...new Set(trades.map((t) => t.setupType).filter(Boolean))]
  const emotions = [...new Set(trades.map((t) => t.emotionBefore).filter(Boolean))]
  const lessons = trades.map((t) => t.improve).filter(Boolean).slice(0, 2)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-bold text-white/15 uppercase tracking-[0.14em]">Day</span>
        <p className="text-[11px] text-white/40 mt-1">
          {fmtDateShort(date)}
        </p>
      </div>

      {trades.length === 0 ? (
        <p className="text-[10px] text-white/15">No trades logged.</p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-white/20 uppercase tracking-wide">P&amp;L</span>
            <span className={clsx(
              'text-sm font-semibold tabular-nums',
              dayPnl > 0 ? 'text-emerald-400' : dayPnl < 0 ? 'text-red-400' : 'text-white/40'
            )}>
              {fmtPnlCompact(dayPnl, sym)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-white/20 uppercase tracking-wide">Result</span>
            <span className="text-xs text-white/50 tabular-nums">{wins}W &middot; {losses}L</span>
          </div>
          {setups.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-white/20 uppercase tracking-wide">Setups</span>
              <div className="flex flex-col gap-0.5">
                {setups.map((s) => (
                  <span key={s} className="text-[10px] text-white/40 leading-tight">{s}</span>
                ))}
              </div>
            </div>
          )}
          {emotions.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-white/20 uppercase tracking-wide">Emotion</span>
              <span className="text-[10px] text-white/40">{emotions.join(', ')}</span>
            </div>
          )}
          {lessons.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-white/20 uppercase tracking-wide">Lessons</span>
              {lessons.map((l, i) => (
                <p key={i} className="text-[10px] text-white/30 leading-relaxed line-clamp-2">{l}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── FontSizeController ──────────────────────────────────────────────────────
// Mounted ONLY inside the main journal (child of ActivationGate). This scopes
// font-size scaling to the post-activation view: as long as this component is
// mounted it overrides <html>'s 18px baseline with the user's pref; on unmount
// (user deactivates, trial expires, license revoked) the inline style clears
// and <html> snaps back to the 18px CSS baseline so every system UI surface
// — activation, onboarding, welcome, settings — stays at the locked "large"
// size regardless of what the user chose inside the journal.
function FontSizeController() {
  const { settings } = useAppStore()
  useEffect(() => {
    const fs   = settings.fontSize ?? 'medium'
    const size = fs === 'small' ? '14px' : fs === 'large' ? '18px' : '16px'
    document.documentElement.style.fontSize = size
    document.documentElement.setAttribute('data-font-size', fs)
    return () => {
      document.documentElement.style.fontSize = ''
      document.documentElement.removeAttribute('data-font-size')
    }
  }, [settings.fontSize])
  return null
}

export default function App() {
  const {
    trades,
    selectedDate,
    isDayPanelOpen,
    strategies,
    activeStrategyId,
    startingBalance,
    focusNote,
    isAddTradeOpen,
    isSettingsOpen,
    settings,
    customOptions,
    selectDate,
    openDayPanel,
    closeDayPanel,
    addTrade,
    removeTrade,
    updateTrade,
    openAddTrade,
    closeAddTrade,
    openSettings,
    closeSettings,
    addCustomOption,
    removeCustomOption,
    addChecklistItem,
    addChecklistItemAfter,
    addChecklistSpacer,
    removeChecklistItem,
    toggleChecklistItem,
    editChecklistItem,
    addStrategy,
    renameStrategy,
    removeStrategy,
    nextStrategy,
    prevStrategy,
    tutorialTransientTrade,
    setTutorialTransientTrade,
  } = useAppStore()

  // Derive the active strategy's items + name from store. Done once here so
  // the Checklist, header chip and Add Trade modal all see a single source
  // of truth — strategies[activeStrategyId].items.
  const activeStrategy = strategies.find((s) => s.id === activeStrategyId) ?? strategies[0]
  const checklist = activeStrategy?.items ?? []
  const activeStrategyName = activeStrategy?.name ?? ''

  // Font size scaling is handled by <FontSizeController /> which is mounted
  // inside the main journal wrapper (children of ActivationGate). That
  // scopes the setting to the authenticated journal view — pre-app screens
  // (activation, onboarding, welcome) stay pinned to the 18px CSS baseline
  // in index.css and never respond to the user's pref.

  // Radius / contrast / density — written as data-attrs on <html> so the
  // gated CSS blocks in index.css can key off them. Each attribute is
  // driven by its own setting and lives in its own effect so deps are
  // actually correct. When a value is the default (or unset), the
  // attribute is removed rather than written, so the corresponding gated
  // CSS block stays dormant.
  //
  // Previously a single effect hard-coded data-contrast="high" on every
  // mount (and tied all three writes to settings.radius). That unconditionally
  // activated the [data-contrast="high"] override block inside .journal-root,
  // flattening the authored low-alpha typography ladder and making the page
  // feel stiff/washed. Fix: stop forcing it; only turn it on when a real
  // (future) settings.contrast opts in.
  useEffect(() => {
    const v = settings.radius ?? 'default'
    if (v === 'default') document.documentElement.removeAttribute('data-radius')
    else                 document.documentElement.setAttribute('data-radius', v)
  }, [settings.radius])

  useEffect(() => {
    // settings.contrast is not (yet) part of the Settings type; read defensively
    // so future accessibility setting can toggle this without a type change.
    const v = (settings as { contrast?: string }).contrast ?? 'default'
    if (v === 'high') document.documentElement.setAttribute('data-contrast', 'high')
    else              document.documentElement.removeAttribute('data-contrast')
  }, [(settings as { contrast?: string }).contrast])

  useEffect(() => {
    const v = (settings as { density?: string }).density ?? 'default'
    if (v === 'default') document.documentElement.removeAttribute('data-density')
    else                 document.documentElement.setAttribute('data-density', v)
  }, [(settings as { density?: string }).density])

  const now = new Date()
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [editingTrade, setEditingTrade] = useState<import('./types').Trade | null>(null)

  // Widget drawer state
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false)
  const widgetMenuRef = useRef<HTMLDivElement>(null)

  // Escape key closes the widget drawer — mirrors the Modal primitive's
  // behavior so keyboard dismiss works consistently across every overlay.
  useEffect(() => {
    if (!widgetMenuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWidgetMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [widgetMenuOpen])

  // ── Tutorial scene controller ────────────────────────────────────────────
  // While the guided tour is running, specific steps need a panel to be open
  // so the spotlight has a visible element to highlight. We open the panel
  // on entry and close it on exit — but ONLY if the tutorial was the one
  // that opened it. If the user already had the panel open, or opens it
  // themselves, we leave their choice alone. A ref tracks this ownership
  // so normal (non-tutorial) open/close behavior is never disturbed.
  //
  // Settings is now broken into FIVE sub-steps (font, currency, balance,
  // metrics, license). For each, we keep the panel open and drive its
  // internal nav via `settingsForceSection` so the highlighted control is
  // always the one actually visible on screen. The panel stays open for
  // the whole sub-sequence — `settingsOpenDuringTutorial` short-circuits
  // the close-on-exit branch until the tour leaves the `settings-*` group.
  const { currentStepId: tutorialStepId, next: tutorialNext, active: tutorialActive } = useTutorial()

  // ── Tutorial Demo Mode ───────────────────────────────────────────────────
  // While the tour is running we render a pre-baked set of "today" trades
  // so a first-run user sees a populated dashboard from the very first
  // screen. The flag is persisted in localStorage (`tj-tutorial-demo-mode`)
  // so a mid-tutorial refresh keeps the demo on instead of snapping back to
  // an empty state behind the overlay. Exiting the tutorial (finish, skip,
  // or the safety-clear below on remount without an active tour) flips the
  // flag off and the app returns to the user's real — usually empty — data.
  //
  // Critical property: demo data is ONLY injected at render time via the
  // swap below. We never call addTrade / importTrades / saveTrades with
  // demo data, so a real trade written during demo mode cannot coexist
  // with the fake ones, and exit never has anything to "clean up" from
  // persistent storage.
  const [isDemoMode, setDemoMode] = useTutorialDemoMode()
  const demoBundle = useMemo(
    () => (isDemoMode ? generateTutorialDemoData(settings.timezone) : null),
    [isDemoMode, settings.timezone],
  )
  // The `effective*` values are what every consumer below should read —
  // they fall back to real store data when demo mode is off. One place to
  // swap keeps the injection airtight (no "one forgotten hook" leaking real
  // data into the tour).
  //
  // Transient-trade merge: when the behavioral tutorial's trade-fill demo
  // auto-submits, the submitted trade is captured into the store's
  // `tutorialTransientTrade` slot (see `safeAddTrade` below) and prepended
  // here so it appears in Recent Trades + stats. It's never persisted;
  // the action engine clears the slot on tour exit.
  const effectiveTrades = useMemo(() => {
    const base = demoBundle ? demoBundle.trades : trades
    if (isDemoMode && tutorialTransientTrade) {
      return [tutorialTransientTrade, ...base]
    }
    return base
  }, [demoBundle, trades, isDemoMode, tutorialTransientTrade])
  const effectiveStartingBalance = demoBundle ? demoBundle.startingBalance : startingBalance

  // ── Behavioral tutorial: demo-script seed for AddTradeModal ──────────────
  // The action engine sets this via ctx.addTrade.setDemoScript. When non-null
  // and the modal is open, the modal typewriter-fills its fields and
  // auto-submits. Cleared by `resetAll` on tutorial close.
  const [addTradeDemoScript, setAddTradeDemoScript] = useState<DemoScript | null>(null)

  // Lifecycle: follow the tutorial's active state. Ref guards the
  // "exited" transition so we only flip OFF after we've seen at least
  // one active moment (prevents the initial render — when the overlay
  // hasn't fired yet — from clearing a legitimately persisted flag).
  const sawTutorialActiveRef = useRef(false)
  useEffect(() => {
    if (tutorialActive) {
      sawTutorialActiveRef.current = true
      if (!isDemoMode) setDemoMode(true)
      return
    }
    if (sawTutorialActiveRef.current && isDemoMode) {
      // Brief fade window so the dashboard doesn't snap — the
      // `.demo-exit-fade` class drives a 260ms opacity fade on the
      // demo-labelled content, then the flag flips and the real data
      // (usually empty) reveals in. Matches the tooltip exit tempo.
      document.documentElement.classList.add('demo-exiting')
      const t = window.setTimeout(() => {
        setDemoMode(false)
        document.documentElement.classList.remove('demo-exiting')
      }, 260)
      return () => window.clearTimeout(t)
    }
  }, [tutorialActive, isDemoMode, setDemoMode])

  // Safety clear: if the flag is set on mount but no tutorial ever fires
  // this session (e.g. user refreshed AFTER skipping), flush it after a
  // short grace window so we don't show ghost demo data. The grace window
  // gives ActivationGate time to auto-start the tour on first launch.
  useEffect(() => {
    if (!isDemoMode) return
    const t = window.setTimeout(() => {
      if (!sawTutorialActiveRef.current) setDemoMode(false)
    }, 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Force today selected while demo mode is active so the calendar
  // highlights today and DayPanel (when opened) shows today's trades.
  // Runs once on demo activation — we don't want to fight the user if
  // they click another date within the calendar during the tour.
  useEffect(() => {
    if (!isDemoMode) return
    const today = localToday(settings.timezone)
    if (selectedDate !== today) selectDate(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode])

  // Demo-aware addTrade: during demo mode we refuse the real localStorage
  // write. Two sub-modes:
  //   • The behavioral tutorial autofill submits a trade: route it into
  //     `tutorialTransientTrade` so the dashboard visibly updates. This
  //     is the "show, don't tell" reveal in the demo-trade-fill step.
  //   • Anything else (user somehow manually submits during demo): drop
  //     silently with a console warning. The modal closes regardless.
  // Consumers pass `safeAddTrade` into AddTradeModal — single gate.
  const safeAddTrade = useCallback(
    (trade: import('./types').Trade) => {
      if (isDemoMode) {
        if (addTradeDemoScript) {
          // Pin a stable id so the pulseSelector in the next step can
          // target this specific row without knowing the generated one.
          const t = makeDemoTransientTrade(trade.date)
          setTutorialTransientTrade(t)
          return
        }
        // eslint-disable-next-line no-console
        console.warn('[tutorial-demo] Ignoring addTrade — finish the tour to start logging.')
        return
      }
      addTrade(trade)
    },
    [isDemoMode, addTradeDemoScript, addTrade, setTutorialTransientTrade],
  )
  // Set of step IDs that belong to the widgets sub-walkthrough. Used to
  // keep the drawer open and force sections expanded across the whole
  // progressive flow — not just the first step.
  const WIDGET_TUTORIAL_STEPS = new Set([
    'widgets', 'widgets-highlight', 'widgets-sizes',
  ])
  const isWidgetTutorialStep =
    typeof tutorialStepId === 'string' && WIDGET_TUTORIAL_STEPS.has(tutorialStepId)
  const tutorialOpenedSettingsRef = useRef(false)
  const tutorialOpenedWidgetsRef  = useRef(false)
  const [settingsForceSection, setSettingsForceSection] = useState<SectionId | undefined>(undefined)

  // Map each settings-* step id → which nav section to show inside the panel.
  // Kept colocated with the scene controller so the contract is obvious.
  const SETTINGS_STEP_TO_SECTION: Record<string, SectionId> = {
    'settings-font':       'appearance',
    'settings-radius':     'appearance',
    'settings-tile-style': 'appearance',
    'settings-currency':   'trading',
    'settings-balance':    'trading',
    'settings-metrics':    'metrics',
    'settings-license':    'license',
  }

  useEffect(() => {
    const isSettingsStep = typeof tutorialStepId === 'string' && tutorialStepId in SETTINGS_STEP_TO_SECTION

    // Settings sub-step — keep panel open and switch its active section.
    if (isSettingsStep) {
      if (!isSettingsOpen) {
        tutorialOpenedSettingsRef.current = true
        openSettings()
      }
      setSettingsForceSection(SETTINGS_STEP_TO_SECTION[tutorialStepId as string])
    } else if (tutorialOpenedSettingsRef.current) {
      // Left the settings-* group — release the section lock and close the
      // panel (only if the tutorial is what opened it in the first place).
      tutorialOpenedSettingsRef.current = false
      setSettingsForceSection(undefined)
      closeSettings()
    } else {
      // Panel wasn't tutorial-owned; still drop the force so the user's
      // own navigation resumes working normally.
      setSettingsForceSection(undefined)
    }

    // Widgets sub-walkthrough — same ownership pattern for the widget drawer.
    // Drawer stays open across the entire widgets-* step group.
    if (isWidgetTutorialStep) {
      if (!widgetMenuOpen) {
        tutorialOpenedWidgetsRef.current = true
        setWidgetMenuOpen(true)
      }
    } else if (tutorialOpenedWidgetsRef.current) {
      tutorialOpenedWidgetsRef.current = false
      setWidgetMenuOpen(false)
    }

    // Tour ended (skip / finish) while we still own a panel — tidy up.
    if (tutorialStepId === null) {
      if (tutorialOpenedSettingsRef.current) {
        tutorialOpenedSettingsRef.current = false
        setSettingsForceSection(undefined)
        closeSettings()
      }
      if (tutorialOpenedWidgetsRef.current) {
        tutorialOpenedWidgetsRef.current = false
        setWidgetMenuOpen(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStepId])
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ small: true, medium: false, large: false })
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Tutorial: force-expand all sections during the widgets sub-walkthrough.
  // Snapshots the user's collapse state before forcing, restores it on exit
  // so a user who had Medium/Large collapsed before onboarding gets those
  // collapsed again when the tour finishes. Keeps the tutorial from leaving
  // the picker in a "more noisy" state permanently.
  const savedSectionsRef = useRef<Record<string, boolean> | null>(null)
  useEffect(() => {
    if (isWidgetTutorialStep) {
      if (!savedSectionsRef.current) {
        savedSectionsRef.current = expandedSections
      }
      // Force all sections open so the user can see everything at once.
      setExpandedSections({ small: true, medium: true, large: true })
    } else if (savedSectionsRef.current) {
      setExpandedSections(savedSectionsRef.current)
      savedSectionsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWidgetTutorialStep])

  // Placed widgets in sidebars
  const [placedWidgets, setPlacedWidgets] = useState<PlacedWidget[]>(loadLayout)

  // ── Tutorial: advance-on-event for `widgets-highlight`.
  // The user learns by doing — when they drop their first widget while the
  // highlight step is active, the tour silently advances to the sizes step.
  // Tracks length rather than a deep compare — any new placement advances.
  const prevPlacedCountRef = useRef(placedWidgets.length)
  useEffect(() => {
    const prev = prevPlacedCountRef.current
    const curr = placedWidgets.length
    prevPlacedCountRef.current = curr
    if (curr > prev && tutorialStepId === 'widgets-highlight') {
      // Small delay so the drop animation completes before the tooltip moves.
      const t = window.setTimeout(() => tutorialNext(), 260)
      return () => window.clearTimeout(t)
    }
  }, [placedWidgets.length, tutorialStepId, tutorialNext])
  // Set of widget type strings currently on the dashboard — used to prevent duplicates
  const placedTypes = useMemo(() => new Set(placedWidgets.map(pw => pw.type)), [placedWidgets])

  // Persist widget layout whenever it changes
  useEffect(() => { saveLayout(placedWidgets) }, [placedWidgets])

  // ── Fixed slot grid: calculate how many rows fit in the rail ────────────
  // The grid has a fixed height (N visible rows) and is centered in the rail.
  // This gives equal top/bottom gaps without forcing sparse content to center.
  const calcVisibleRows = () => {
    const railH = window.innerHeight - 72 // aside: top-[56px] (48px header + 8px gap) + bottom-4 (16px)
    const avail = railH - 2 * PAD_V
    return Math.max(1, Math.floor((avail + GAP) / (CELL + GAP)))
  }
  const [visibleRows, setVisibleRows] = useState(calcVisibleRows)
  useEffect(() => {
    const onResize = () => setVisibleRows(calcVisibleRows())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const slotGridH = visibleRows * CELL + Math.max(0, visibleRows - 1) * GAP + 2 * PAD_V
  // ID of a placed widget currently being dragged (hidden while in flight)
  const [draggingPlacedId, setDraggingPlacedId] = useState<string | null>(null)
  // Whether the drag ghost is hovering over the trash zone
  const [trashHover, setTrashHover] = useState(false)
  const trashHoverRef = useRef(false)
  // Set true in onDrop on trash so onDragEnd knows deletion already fired
  const droppedOnTrashRef = useRef(false)
  // Set true when pointerup fires outside all valid zones — lets onDragEnd skip
  const invalidDropHandledRef = useRef(false)

  // ── Edit Mode ───────────────────────────────────────────────────────────────
  // Global boolean: widgets are interactive only in edit mode (iOS/macOS style).
  const [isEditMode, setIsEditMode] = useState(false)
  const longPressRef = useRef<number | null>(null)

  const cancelLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }
  const startLongPress = () => {
    if (longPressRef.current !== null) return
    longPressRef.current = window.setTimeout(() => {
      setIsEditMode(true)
      longPressRef.current = null
    }, 350)
  }
  const exitEditMode = () => {
    cancelLongPress()
    setIsEditMode(false)
  }
  // Escape key exits edit mode
  useEffect(() => {
    if (!isEditMode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitEditMode() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isEditMode])

  // Widget drag state: 'idle' → 'dragging' → 'ending' → 'idle'
  const [dragPhase, setDragPhase] = useState<'idle' | 'dragging' | 'ending'>('idle')
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(null)
  // Viewport coords of the snapped slot top-left — used to position the slot preview div
  const [slotOrigin, setSlotOrigin] = useState<{ x: number; y: number } | null>(null)
  const dragInfoRef = useRef<{ widgetId: string; size: { w: number; h: number }; sourcePlacedId?: string } | null>(null)
  // Grab offset: where within the widget the cursor grabbed it, for free-drag positioning
  const dragGrabOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Cursor position ref — updated imperatively on every dragover, no React state lag
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 })
  // Direct ref to ghost DOM element — updated imperatively to avoid render-cycle lag
  const ghostDivRef = useRef<HTMLDivElement | null>(null)
  // Snap state refs — readable synchronously in onDragEnd (state may be stale in closure)
  const snapActiveRef = useRef(false)
  const snapZoneRef = useRef<'left' | 'right' | null>(null)
  const snapRowRef = useRef(0)
  const snapColRef = useRef(0)

  // Aside outer width: COLS cells + (COLS-1) gaps + 2 borders + 2 paddings
  const ZONE_W = COLS * CELL + (COLS - 1) * GAP + 2 * BORDER_W + 2 * ZONE_PAD

  const widgetPx = (w: number, h: number) => widgetPxSize(w, h, CELL)
  const handleWidgetDragStart = (e: React.DragEvent<HTMLElement>, widgetId: string, size: { w: number; h: number }, sourcePlacedId?: string) => {
    e.dataTransfer.setData('application/widget', JSON.stringify({ widgetId, size }))
    e.dataTransfer.effectAllowed = 'copy'
    dragInfoRef.current = { widgetId, size, sourcePlacedId }

    // Center the ghost on the cursor regardless of where within the widget it was grabbed
    const { w: gw, h: gh } = widgetPx(size.w, size.h)
    dragGrabOffsetRef.current = { x: gw / 2, y: gh / 2 }
    // Seed cursor position from dragstart so ghost renders centered immediately
    cursorPosRef.current = { x: e.clientX, y: e.clientY }

    // Replace native drag image with an invisible element sized like the widget.
    // Hotspot at (gw/2, gh/2) so the browser's drag-coordinate origin = cursor = widget center.
    const blank = document.createElement('div')
    Object.assign(blank.style, {
      width: gw + 'px', height: gh + 'px',
      position: 'fixed', top: '-9999px', left: '-9999px',
      opacity: '0', pointerEvents: 'none',
    })
    document.body.appendChild(blank)
    e.dataTransfer.setDragImage(blank, gw / 2, gh / 2)

    // Document-level dragover: determine active zone purely from cursor position.
    // Whichever zone the cursor is currently inside is the active snap target.
    const onDocDragOver = (de: DragEvent) => {
      const cx = de.clientX, cy = de.clientY
      cursorPosRef.current = { x: cx, y: cy }
      const grabX = dragGrabOffsetRef.current.x
      const grabY = dragGrabOffsetRef.current.y

      // Trash zone hover detection — only relevant for placed widgets being moved
      if (dragInfoRef.current?.sourcePlacedId) {
        const trashEl = document.getElementById('edit-trash-zone')
        if (trashEl) {
          const tr = trashEl.getBoundingClientRect()
          const overTrash = cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom
          if (overTrash !== trashHoverRef.current) {
            trashHoverRef.current = overTrash
            setTrashHover(overTrash)
          }
        }
      }

      // Step 1: determine which zone (if any) the cursor is inside right now
      const leftEl  = document.getElementById('widget-zone-left')
      const rightEl = document.getElementById('widget-zone-right')
      let activeZone: 'left' | 'right' | null = null
      let activeRect: DOMRect | null = null
      for (const [el, zone] of [[leftEl, 'left'], [rightEl, 'right']] as [HTMLElement | null, 'left' | 'right'][]) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          activeZone = zone
          activeRect = rect
          break
        }
      }

      // Step 2: no zone → free drag
      if (activeZone === null || activeRect === null) {
        setSlotOrigin(null)
        snapActiveRef.current = false
        snapZoneRef.current = null
        if (ghostDivRef.current) {
          ghostDivRef.current.style.transition = 'none'
          ghostDivRef.current.style.left = (cx - grabX) + 'px'
          ghostDivRef.current.style.top  = (cy - grabY) + 'px'
        }
        return
      }

      // Step 3: cursor is inside activeZone — find the exact 1×1 box under the cursor
      de.preventDefault()
      de.dataTransfer!.dropEffect = 'copy'
      const hStride = CELL + GAP  // vertical stride — fixed row height
      const wStride = CELL  + GAP  // horizontal stride — fixed column width
      // Cursor position relative to the grid origin.
      // gridRect.top already reflects any scroll offset and centering margin.
      const gridEl = document.getElementById(`widget-grid-${activeZone}`)
      const gridRect = gridEl?.getBoundingClientRect()
      if (!gridRect) return
      const relY  = cy - gridRect.top - PAD_V
      const relX  = cx - activeRect.left - BORDER_W - ZONE_PAD
      const hovRow = Math.max(0, Math.floor(relY / hStride))
      const hovCol = Math.max(0, Math.floor(relX / wStride))
      // Compute max starting row so the widget stays inside the fixed slot grid.
      const innerH    = gridRect.height - 2 * PAD_V
      const maxVisRow = Math.max(0, Math.floor((innerH + GAP) / (CELL + GAP)) - size.h)
      const maxRow    = Math.max(0, Math.min(N_ROWS - size.h, maxVisRow))
      const maxCol = COLS - size.w
      const col = Math.min(hovCol, maxCol)
      // Clamp row only to the viewport-derived ceiling — no forced top-anchoring
      const row = Math.min(hovRow, maxRow)
      // Magnetic snap — find nearest valid slot starting from cursor position.
      // The preview pulls toward the closest open slot so the whole zone surface
      // feels droppable rather than requiring exact targeting of each grid cell.
      const snap = findSnapSlot(
        placedWidgets, activeZone, row, col, size.w, size.h,
        dragInfoRef.current?.sourcePlacedId,
        maxVisRow,
      )
      if (!snap) {
        setSlotOrigin(null)
        snapActiveRef.current = false
        snapZoneRef.current = null
      } else {
        setSlotOrigin({
          x: activeRect.left + BORDER_W + ZONE_PAD + snap.col * (CELL + GAP),
          y: gridRect.top + PAD_V + snap.row * (CELL + GAP),
        })
        snapActiveRef.current = true
        snapZoneRef.current = activeZone
        snapRowRef.current = snap.row
        snapColRef.current = snap.col
      }
      // Ghost always follows cursor — never jumps to slot
      if (ghostDivRef.current) {
        ghostDivRef.current.style.transition = 'none'
        ghostDivRef.current.style.left = (cx - grabX) + 'px'
        ghostDivRef.current.style.top  = (cy - grabY) + 'px'
      }
    }
    document.addEventListener('dragover', onDocDragOver)

    // pointerup fires the instant the mouse button is released — before the OS
    // drag-end animation and before dragend. Handle ALL drop cases here so every
    // outcome is immediate: valid zone drop, invalid zone drop, and middle-screen.
    const onPointerUp = (pe: PointerEvent) => {
      document.removeEventListener('pointerup', onPointerUp)
      // Trash onDrop already handled this — let dragend clean up
      if (droppedOnTrashRef.current) return

      const leftEl  = document.getElementById('widget-zone-left')
      const rightEl = document.getElementById('widget-zone-right')
      const cx = pe.clientX, cy = pe.clientY

      // Detect release zone
      let releaseZone: 'left' | 'right' | null = null
      let zoneRect: DOMRect | null = null
      for (const [el, zone] of [[leftEl, 'left'], [rightEl, 'right']] as [HTMLElement | null, 'left' | 'right'][]) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          releaseZone = zone
          zoneRect = r
          break
        }
      }

      // Trash handled by native onDrop — skip if hovering it
      const trashEl = document.getElementById('edit-trash-zone')
      if (trashEl) {
        const tr = trashEl.getBoundingClientRect()
        if (cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom) return
      }

      // Mark as handled so onDragEnd is a no-op
      invalidDropHandledRef.current = true
      const info = dragInfoRef.current
      dragInfoRef.current = null
      snapActiveRef.current = false
      trashHoverRef.current = false
      setTrashHover(false)
      setSlotOrigin(null)

      // Helper: animate ghost back to its original slot, then restore state
      const animateBack = () => {
        const orig   = sourcePlacedId ? placedWidgets.find(pw => pw.id === sourcePlacedId) : null
        const origEl = orig ? document.getElementById(`widget-zone-${orig.zone}`) : null
        const origGridEl = orig ? document.getElementById(`widget-grid-${orig.zone}`) : null
        const origR  = origEl?.getBoundingClientRect() ?? null
        const origGr = origGridEl?.getBoundingClientRect() ?? null
        if (orig && origR && origGr && ghostDivRef.current) {
          const targetX = origR.left + BORDER_W + ZONE_PAD + orig.col * (CELL + GAP)
          const targetY = origGr.top + PAD_V + orig.row * (CELL + GAP)
          const ghost   = ghostDivRef.current
          ghost.style.transition = 'left 180ms cubic-bezier(0.16,1,0.3,1), top 180ms cubic-bezier(0.16,1,0.3,1), opacity 60ms ease 140ms'
          ghost.style.left    = `${targetX}px`
          ghost.style.top     = `${targetY}px`
          ghost.style.opacity = '0'
          setTimeout(() => {
            setDraggingPlacedId(null)
            setDragPhase('idle')
            setDragSize(null)
          }, 200)
        } else {
          setDraggingPlacedId(null)
          setDragPhase('idle')
          setDragSize(null)
        }
      }

      if (releaseZone && zoneRect && info) {
        // ── Released inside a widget zone — commit to nearest valid snap slot ──
        // Uses the same magnetic algorithm as the drag preview so the widget always
        // lands exactly where the slot indicator was shown.
        const releaseGridEl = document.getElementById(`widget-grid-${releaseZone}`)
        const releaseGridRect = releaseGridEl?.getBoundingClientRect()
        if (!releaseGridRect) { animateBack(); return }
        const relY = cy - releaseGridRect.top - PAD_V
        const relX = cx - zoneRect.left - BORDER_W - ZONE_PAD
        const hovRow  = Math.max(0, Math.floor(relY / (CELL + GAP)))
        const hovCol  = Math.max(0, Math.floor(relX / (CELL + GAP)))
        const prefCol = Math.min(hovCol, COLS - info.size.w)
        // Cap to slot grid rows
        const innerH      = releaseGridRect.height - 2 * PAD_V
        const maxRowCount = Math.min(N_ROWS, Math.floor((innerH + GAP) / (CELL + GAP)))
        const maxVisRow   = Math.max(0, maxRowCount - info.size.h)
        const prefRow     = Math.min(hovRow, maxVisRow)

        const snap = findSnapSlot(placedWidgets, releaseZone, prefRow, prefCol, info.size.w, info.size.h, info.sourcePlacedId, maxVisRow)

        if (snap !== null) {
          const { row, col } = snap
          const reflowed = tryReflow(placedWidgets, releaseZone, row, col, info.size.w, info.size.h, info.sourcePlacedId, maxRowCount)!
          const others = placedWidgets.filter(pw => pw.zone !== releaseZone && pw.id !== info.sourcePlacedId)
          if (info.sourcePlacedId) {
            const orig  = placedWidgets.find(pw => pw.id === info.sourcePlacedId)!
            const moved: PlacedWidget = { ...orig, zone: releaseZone, row, col }
            setPlacedWidgets([...others, ...reflowed, moved])
          } else if (!placedTypes.has(info.widgetId)) {
            setPlacedWidgets([...others, ...reflowed, {
              id: crypto.randomUUID(),
              type: info.widgetId,
              zone: releaseZone,
              row,
              col,
              size: info.size,
            }])
          }
          setDraggingPlacedId(null)
          setDragPhase('idle')
          setDragSize(null)
        } else {
          animateBack()
        }
      } else {
        // ── Released outside all valid zones — animate back immediately ──
        animateBack()
      }
    }
    document.addEventListener('pointerup', onPointerUp)

    // Clean up blank image, close drawer, show drop zones
    requestAnimationFrame(() => {
      document.body.removeChild(blank)
      setWidgetMenuOpen(false)
      setDragSize(size)
      setDragPhase('dragging')
      if (sourcePlacedId) setDraggingPlacedId(sourcePlacedId)
    })

    // Listen for drag end — spawn fade-out echo, then transition zones away
    const btn = e.currentTarget
    const onDragEnd = (de: DragEvent) => {
      btn.removeEventListener('dragend', onDragEnd)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('pointerup', onPointerUp)
      setSlotOrigin(null)

      // Already handled instantly by pointerup (middle-area invalid drop)
      if (invalidDropHandledRef.current) {
        invalidDropHandledRef.current = false
        return
      }

      // Capture snap state from refs before clearing
      const wasSnapped  = snapActiveRef.current
      const snapZone    = snapZoneRef.current
      const snapRow     = snapRowRef.current
      const snapCol     = snapColRef.current
      snapActiveRef.current = false

      const info = dragInfoRef.current
      dragInfoRef.current = null

      // Clear trash hover state
      trashHoverRef.current = false
      setTrashHover(false)

      // ── Trash drop: already handled instantly by onDrop on the element ──
      if (droppedOnTrashRef.current) {
        droppedOnTrashRef.current = false
        return
      }

      // ── Commit placement with automatic reflow ──────────────────────────
      let validDrop = false
      if (info && wasSnapped && snapZone !== null) {
        const reflowedZone = tryReflow(
          placedWidgets, snapZone, snapRow, snapCol,
          info.size.w, info.size.h, info.sourcePlacedId,
        )
        if (reflowedZone !== null) {
          validDrop = true
          // All widgets NOT in the target zone, also excluding the widget being moved
          // (it will be re-added at its new position below)
          const otherWidgets = placedWidgets.filter(
            pw => pw.zone !== snapZone && pw.id !== info.sourcePlacedId,
          )
          if (info.sourcePlacedId) {
            // Move existing widget: find it, update its zone/row/col, merge with reflow
            const original = placedWidgets.find(pw => pw.id === info.sourcePlacedId)!
            const movedWidget: PlacedWidget = { ...original, zone: snapZone, row: snapRow, col: snapCol }
            const next = [...otherWidgets, ...reflowedZone, movedWidget]
            setPlacedWidgets(next)
          } else if (!placedTypes.has(info.widgetId)) {
            // New widget from the drawer — only if not already placed
            const newWidget: PlacedWidget = {
              id: crypto.randomUUID(),
              type: info.widgetId,
              zone: snapZone,
              row: snapRow,
              col: snapCol,
              size: info.size,
            }
            const next = [...otherWidgets, ...reflowedZone, newWidget]
            setPlacedWidgets(next)
          }
        }
      }

      // ── Restore dragging-widget visibility ──────────────────────────────
      // Always reveal the widget immediately — no delay, no staged animation.
      setDraggingPlacedId(null)

      // Spawn fade-out echo only for new placements (not moves/cancels)
      if (info && !info.sourcePlacedId && de.clientX > 0 && de.clientY > 0) {
        const { w: ew, h: eh } = widgetPx(info.size.w, info.size.h)
        const echo = document.createElement('div')
        Object.assign(echo.style, {
          position: 'fixed',
          left: `${de.clientX - ew / 2}px`,
          top: `${de.clientY - eh / 2}px`,
          width: `${ew}px`, height: `${eh}px`,
          background: 'rgba(255,255,255,0.060)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px',
          boxShadow: '0 3px 22px rgba(0,0,0,0.26)',
          opacity: '1',
          transform: 'scale(1)',
          transition: 'opacity 280ms ease-out, transform 280ms ease-out',
          pointerEvents: 'none',
          zIndex: '9999',
        })
        document.body.appendChild(echo)
        requestAnimationFrame(() => {
          echo.style.opacity = '0'
          echo.style.transform = 'scale(0.92)'
        })
        setTimeout(() => document.body.removeChild(echo), 300)
      }

      // Transition drop zones to ending → idle
      // For valid placements use the ending phase so the overlay fades gracefully.
      // For invalid drops go straight to idle — nothing to animate.
      if (validDrop) {
        setDragPhase('ending')
        setTimeout(() => { setDragPhase('idle'); setDragSize(null); setSlotOrigin(null) }, 350)
      } else {
        setDragPhase('idle')
        setDragSize(null)
        setSlotOrigin(null)
      }
    }
    btn.addEventListener('dragend', onDragEnd)
  }

  const dayTrades    = selectedDate ? tradesForDate(effectiveTrades, selectedDate) : []
  const addTradeDate = selectedDate || localToday(settings.timezone)

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1) }
    else setCalMonth((m) => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1) }
    else setCalMonth((m) => m + 1)
  }

  const handleEditTrade = (trade: import('./types').Trade) => {
    setEditingTrade(trade)
  }

  const handleEditTradeClose = () => {
    setEditingTrade(null)
  }

  const handleEditTradeSubmit = (updated: import('./types').Trade) => {
    updateTrade(updated)
    setEditingTrade(null)
  }

  const handleCalendarSelect = (date: string) => {
    selectDate(date)
    openDayPanel(date)
  }

  const handleOpenDay = (date: string) => {
    selectDate(date)
    openDayPanel(date)
  }

  // ── Tutorial scene context ─────────────────────────────────────────────
  // Bundles every callable the action engine needs into one stable object.
  // Identity is memoized so the action runner's effect doesn't re-fire on
  // unrelated re-renders (the runner keys off step id, but a scene change
  // would also trigger — keep it rare).
  const tutorialScene = useMemo<TutorialSceneContext>(() => ({
    widgetMenu: {
      setOpen: setWidgetMenuOpen,
      setExpandedSections: (patch) =>
        setExpandedSections((prev) => ({ ...prev, ...patch })),
    },
    calendar: { selectDate },
    dayPanel: { open: openDayPanel, close: closeDayPanel },
    addTrade: {
      open: openAddTrade,
      close: closeAddTrade,
      setDemoScript: setAddTradeDemoScript,
    },
    transient: { setTrade: setTutorialTransientTrade },
    checklist: {
      add: (text, afterSpacerId) => {
        if (afterSpacerId) addChecklistItemAfter(afterSpacerId, text)
        else addChecklistItem(text)
      },
      toggle: toggleChecklistItem,
    },
    timezone: settings.timezone,
    today: () => localToday(settings.timezone),
  }), [
    setWidgetMenuOpen, selectDate, openDayPanel, closeDayPanel,
    openAddTrade, closeAddTrade, setAddTradeDemoScript,
    setTutorialTransientTrade, addChecklistItem, addChecklistItemAfter,
    toggleChecklistItem, settings.timezone,
  ])

  return (
    <TutorialSceneProvider value={tutorialScene}>
    <TutorialActionRunner />
    <UpdateGate>
    <ActivationGate>
    <FontSizeController />
    <div className="journal-root text-white" onClick={isEditMode ? () => { exitEditMode() } : undefined}>

      {/* ── Edit mode: full-screen dim overlay ────────────────────────────── */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 30,
          background: 'rgba(0,0,0,0.45)',
          opacity: isEditMode ? 1 : 0,
          pointerEvents: isEditMode ? 'auto' : 'none',
          transition: 'opacity 260ms ease',
        }}
        onClick={exitEditMode}
      />

      {/* ── Edit mode: trash zone ─────────────────────────────────────────── */}
      <div
        id="edit-trash-zone"
        aria-label="Drop to remove widget"
        style={{
          position: 'fixed', bottom: 32, left: '50%',
          transform: `translateX(-50%) translateY(${isEditMode ? '0px' : '20px'}) scale(${trashHover ? 1.18 : 1})`,
          zIndex: 40,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          opacity: isEditMode ? 1 : 0,
          pointerEvents: isEditMode ? 'auto' : 'none',
          transition: 'opacity 260ms ease, transform 260ms cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          if (dragInfoRef.current?.sourcePlacedId) {
            e.preventDefault()
            // Must match effectAllowed='copy' set in handleWidgetDragStart,
            // otherwise Chromium silently rejects the drop and onDrop never fires.
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          const info = dragInfoRef.current
          if (!info?.sourcePlacedId) return
          // Mark as handled so onDragEnd skips its trash block
          droppedOnTrashRef.current = true
          // Immediate deletion — fires synchronously on mouse release
          setPlacedWidgets(prev => prev.filter(w => w.id !== info.sourcePlacedId))
          setDraggingPlacedId(null)
          setTrashHover(false)
          trashHoverRef.current = false
          setDragPhase('idle')
          setDragSize(null)
          setSlotOrigin(null)
        }}
      >
        <div style={{
          width: 52, height: 52,
          borderRadius: 16,
          background: trashHover ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.07)',
          border: `1.5px solid ${trashHover ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.12)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 180ms ease, border-color 180ms ease',
          backdropFilter: 'blur(12px)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={trashHover ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.40)'}
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'stroke 180ms ease' }}
          >
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: trashHover ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.25)',
          transition: 'color 180ms ease',
        }}>
          {trashHover ? 'Release to remove' : 'Drag here to remove'}
        </span>
      </div>

      {/* ── Edit mode: Done button ────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 56, left: '50%',
        transform: `translateX(-50%) translateY(${isEditMode ? '0px' : '-8px'})`,
        zIndex: 40,
        opacity: isEditMode ? 1 : 0,
        pointerEvents: isEditMode ? 'auto' : 'none',
        transition: 'opacity 240ms ease, transform 240ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); exitEditMode() }}
          style={{
            padding: '6px 18px', borderRadius: 20,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.80)',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
        >
          Done
        </button>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────
          Structure: ONE flex row. No absolute rails. No translateY/margins.
          Height 48px — matches macOS hiddenInset traffic-light band so a
          horizontal line through the red/yellow/green buttons also passes
          through the vertical center of this header, which is 48/2 = 24px
          from the top (traffic lights: top=18, height=12 → center=24).
          Traffic lights, NOOKRA wordmark, and right-side icon buttons all
          share a single flex items-center axis — no per-element offsets. */}
      <header
        className="app-header sticky top-0 z-40"
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(22,22,25,0.94) 0%, rgba(14,14,16,0.94) 100%)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.25)',
        }}
      >
        {/* Single content column — aligns NOOKRA to left edge and icons to
            right edge of the app's 860px content column. Height 100%, flex
            center — NO absolute positioning, NO margins, NO transforms. */}
        <div
          className="w-full max-w-[860px] mx-auto px-8"
          style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {/* Left — subtle dot + NOOKRA wordmark, both inside one flex row
              so the dot is vertically centered with the text. translateY(1px)
              on the wrapper shifts the pair together (matches right-side
              icons' optical nudge). Font, size, spacing unchanged.         */}
          <div
            className="flex items-center"
            style={{ transform: 'translateY(1px)' }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)',
                marginRight: 8,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span className="text-[10.5px] font-semibold tracking-[0.16em] text-white/30 uppercase select-none">
              Nookra
            </span>
          </div>

          {/* Right — icon cluster. Matching translateY(1px) so the visual
              axis of icons aligns with traffic lights + logo.              */}
          <div
            className="flex items-center gap-1.5"
            style={{ WebkitAppRegion: 'no-drag', transform: 'translateY(1px)' } as React.CSSProperties}
          >
            <TrialBanner />
            {/* Widgets button */}
            <button
              type="button"
              data-tutorial="widgets"
              onClick={() => setWidgetMenuOpen(prev => !prev)}
              className="float-hover text-white/20 hover:text-white/85 hover:bg-white/[0.10] hover:border-white/[0.14] border border-transparent p-1.5 rounded-md"
              aria-label="Widgets"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </button>
            {/* Settings button */}
            <button
              type="button"
              data-tutorial="settings"
              onClick={openSettings}
              className="float-hover text-white/20 hover:text-white/85 hover:bg-white/[0.10] hover:border-white/[0.14] border border-transparent p-1.5 rounded-md"
              aria-label="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Empty-state hint — shown when NO widgets are placed on either rail.
          Subtle, centered in the dashboard gap, not intrusive. Never shows
          while the tutorial is mid-drag (the spotlighted tooltip covers it)
          or while actively dragging. */}
      {false && placedWidgets.length === 0 && !tutorialActive && (
        <div
          aria-hidden
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none select-none z-30"
          style={{ top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/18">
              Dashboard
            </span>
            <span className="text-[12px] text-white/35 max-w-[260px] leading-relaxed">
              Start by dragging a widget from the right panel.
            </span>
          </div>
        </div>
      )}

      {/* ── Left Widget Container ───────────────────────────────────────── */}
      <aside
        id="widget-zone-left"
        className="fixed top-[56px] bottom-4 pointer-events-none"
        style={{
          right: 'calc(50% + 446px)',
          width: ZONE_W,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 35,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Overlay: absolute so it doesn't participate in flex flow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            border: '2px dashed rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.02)',
            opacity: isEditMode || dragPhase === 'dragging' ? 1 : 0,
            transition: 'opacity 200ms ease-out',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {/* Scroll container — flex child with min-height:0 so Safari scrolls correctly */}
        <div
          id="widget-scroll-left"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Fixed slot grid — centered inside the rail */}
          <div
            id="widget-grid-left"
            style={{
              height: slotGridH,
              marginTop: 'auto', marginBottom: 'auto',
              paddingTop: PAD_V, paddingBottom: PAD_V,
              paddingLeft: ZONE_PAD, paddingRight: ZONE_PAD,
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
              gridAutoRows: `${CELL}px`,
              gap: `${GAP}px`,
              alignContent: 'start',
            }}
          >
            {placedWidgets.filter(pw => pw.zone === 'left').map(pw => {
              return (
                <div
                  key={pw.id}
                  data-pw-id={pw.id}
                  draggable={isEditMode}
                  onDragStart={isEditMode ? (e) => handleWidgetDragStart(e, pw.type, pw.size, pw.id) : undefined}
                  onMouseDown={!isEditMode ? startLongPress : undefined}
                  onMouseUp={!isEditMode ? cancelLongPress : undefined}
                  onMouseLeave={!isEditMode ? cancelLongPress : undefined}
                  className={`placed-widget${isEditMode ? ' widget-wobble' : ''}`}
                  style={{
                    gridColumn: `${pw.col + 1} / span ${pw.size.w}`,
                    gridRow: `${pw.row + 1} / span ${pw.size.h}`,
                    position: 'relative',
                    boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    pointerEvents: 'auto',
                    cursor: isEditMode ? 'grab' : 'default',
                    opacity: draggingPlacedId === pw.id ? 0 : 1,
                    transition: 'opacity 300ms ease-out, box-shadow 180ms ease',
                  }}
                >
                  <WidgetContent type={pw.type} />
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Right Widget Container ──────────────────────────────────────── */}
      <aside
        id="widget-zone-right"
        className="fixed top-[56px] bottom-4 pointer-events-none"
        style={{
          left: 'calc(50% + 446px)',
          width: ZONE_W,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 35,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Overlay: absolute so it doesn't participate in flex flow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            border: '2px dashed rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.02)',
            opacity: isEditMode || dragPhase === 'dragging' ? 1 : 0,
            transition: 'opacity 200ms ease-out',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {/* Scroll container — flex child with min-height:0 so Safari scrolls correctly */}
        <div
          id="widget-scroll-right"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Fixed slot grid — centered inside the rail */}
          <div
            id="widget-grid-right"
            style={{
              height: slotGridH,
              marginTop: 'auto', marginBottom: 'auto',
              paddingTop: PAD_V, paddingBottom: PAD_V,
              paddingLeft: ZONE_PAD, paddingRight: ZONE_PAD,
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
              gridAutoRows: `${CELL}px`,
              gap: `${GAP}px`,
              alignContent: 'start',
            }}
          >
            {placedWidgets.filter(pw => pw.zone === 'right').map(pw => {
              return (
                <div
                  key={pw.id}
                  data-pw-id={pw.id}
                  draggable={isEditMode}
                  onDragStart={isEditMode ? (e) => handleWidgetDragStart(e, pw.type, pw.size, pw.id) : undefined}
                  onMouseDown={!isEditMode ? startLongPress : undefined}
                  onMouseUp={!isEditMode ? cancelLongPress : undefined}
                  onMouseLeave={!isEditMode ? cancelLongPress : undefined}
                  className={`placed-widget${isEditMode ? ' widget-wobble' : ''}`}
                  style={{
                    gridColumn: `${pw.col + 1} / span ${pw.size.w}`,
                    gridRow: `${pw.row + 1} / span ${pw.size.h}`,
                    position: 'relative',
                    boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    pointerEvents: 'auto',
                    cursor: isEditMode ? 'grab' : 'default',
                    opacity: draggingPlacedId === pw.id ? 0 : 1,
                    transition: 'opacity 300ms ease-out, box-shadow 180ms ease',
                  }}
                >
                  <WidgetContent type={pw.type} />
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="max-w-[860px] mx-auto px-8 pb-24">

        {/* Demo-mode label — low-contrast, non-intrusive. Visible only while
            the tutorial is injecting fake data. Uses `demo-banner` so the
            global `.demo-exiting` class can fade it out in sync with the
            rest of the demo content on tutorial exit. */}
        {isDemoMode && (
          <div
            className="demo-banner mt-4 mb-6 flex items-center justify-center gap-2 select-none"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--accent-passive)' }}
            />
            <span className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-white/28">
              Demo Data
            </span>
            <span className="text-[10.5px] text-white/22">
              — your real trades will replace this
            </span>
          </div>
        )}

        {/* Stats + focus note */}
        <HeroStats
          trades={effectiveTrades}
          currency={settings.currency}
          startingBalance={effectiveStartingBalance}
          focusNote={focusNote}
          quotesEnabled={settings.quotesEnabled}
          visibleMetrics={settings.visibleMetrics}
        />

        {/* Pre-trade checklist — integrated into page, no panel shell */}
        <section id="section-checklist" className="mt-10">
          <SectionLabel label="Pre-Trade Checklist" />
          <StrategySwitcher
            name={activeStrategyName}
            count={strategies.length}
            onPrev={prevStrategy}
            onNext={nextStrategy}
            onAdd={addStrategy}
            onRename={(n) => renameStrategy(activeStrategyId, n)}
            onRemove={() => removeStrategy(activeStrategyId)}
          />
          <Checklist
            items={checklist}
            onToggle={toggleChecklistItem}
            onAdd={addChecklistItem}
            onAddSpacer={addChecklistSpacer}
            onRemove={removeChecklistItem}
            onEdit={editChecklistItem}
          />
        </section>

        {/* Calendar — integrated into page, no panel shell */}
        <section id="section-calendar" className="mt-12">
          <SectionLabel label="Calendar" />
          <Calendar
            trades={effectiveTrades}
            selectedDate={selectedDate}
            onSelectDate={handleCalendarSelect}
            month={calMonth}
            year={calYear}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            currency={settings.currency}
            showCount={true}
            tileStyle={settings.tileStyle ?? 'solid'}
          />
        </section>

        {/* Recent trades — integrated into page, no panel shell.
            Matches Checklist + Calendar: section label, then content flows
            directly in the page rhythm. Removed earlier .glass-panel-elevated
            wrapper so the whole journal reads as one continuous surface. */}
        <section id="section-recent-trades" className="mt-12">
          <SectionLabel label="Recent Trades" />
          <TradeList
            trades={effectiveTrades}
            currency={settings.currency}
            onOpenDay={handleOpenDay}
          />
        </section>

      </main>

      <DayPanel
        open={isDayPanelOpen}
        onClose={closeDayPanel}
        date={selectedDate}
        trades={dayTrades}
        currency={settings.currency}
        onAddTrade={openAddTrade}
        onRemoveTrade={removeTrade}
        onEditTrade={handleEditTrade}
      />

      <AddTradeModal
        open={isAddTradeOpen}
        onClose={closeAddTrade}
        onSubmit={safeAddTrade}
        defaultDate={addTradeDate}
        sessionOptions={customOptions.sessions}
        emotionOptions={customOptions.emotions}
        setupTypeOptions={customOptions.setupTypes}
        strategyOptions={strategies.map((s) => s.name)}
        defaultStrategy={activeStrategyName}
        onAddSession={(v) => addCustomOption('sessions', v)}
        onAddEmotion={(v) => addCustomOption('emotions', v)}
        onAddSetupType={(v) => addCustomOption('setupTypes', v)}
        onRemoveSession={(v) => removeCustomOption('sessions', v)}
        onRemoveEmotion={(v) => removeCustomOption('emotions', v)}
        onRemoveSetupType={(v) => removeCustomOption('setupTypes', v)}
        demoScript={addTradeDemoScript}
      />

      <AddTradeModal
        open={editingTrade !== null}
        onClose={handleEditTradeClose}
        onSubmit={handleEditTradeSubmit}
        defaultDate={editingTrade?.date ?? addTradeDate}
        initialTrade={editingTrade}
        sessionOptions={customOptions.sessions}
        emotionOptions={customOptions.emotions}
        setupTypeOptions={customOptions.setupTypes}
        strategyOptions={strategies.map((s) => s.name)}
        defaultStrategy={activeStrategyName}
        onAddSession={(v) => addCustomOption('sessions', v)}
        onAddEmotion={(v) => addCustomOption('emotions', v)}
        onAddSetupType={(v) => addCustomOption('setupTypes', v)}
        onRemoveSession={(v) => removeCustomOption('sessions', v)}
        onRemoveEmotion={(v) => removeCustomOption('emotions', v)}
        onRemoveSetupType={(v) => removeCustomOption('setupTypes', v)}
      />

      <SettingsPanel
        open={isSettingsOpen}
        onClose={closeSettings}
        forceSection={settingsForceSection}
      />

      {/* ── Widget Drawer ──────────────────────────────────────────────────── */}
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 z-50 bg-black/20 transition-opacity duration-300',
          widgetMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setWidgetMenuOpen(false)}
      />
      {/* Panel */}
      <div
        ref={widgetMenuRef}
        data-tutorial="widgets-menu"
        className={clsx(
          'fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[340px] border-l border-white/[0.06] bg-[#111113] overflow-hidden transition-transform duration-300 ease-out',
          widgetMenuOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <span className="text-sm font-semibold text-white">Widgets</span>
          <button
            type="button"
            onClick={() => setWidgetMenuOpen(false)}
            className={CLOSE_BTN_CLASS}
            aria-label="Close widgets"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="pointer-events-none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Grid-based widget previews — MENU_CELL=140px, MENU_GAP=12px, 2 cols = 292px */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-8">

          {/* ── Small (1×1) ────────────────────────────────── */}
          <div className="flex flex-col" data-tutorial="section-small">
            {isWidgetTutorialStep && (
              <p className="text-[10px] text-white/35 leading-relaxed mb-1.5 pr-2">
                Quick stats you glance at during trading.
              </p>
            )}
            <button
              onClick={() => toggleSection('small')}
              className="flex items-center justify-between py-2 group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-white/25 uppercase tracking-[0.14em] group-hover:text-white/40 transition-colors">Small</span>
                <span className="text-[9px] text-white/10">1 × 1</span>
              </div>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className={clsx('text-white/15 group-hover:text-white/30 transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out', expandedSections.small ? 'rotate-180' : 'rotate-0')}
              >
                <path d="M2 3.5L5 6.5L8 3.5"/>
              </svg>
            </button>
            {/* Collapsed preview */}
            <div className={clsx('overflow-hidden transition-all duration-300', !expandedSections.small ? 'max-h-32 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0')}>
              <div className={COLLAPSED_PREVIEW_CARD}>
                <div className="flex items-center gap-4">
                  {/* 1×1 shape preview */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[0,1,2,3].map((i) => (
                      <div key={i} className="rounded-lg border border-white/[0.10] bg-white/[0.04] flex items-center justify-center" style={{ width: 40, height: 40 }}>
                        <div className="w-2.5 h-2.5 rounded bg-white/[0.08]" />
                      </div>
                    ))}
                  </div>
                  {/* Description */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-white/20 font-medium">1 × 1</span>
                    <span className="text-[9px] text-white/15">1 unit each</span>
                    <span className="text-[8px] text-white/[0.08]">4 widgets available</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Expanded content */}
            <div className={clsx('flex flex-wrap gap-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', expandedSections.small ? 'max-h-[600px] opacity-100 mt-2 overflow-visible' : 'max-h-0 opacity-0 mt-0 overflow-hidden')} style={{ width: 292 }}>
              {/* Day Grade 1×1 */}
              <button
                draggable={!placedTypes.has('small/day-grade')}
                onDragStart={placedTypes.has('small/day-grade') ? undefined : (e) => handleWidgetDragStart(e, 'small/day-grade', { w: 1, h: 1 })}
                onClick={placedTypes.has('small/day-grade') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('small/day-grade') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.small}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Day Grade</span>
                <div>
                  <div className="text-4xl font-bold text-emerald-400/40 tabular-nums leading-none">A</div>
                  <div className="text-[8px] text-white/15 mt-2">Discipline + P&L</div>
                </div>
              </button>
              {/* Daily Risk 1×1 — tutorial highlight target. */}
              <button
                data-tutorial="widget-daily-risk"
                draggable={!placedTypes.has('small/daily-risk')}
                onDragStart={placedTypes.has('small/daily-risk') ? undefined : (e) => handleWidgetDragStart(e, 'small/daily-risk', { w: 1, h: 1 })}
                onClick={placedTypes.has('small/daily-risk') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(
                  WIDGET_CARD_BASE,
                  'p-3',
                  placedTypes.has('small/daily-risk') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer',
                  // Tutorial pulse — only during the highlight step, and only
                  // if it isn't already placed. Soft accent ring + subtle breathe.
                  tutorialStepId === 'widgets-highlight' && !placedTypes.has('small/daily-risk') && 'widget-tutorial-pulse'
                )}
                style={WIDGET_TILE.small}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Daily Risk</span>
                <div>
                  <div className="text-lg font-bold text-emerald-400/40 leading-none">SAFE</div>
                  <div className="h-1.5 rounded-full bg-white/[0.04] mt-2">
                    <div className="h-full w-1/4 rounded-full bg-emerald-400/30" />
                  </div>
                  <div className="text-[8px] text-white/15 mt-1.5">24% of max loss</div>
                </div>
              </button>
              {/* Streak 1×1 */}
              <button
                draggable={!placedTypes.has('small/streak')}
                onDragStart={placedTypes.has('small/streak') ? undefined : (e) => handleWidgetDragStart(e, 'small/streak', { w: 1, h: 1 })}
                onClick={placedTypes.has('small/streak') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('small/streak') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.small}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Streak</span>
                <div>
                  <div className="text-xl font-semibold text-emerald-400/40 tabular-nums">3W</div>
                  <div className="flex gap-0.5 mt-2">
                    {[1,1,1,0,1].map((w,i) => (
                      <div key={i} className={clsx('h-1 flex-1 rounded-full', w ? 'bg-emerald-400/20' : 'bg-red-400/20')} />
                    ))}
                  </div>
                </div>
              </button>
              {/* Best Today 1×1 */}
              <button
                draggable={!placedTypes.has('small/best-today')}
                onDragStart={placedTypes.has('small/best-today') ? undefined : (e) => handleWidgetDragStart(e, 'small/best-today', { w: 1, h: 1 })}
                onClick={placedTypes.has('small/best-today') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('small/best-today') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.small}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Best Today</span>
                <div>
                  <div className="text-[11px] font-bold text-white/40 leading-tight">Bull Flag</div>
                  <div className="text-[10px] font-semibold text-emerald-400/40 tabular-nums mt-1">+$480</div>
                </div>
                <span className="text-[8px] text-white/15">top setup today</span>
              </button>
            </div>
          </div>

          {/* ── Medium ─────────────────────────────────────── */}
          <div className="flex flex-col relative" data-tutorial="section-medium">
            {isWidgetTutorialStep && (
              <>
                <p className="text-[10px] text-white/35 leading-relaxed mb-1.5 pr-2">
                  More detailed insights — combine two small widgets.
                </p>
                {/* Semi-transparent overlay chips describing Medium sizing. */}
                {tutorialStepId === 'widgets-sizes' && (
                  <div className="pointer-events-none absolute right-1 top-9 flex flex-col items-end gap-1 z-10">
                    <span className="text-[9px] font-semibold tracking-wider uppercase text-white/70 bg-black/40 backdrop-blur-sm border border-white/[0.08] rounded-md px-1.5 py-0.5">
                      2 units wide
                    </span>
                    <span className="text-[9px] font-medium text-white/45 bg-black/30 backdrop-blur-sm border border-white/[0.05] rounded-md px-1.5 py-0.5">
                      Stack vertically or horizontally
                    </span>
                  </div>
                )}
              </>
            )}
            <button
              onClick={() => toggleSection('medium')}
              className="flex items-center justify-between py-2 group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-white/25 uppercase tracking-[0.14em] group-hover:text-white/40 transition-colors">Medium</span>
                <span className="text-[9px] text-white/10">2 × 1 · 1 × 2</span>
              </div>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className={clsx('text-white/15 group-hover:text-white/30 transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out', expandedSections.medium ? 'rotate-180' : 'rotate-0')}
              >
                <path d="M2 3.5L5 6.5L8 3.5"/>
              </svg>
            </button>
            {/* Collapsed preview */}
            <div className={clsx('overflow-hidden transition-all duration-300', !expandedSections.medium ? 'max-h-48 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0')}>
              <div className={COLLAPSED_PREVIEW_CARD}>
                <div className="flex items-center gap-4">
                  {/* 2×1 horizontal shape */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] flex overflow-hidden" style={{ width: 104, height: 48 }}>
                      <div className="flex-1 border-r border-dashed border-white/[0.08] flex items-center justify-center">
                        <div className="w-3 h-3 rounded bg-white/[0.08]" />
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-3 h-3 rounded bg-white/[0.08]" />
                      </div>
                    </div>
                    <span className="text-[8px] text-white/15 font-medium">2 × 1</span>
                  </div>
                  {/* 1×2 vertical shape */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] flex flex-col overflow-hidden" style={{ width: 48, height: 104 }}>
                      <div className="flex-1 border-b border-dashed border-white/[0.08] flex items-center justify-center">
                        <div className="w-3 h-3 rounded bg-white/[0.08]" />
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-3 h-3 rounded bg-white/[0.08]" />
                      </div>
                    </div>
                    <span className="text-[8px] text-white/15 font-medium">1 × 2</span>
                  </div>
                  {/* Description */}
                  <div className="flex flex-col gap-1 ml-auto">
                    <span className="text-[9px] text-white/15">2 units each</span>
                    <span className="text-[8px] text-white/[0.08]">4 widgets available</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Expanded content */}
            <div className={clsx('flex flex-col gap-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', expandedSections.medium ? 'max-h-[1200px] opacity-100 mt-2 overflow-visible' : 'max-h-0 opacity-0 mt-0 overflow-hidden')}>

            {/* ── Horizontal 2×1 group ── */}
            <div className="flex flex-col gap-2">
              <span className="text-[8px] text-white/10 uppercase tracking-wider">Horizontal · 2 × 1</span>
              <button
                draggable={!placedTypes.has('medium-h/recent-trades')}
                onDragStart={placedTypes.has('medium-h/recent-trades') ? undefined : (e) => handleWidgetDragStart(e, 'medium-h/recent-trades', { w: 2, h: 1 })}
                onClick={placedTypes.has('medium-h/recent-trades') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('medium-h/recent-trades') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.medH}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Recent Trades</span>
                  <span className="text-[10px] text-white/15 font-medium">Last 5</span>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  {[
                    { sym: 'NQ', pnl: '+$420', win: true },
                    { sym: 'ES', pnl: '−$180', win: false },
                    { sym: 'NQ', pnl: '+$310', win: true },
                  ].map((t, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', t.win ? 'bg-emerald-400/40' : 'bg-red-400/35')} />
                        <span className="text-[9px] text-white/30 font-medium">{t.sym}</span>
                      </div>
                      <span className={clsx('text-[9px] font-semibold tabular-nums', t.win ? 'text-emerald-400/45' : 'text-red-400/40')}>{t.pnl}</span>
                    </div>
                  ))}
                </div>
              </button>
              <button
                draggable={!placedTypes.has('medium-h/daily-pnl')}
                onDragStart={placedTypes.has('medium-h/daily-pnl') ? undefined : (e) => handleWidgetDragStart(e, 'medium-h/daily-pnl', { w: 2, h: 1 })}
                onClick={placedTypes.has('medium-h/daily-pnl') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('medium-h/daily-pnl') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.medH}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Daily P&L</span>
                  <span className="text-[10px] text-white/15 font-medium">Last 7 days</span>
                </div>
                <div className="flex items-end justify-between gap-1.5 h-12 mt-2">
                  {[
                    { v: 60, pos: true }, { v: 30, pos: false }, { v: 80, pos: true },
                    { v: 45, pos: true }, { v: 20, pos: false }, { v: 70, pos: true }, { v: 55, pos: true },
                  ].map((d,i) => (
                    <div key={i} className={clsx('flex-1 rounded-t-sm', d.pos ? 'bg-emerald-400/15' : 'bg-red-400/15')} style={{ height: `${d.v}%` }} />
                  ))}
                </div>
              </button>
              <button
                draggable={!placedTypes.has('medium-h/overtrade')}
                onDragStart={placedTypes.has('medium-h/overtrade') ? undefined : (e) => handleWidgetDragStart(e, 'medium-h/overtrade', { w: 2, h: 1 })}
                onClick={placedTypes.has('medium-h/overtrade') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('medium-h/overtrade') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.medH}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Overtrade Check</span>
                  <span className="text-[9px] text-emerald-400/30 font-medium">Normal volume</span>
                </div>
                <div className="flex items-end gap-1 h-10 mt-2">
                  {[2,4,3,5,3,2,4,3,6,4,3,5,4,3].map((n,i) => (
                    <div key={i} className={clsx('flex-1 rounded-t-sm', i === 13 ? 'bg-emerald-400/25' : 'bg-white/[0.06]')} style={{ height: `${(n / 6) * 100}%` }} />
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[8px] text-white/15">Last 14 days</span>
                  <span className="text-[8px] text-white/10">avg 3.4 trades/day</span>
                </div>
              </button>
            </div>

            {/* ── Vertical 1×2 group ── */}
            <div className="flex flex-col gap-2">
              <span className="text-[8px] text-white/10 uppercase tracking-wider">Vertical · 1 × 2</span>
              <div className="flex flex-row gap-2">
              <button
                draggable={!placedTypes.has('medium-v/session')}
                onDragStart={placedTypes.has('medium-v/session') ? undefined : (e) => handleWidgetDragStart(e, 'medium-v/session', { w: 1, h: 2 })}
                onClick={placedTypes.has('medium-v/session') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('medium-v/session') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.medV}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Sessions</span>
                <div className="flex flex-col gap-3 flex-1 justify-center">
                  {[
                    { label: 'London', pct: 72 },
                    { label: 'New York', pct: 55 },
                    { label: 'Asia', pct: 40 },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col gap-1">
                      <span className="text-[8px] text-white/15">{s.label}</span>
                      <div className="h-1.5 rounded-full bg-white/[0.04]">
                        <div className="h-full rounded-full bg-emerald-400/15" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-white/10">3 sessions</span>
                  <span className="text-[9px] text-emerald-400/25 tabular-nums font-medium">+$1.8k</span>
                </div>
              </button>
              <button
                draggable={!placedTypes.has('medium-v/bias')}
                onDragStart={placedTypes.has('medium-v/bias') ? undefined : (e) => handleWidgetDragStart(e, 'medium-v/bias', { w: 1, h: 2 })}
                onClick={placedTypes.has('medium-v/bias') ? undefined : () => setWidgetMenuOpen(false)}
                className={clsx(WIDGET_CARD_BASE, 'p-3', placedTypes.has('medium-v/bias') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
                style={WIDGET_TILE.medV}
              >
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Direction</span>
                <div className="flex flex-col gap-3 flex-1 justify-center">
                  {[
                    { label: 'LONG',  pct: 65, pnl: '+$1.2k', color: 'bg-emerald-400/15' },
                    { label: 'SHORT', pct: 35, pnl: '−$0.3k', color: 'bg-red-400/13'     },
                  ].map((d) => (
                    <div key={d.label} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[8px] font-bold text-white/15 tracking-wider">{d.label}</span>
                        <span className="text-[8px] text-white/20 tabular-nums">{d.pnl}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04]">
                        <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-white/10">Bias</span>
                  <span className="text-[9px] text-emerald-400/25 tabular-nums font-medium">65% Long</span>
                </div>
              </button>
              </div>{/* close row */}
            </div>
            </div>{/* close collapsible */}
          </div>

          {/* ── Large (2×2) ────────────────────────────────── */}
          <div className="flex flex-col relative" data-tutorial="section-large">
            {isWidgetTutorialStep && (
              <>
                <p className="text-[10px] text-white/35 leading-relaxed mb-1.5 pr-2">
                  Deep analysis — use for your most important metrics.
                </p>
                {tutorialStepId === 'widgets-sizes' && (
                  <div className="pointer-events-none absolute right-1 top-9 flex flex-col items-end gap-1 z-10">
                    <span className="text-[9px] font-semibold tracking-wider uppercase text-white/70 bg-black/40 backdrop-blur-sm border border-white/[0.08] rounded-md px-1.5 py-0.5">
                      4 units total
                    </span>
                    <span className="text-[9px] font-medium text-white/45 bg-black/30 backdrop-blur-sm border border-white/[0.05] rounded-md px-1.5 py-0.5">
                      Best for main dashboard focus
                    </span>
                  </div>
                )}
              </>
            )}
            <button
              onClick={() => toggleSection('large')}
              className="flex items-center justify-between py-2 group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-white/25 uppercase tracking-[0.14em] group-hover:text-white/40 transition-colors">Large</span>
                <span className="text-[9px] text-white/10">2 × 2</span>
              </div>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className={clsx('text-white/15 group-hover:text-white/30 transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out', expandedSections.large ? 'rotate-180' : 'rotate-0')}
              >
                <path d="M2 3.5L5 6.5L8 3.5"/>
              </svg>
            </button>
            {/* Collapsed preview */}
            <div className={clsx('overflow-hidden transition-all duration-300', !expandedSections.large ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0')}>
              <div className={COLLAPSED_PREVIEW_CARD}>
                <div className="flex items-center gap-4">
                  {/* 2×2 shape */}
                  <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] grid grid-cols-2 grid-rows-2 overflow-hidden shrink-0" style={{ width: 96, height: 96 }}>
                    <div className="border-r border-b border-dashed border-white/[0.08] flex items-center justify-center">
                      <div className="w-3 h-3 rounded bg-white/[0.08]" />
                    </div>
                    <div className="border-b border-dashed border-white/[0.08] flex items-center justify-center">
                      <div className="w-3 h-3 rounded bg-white/[0.08]" />
                    </div>
                    <div className="border-r border-dashed border-white/[0.08] flex items-center justify-center">
                      <div className="w-3 h-3 rounded bg-white/[0.08]" />
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="w-3 h-3 rounded bg-white/[0.08]" />
                    </div>
                  </div>
                  {/* Description */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-white/20 font-medium">2 × 2</span>
                    <span className="text-[9px] text-white/15">4 units each</span>
                    <span className="text-[8px] text-white/[0.08]">3 widgets available</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Expanded content */}
            <div className={clsx('flex flex-col gap-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', expandedSections.large ? 'max-h-[1200px] opacity-100 mt-2 overflow-visible' : 'max-h-0 opacity-0 mt-0 overflow-hidden')}>

            {/* Equity Curve 2×2 */}
            <button
              draggable={!placedTypes.has('large/equity')}
              onDragStart={placedTypes.has('large/equity') ? undefined : (e) => handleWidgetDragStart(e, 'large/equity', { w: 2, h: 2 })}
              onClick={placedTypes.has('large/equity') ? undefined : () => setWidgetMenuOpen(false)}
              className={clsx(WIDGET_CARD_BASE, 'p-4', placedTypes.has('large/equity') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
              style={WIDGET_TILE.large}
            >
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Equity Curve</span>
                <span className="text-[10px] text-emerald-400/30 font-medium tabular-nums">+$1.8k</span>
              </div>
              <div className="flex items-end gap-px h-24 mt-2 flex-1">
                {[20,25,22,30,28,35,32,40,38,45,42,50,48,55,60,58,62,65,60,68].map((h,i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-emerald-400/10" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'Best Day', val: '+$760' },
                  { label: 'Worst Day', val: '−$220' },
                  { label: 'Max DD', val: '$540' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-0.5">
                    <span className="text-[7px] text-white/10 uppercase tracking-wide">{s.label}</span>
                    <span className="text-[10px] text-white/20 tabular-nums font-medium">{s.val}</span>
                  </div>
                ))}
              </div>
            </button>

            {/* Discipline 2×2 */}
            <button
              draggable={!placedTypes.has('large/discipline')}
              onDragStart={placedTypes.has('large/discipline') ? undefined : (e) => handleWidgetDragStart(e, 'large/discipline', { w: 2, h: 2 })}
              onClick={placedTypes.has('large/discipline') ? undefined : () => setWidgetMenuOpen(false)}
              className={clsx(WIDGET_CARD_BASE, 'p-4', placedTypes.has('large/discipline') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
              style={WIDGET_TILE.large}
            >
              <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Discipline</span>
              <div className="flex flex-col gap-4 flex-1 justify-center">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-white/20">Today's Checklist</span>
                    <span className="text-[9px] text-emerald-400/30">7/9 · 78%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full bg-emerald-400/20" style={{ width: '78%' }} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-white/20">Rule Follow Rate</span>
                    <span className="text-[9px] text-emerald-400/30">85%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full bg-emerald-400/20" style={{ width: '85%' }} />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[1,1,1,1,0,1,1,1,1,1].map((f,i) => (
                    <div key={i} className={clsx('w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold', f ? 'bg-emerald-400/10 text-emerald-400/50' : 'bg-red-400/10 text-red-400/50')}>
                      {f ? '✓' : '✗'}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-white/10">Rule streak</span>
                <span className="text-[9px] text-emerald-400/25 font-medium tabular-nums">9 in a row</span>
              </div>
            </button>

            {/* Setup Performance 2×2 */}
            <button
              draggable={!placedTypes.has('large/setup')}
              onDragStart={placedTypes.has('large/setup') ? undefined : (e) => handleWidgetDragStart(e, 'large/setup', { w: 2, h: 2 })}
              onClick={placedTypes.has('large/setup') ? undefined : () => setWidgetMenuOpen(false)}
              className={clsx(WIDGET_CARD_BASE, 'p-4', placedTypes.has('large/setup') ? 'opacity-40 cursor-not-allowed' : 'float-hover cursor-pointer')}
              style={WIDGET_TILE.large}
            >
              <span className="text-[8px] font-bold text-white/15 uppercase tracking-wider group-hover:text-white/30 transition-colors">Setup Performance</span>
              <div className="flex flex-col gap-3 flex-1 justify-center">
                {[
                  { setup: 'Bull Flag',     win: 75, pnl: '+$480' },
                  { setup: 'VWAP Reclaim',  win: 62, pnl: '+$320' },
                  { setup: 'Opening Drive', win: 50, pnl: '+$180' },
                  { setup: 'Failed BK',     win: 33, pnl: '−$120' },
                ].map((s) => (
                  <div key={s.setup} className="flex flex-col gap-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[9px] text-white/25">{s.setup}</span>
                      <div className="flex gap-3">
                        <span className="text-[8px] text-white/15 tabular-nums">{s.win}%</span>
                        <span className={clsx('text-[9px] tabular-nums font-medium', s.pnl.startsWith('+') ? 'text-emerald-400/30' : 'text-red-400/25')}>{s.pnl}</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.04]">
                      <div className={clsx('h-full rounded-full', s.pnl.startsWith('+') ? 'bg-emerald-400/20' : 'bg-red-400/15')} style={{ width: `${s.win}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </button>
            </div>{/* close collapsible */}
          </div>

        </div>
      </div>

      {/* ── Edit mode exit overlay — sits above main content, below widget zones.
          Clicking anywhere in the center (or empty sidebar padding) exits edit mode.
          Pointer-events only active in edit mode so normal interactions are unaffected. */}
      {isEditMode && (
        <div
          aria-label="Exit widget edit mode"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 25,
            cursor: 'default',
          }}
          onClick={exitEditMode}
        />
      )}

      {/* ── Slot preview — active snap target indicator ── */}
      {dragPhase === 'dragging' && dragSize && slotOrigin && (() => {
        const { w: pw, h: ph } = widgetPx(dragSize.w, dragSize.h)
        return (
          <div
            style={{
              position: 'fixed',
              left: slotOrigin.x,
              top: slotOrigin.y,
              boxSizing: 'border-box',
              width: pw, height: ph,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.28)',
              boxShadow: 'inset 0 0 16px rgba(255,255,255,0.04)',
              pointerEvents: 'none',
              zIndex: 9996,
              transition: 'left 100ms cubic-bezier(0.16,1,0.3,1), top 100ms cubic-bezier(0.16,1,0.3,1)',
            }}
          />
        )
      })()}

      {/* ── Dragged widget ghost — always follows cursor exactly ── */}
      {dragPhase === 'dragging' && dragSize && (() => {
        const { w: gw, h: gh } = widgetPx(dragSize.w, dragSize.h)
        const grabX = dragGrabOffsetRef.current.x
        const grabY = dragGrabOffsetRef.current.y
        // Initial position from dragstart cursor; all subsequent updates are imperative
        const gx = cursorPosRef.current.x - grabX
        const gy = cursorPosRef.current.y - grabY
        return (
          <div
            ref={ghostDivRef}
            style={{
              position: 'fixed',
              left: gx,
              top: gy,
              boxSizing: 'border-box',
              width: gw,
              height: gh,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.060)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 3px 22px rgba(0,0,0,0.26)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              pointerEvents: 'none',
              zIndex: 9998,
              transition: 'none',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {dragSize.w} × {dragSize.h}
            </span>
            <div style={{ width: Math.min(gw - 40, 80), height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 4 }} />
          </div>
        )
      })()}

    </div>
    </ActivationGate>
    </UpdateGate>
    </TutorialSceneProvider>
  )
}
