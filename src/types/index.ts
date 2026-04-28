export type Side = 'long' | 'short'
export type Outcome = 'win' | 'loss' | 'breakeven'

/**
 * A single attached screenshot.
 * `original` — exact file bytes as base64 data URL, format preserved (PNG/JPEG/WebP).
 * `thumb`    — small WebP preview generated via canvas, max 800 px wide, used only
 *              for inline previews. The fullscreen viewer always uses `original`.
 *
 * Legacy format (pre-refactor): plain `string` — treated as both original and thumb.
 */
export interface TradeScreenshot {
  original: string
  thumb: string
}

export interface Trade {
  id: string
  date: string
  instrument: string
  side: Side
  entry: number
  stopLoss: number
  takeProfit: number
  result: number
  outcome: Outcome | null
  setupType: string
  /** Named playbook this trade was taken under. Auto-populated from the
   *  currently selected pre-trade checklist strategy; optional since older
   *  trades predate the strategy system. */
  strategy?: string
  session: string
  reasonForEntry: string
  followedRules: boolean
  emotionBefore: string
  emotionDuring: string
  didRight: string
  didWrong: string
  improve: string
  screenshots?: TradeScreenshot[]
}

export interface ChecklistItem {
  id: string
  kind: 'item' | 'spacer'
  text: string
  checked: boolean
}

/**
 * A named pre-trade checklist. The user keeps one list of these and picks
 * one as "active" in the journal. The active strategy's name auto-fills the
 * Add Trade strategy field, and its items drive the Pre-Trade Checklist UI.
 */
export interface ChecklistStrategy {
  id: string
  name: string
  items: ChecklistItem[]
}

export type FontSize = 'small' | 'medium' | 'large'
export type Radius = 'subtle' | 'default' | 'soft'
export type TileStyle = 'solid' | 'outlined' | 'muted'

export type MetricKey =
  | 'winRate'
  | 'totalPnl'
  | 'avgWL'
  | 'profitFactor'
  | 'expectancy'
  | 'maxDrawdown'
  | 'bestDay'
  | 'worstDay'
  | 'avgR'
  | 'consecWins'
  | 'consecLosses'
  | 'ruleFollowRate'

export interface Settings {
  currency: string
  timezone: string          // IANA timezone name, e.g. 'America/New_York'
  visibleMetrics: MetricKey[]
  quotesEnabled: boolean
  fontSize: FontSize
  radius: Radius
  tileStyle: TileStyle
}

// ── Widget system ─────────────────────────────────────────────────────────────
// Data model only — rendering will be wired up when the widget system is built.

export type WidgetZone = 'left' | 'right'

export interface Widget {
  id: string
  type: string       // e.g. 'overview', 'day-snapshot', 'streak', 'heatmap'
  zone: WidgetZone
  order: number      // render order within the zone (ascending)
  enabled: boolean
}

export interface CustomOptions {
  sessions: string[]
  emotions: string[]
  setupTypes: string[]
}
