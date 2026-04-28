// ── Shared number-formatting utilities ────────────────────────────────────────
// All formatters keep the sign attached to the symbol so the string is always
// a single atomic token — no chance of a minus sign splitting onto its own line.

/** Map a currency code to its display symbol */
export function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥',
    CAD: 'C$', AUD: 'A$', CHF: 'Fr', NZD: 'NZ$',
  }
  return map[currency] ?? '$'
}

/** P&L compact: +$1.2k / −$19.8k / +$1.4M */
export function fmtPnlCompact(n: number, sym: string): string {
  const sign = n >= 0 ? '+' : '\u2212'
  const abs  = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`
  return `${sign}${sym}${abs.toFixed(0)}`
}

/** P&L full precision for hover reveal: +$19,842.50 */
export function fmtPnlFull(n: number, sym: string): string {
  const sign = n >= 0 ? '+' : '\u2212'
  const abs  = Math.abs(n)
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Balance compact (no leading +): $10.5k / $1.2M / −$500 */
export function fmtBalanceCompact(n: number, sym: string): string {
  const sign = n < 0 ? '\u2212' : ''
  const abs  = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 100_000)   return `${sign}${sym}${Math.round(abs / 1_000)}k`
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** Balance full for hover reveal: $10,500 */
export function fmtBalanceFull(n: number, sym: string): string {
  const sign = n < 0 ? '\u2212' : ''
  const abs  = Math.abs(n)
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
