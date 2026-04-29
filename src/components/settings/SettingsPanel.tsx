import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { BACKDROP_TRANSITION, BACKDROP_VARIANTS } from '../../services/motion/motion'
import { CLOSE_BTN_CLASS } from '../ui/Modal'
import { MetricKey, Trade, FontSize, Radius, TileStyle } from '../../types'
import { useAppStore } from '../../store/useAppStore'
import { ALL_METRIC_DEFS } from '../HeroStats'
import { TIMEZONE_OPTIONS, localToday } from '../../utils/dates'
import { useLicense } from '../ActivationGate'
import { getDeviceId, getDeviceLabel } from '../../services/licensing/device'
import { formatTrialRemaining } from '../../services/licensing/trialTime'
import { MAX_DEVICES, getLicenseInfo, removeDevice, type LicenseInfo } from '../../services/licensing/licensingService'
import { fetchPublishedUpdates, markUpdatesSeen, hasUnseenUpdates, type PublishedUpdate } from '../../services/update/updatesService'
import { checkForUpdate, pickDownloadUrl, hasBridge } from '../../services/update/updateClient'
import { useTutorial } from '../tutorial/TutorialContext'
import { FULL_TUTORIAL_STEPS } from '../../services/tutorial/steps'

// Real app version sourced from electron's app.getVersion() (package.json).
// Resolves once on mount; empty string while pending (keeps sync callers safe).
function useAppVersion(): string {
  const [version, setVersion] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!hasBridge()) return
    window.updateAPI!.getCurrentVersion().then((v) => {
      if (!cancelled) setVersion(v)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  return version
}

export type SectionId = 'appearance' | 'trading' | 'focus' | 'metrics' | 'data' | 'account' | 'license'
  | 'whats-new' | 'about' | 'report-bug' | 'feedback'

const NAV: { id: SectionId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'trading',    label: 'Trading'    },
  { id: 'focus',      label: 'Focus'      },
  { id: 'metrics',    label: 'Metrics'    },
  { id: 'data',       label: 'Data'       },
  { id: 'account',    label: 'Account'    },
  { id: 'license',    label: 'License'    },
]

const NAV_SUPPORT: { id: SectionId; label: string }[] = [
  { id: 'whats-new',  label: "What\u2019s New"  },
  { id: 'about',      label: 'About'            },
  { id: 'report-bug', label: 'Report a Bug'     },
  { id: 'feedback',   label: 'Feedback'         },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'NZD']

// Shared class strings for the modal-footer action buttons in Report-a-Bug
// and Feedback forms (same visual treatment across both).
const MODAL_CANCEL_BTN_CLASS =
  'btn-press flex-1 py-2.5 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.02] text-white/35 hover:border-white/15 hover:text-white/55 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150'
const MODAL_SEND_BTN_CLASS =
  'btn-press flex-1 py-2.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all duration-150 disabled:opacity-30 disabled:cursor-default disabled:bg-white/[0.04] disabled:border-white/[0.08] disabled:text-white/25 text-white'

// Column-label span used in the License section's status rows.
const LICENSE_LABEL_CLASS = 'text-[10px] text-white/20 uppercase tracking-wider font-medium'

// ── Shared UI atoms ──────────────────────────────────────────────────────────

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.14em] mb-2">{children}</p>
}

function SegGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1.5">{children}</div>
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={active ? { borderColor: 'var(--accent-border)', backgroundColor: 'var(--accent-dim)' } : undefined}
      className={clsx(
        'btn-press flex-1 py-2 rounded-lg text-xs font-medium border cursor-pointer',
        active
          ? 'text-white'
          : 'bg-white/[0.02] border-white/[0.07] text-white/30 hover:border-white/20 hover:text-white/70 hover:bg-white/[0.05]'
      )}
    >
      {children}
    </button>
  )
}

function ChipBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={active ? { borderColor: 'var(--accent-border)', backgroundColor: 'var(--accent-dim)' } : undefined}
      className={clsx(
        'btn-press px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer',
        active
          ? 'text-white'
          : 'bg-white/[0.02] border-white/[0.07] text-white/30 hover:border-white/20 hover:text-white/70 hover:bg-white/[0.05]'
      )}
    >
      {children}
    </button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
      className={clsx(
        'relative w-9 h-5 rounded-full transition-all duration-200 cursor-pointer',
        !checked ? 'bg-white/[0.07] hover:bg-white/[0.12]' : 'hover:opacity-90'
      )}
    >
      {/* thumb: bg-[#ffffff] avoids the light-mode bg-white CSS override;
          when checked, use --accent-fg so dark accent → dark thumb, light accent → light thumb */}
      <span
        className={clsx(
          'absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200',
          !checked && 'bg-[#ffffff]',
          checked ? 'left-[18px]' : 'left-0.5'
        )}
        style={checked ? { backgroundColor: 'var(--accent-fg)' } : undefined}
      />
    </button>
  )
}

function DangerBtn({ children, onClick, confirm: confirmLabel }: { children: React.ReactNode; onClick: () => void; confirm?: string }) {
  const [pending, setPending] = useState(false)
  if (pending) {
    return (
      <div className="flex gap-2">
        <button onClick={() => { onClick(); setPending(false) }} className="btn-press flex-1 py-2 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer">
          {confirmLabel ?? 'Yes, confirm'}
        </button>
        <button onClick={() => setPending(false)} className="btn-press px-3 py-2 rounded-lg text-xs font-medium border border-white/[0.07] text-white/30 hover:text-white/60 hover:border-white/15 cursor-pointer">
          Cancel
        </button>
      </div>
    )
  }
  return (
    <button onClick={() => setPending(true)} className="btn-press w-full py-2 rounded-lg text-xs font-medium border border-white/[0.07] text-white/30 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/[0.04] cursor-pointer">
      {children}
    </button>
  )
}

// ── Section components ───────────────────────────────────────────────────────

function AppearanceSection({ onReplayTutorial }: { onReplayTutorial: () => void }) {
  const { settings, updateSettings } = useAppStore()

  return (
    <div className="flex flex-col gap-6">

      {/* Font size */}
      <div data-tutorial="settings-font">
        <SLabel>Font Size</SLabel>
        <SegGroup>
          <SegBtn active={(settings.fontSize ?? 'medium') === 'small'}  onClick={() => updateSettings({ fontSize: 'small'  as FontSize })}>Small</SegBtn>
          <SegBtn active={(settings.fontSize ?? 'medium') === 'medium'} onClick={() => updateSettings({ fontSize: 'medium' as FontSize })}>Medium</SegBtn>
          <SegBtn active={(settings.fontSize ?? 'medium') === 'large'}  onClick={() => updateSettings({ fontSize: 'large'  as FontSize })}>Large</SegBtn>
        </SegGroup>
      </div>

      {/* Corner radius */}
      <div data-tutorial="settings-radius">
        <SLabel>Corner Style</SLabel>
        <SegGroup>
          <SegBtn active={(settings.radius ?? 'default') === 'subtle'}  onClick={() => updateSettings({ radius: 'subtle'  as Radius })}>Subtle</SegBtn>
          <SegBtn active={(settings.radius ?? 'default') === 'default'} onClick={() => updateSettings({ radius: 'default' as Radius })}>Default</SegBtn>
          <SegBtn active={(settings.radius ?? 'default') === 'soft'}    onClick={() => updateSettings({ radius: 'soft'    as Radius })}>Soft</SegBtn>
        </SegGroup>
      </div>

      {/* Tile style */}
      <div data-tutorial="settings-tile-style">
        <SLabel>Calendar Tile Style</SLabel>
        <SegGroup>
          <SegBtn active={(settings.tileStyle ?? 'solid') === 'solid'}    onClick={() => updateSettings({ tileStyle: 'solid'    as TileStyle })}>Solid</SegBtn>
          <SegBtn active={(settings.tileStyle ?? 'solid') === 'muted'}    onClick={() => updateSettings({ tileStyle: 'muted'    as TileStyle })}>Muted</SegBtn>
          <SegBtn active={(settings.tileStyle ?? 'solid') === 'outlined'} onClick={() => updateSettings({ tileStyle: 'outlined' as TileStyle })}>Outlined</SegBtn>
        </SegGroup>
        <p className="text-[10px] text-white/20 mt-2">Controls how win/loss days appear on the calendar.</p>
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Replay tutorial — re-arms the guided tour and starts it from step 1.
          Closes the settings panel first so the overlay is visible. */}
      <div>
        <SLabel>Guided Tour</SLabel>
        <button
          onClick={onReplayTutorial}
          className="btn-press w-full flex items-center justify-between p-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out cursor-pointer text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-white/70">Replay Tutorial</span>
            <span className="text-[10px] text-white/25">Walk through the main app again.</span>
          </div>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25 shrink-0">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

    </div>
  )
}

function TradingSection() {
  const { startingBalance, setStartingBalance, settings, updateSettings } = useAppStore()
  const [editing, setEditing] = useState(false)
  const [balDraft, setBalDraft] = useState(startingBalance.toFixed(0))
  const ref = useRef<HTMLInputElement>(null)

  const symMap: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'Fr', NZD: 'NZ$' }
  const sym = symMap[settings.currency] ?? '$'

  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  useEffect(() => { if (!editing) setBalDraft(startingBalance.toFixed(0)) }, [startingBalance, editing])

  const commitBal = () => {
    const n = parseFloat(balDraft.replace(/[^0-9.-]/g, ''))
    if (isFinite(n) && n >= 0) setStartingBalance(n)
    else setBalDraft(startingBalance.toFixed(0))
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div data-tutorial="settings-currency">
        <SLabel>Currency</SLabel>
        <div className="flex flex-wrap gap-1.5">
          {CURRENCIES.map((c) => (
            <ChipBtn key={c} active={settings.currency === c} onClick={() => updateSettings({ currency: c })}>
              {c}
            </ChipBtn>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.05]" />

      <div>
        <SLabel>Timezone</SLabel>
        <select
          value={settings.timezone}
          onChange={(e) => updateSettings({ timezone: e.target.value })}
          className="input-field text-sm w-full cursor-pointer"
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value} className="bg-[#18181b] text-white">{tz.label}</option>
          ))}
        </select>
        <p className="text-[10px] text-white/20 mt-1.5 leading-relaxed">
          Used to determine today's date for the calendar and streaks.
        </p>
      </div>

      <div className="h-px bg-white/[0.05]" />

      <div data-tutorial="settings-balance">
        <SLabel>Starting Account Balance</SLabel>
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">{sym}</span>
            <input
              ref={ref}
              value={balDraft}
              onChange={(e) => setBalDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitBal(); if (e.key === 'Escape') { setBalDraft(startingBalance.toFixed(0)); setEditing(false) } }}
              onBlur={commitBal}
              className="input-field text-sm w-full"
            />
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 group w-full p-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] transition-all duration-150 cursor-pointer text-left">
            <span className="text-xs text-white/30">{sym}</span>
            <span className="text-sm font-semibold text-white/60 tabular-nums flex-1">
              {startingBalance.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </span>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="text-white/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <path d="M1.5 7L6 2.5L8 4.5L3.5 9H1.5V7Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

    </div>
  )
}

const FOCUS_MAX = 100

function FocusSection() {
  const { settings, updateSettings, focusNote, setFocusNote } = useAppStore()
  const [draft, setDraft] = useState(focusNote)

  // Sync draft if focusNote changes externally (e.g., reset all data)
  useEffect(() => { setDraft(focusNote) }, [focusNote])

  const trimmed  = draft.trim()
  const isDirty  = draft !== focusNote
  const overLimit = draft.length > FOCUS_MAX
  const canConfirm = isDirty && !overLimit

  const handleConfirm = () => {
    if (!canConfirm) return
    setFocusNote(trimmed)
    setDraft(trimmed)
  }

  const handleCancel = () => {
    setDraft(focusNote)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-white/60">Daily rotating quotes</p>
          <p className="text-[10px] text-white/25 mt-0.5">Show a different quote each day in the header</p>
        </div>
        <Toggle checked={settings.quotesEnabled} onChange={(v) => updateSettings({ quotesEnabled: v })} />
      </div>

      <div className="h-px bg-white/[0.05]" />

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.14em]">Custom Message</p>
          {isDirty && (
            <span className="text-[9px] text-white/25 uppercase tracking-[0.1em]">Unsaved</span>
          )}
        </div>
        <p className="text-[10px] text-white/25 mb-2">
          Shown in the header instead of the daily quote when confirmed.
        </p>

        {/* Single-line input */}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const val = e.target.value
            if (val.length <= FOCUS_MAX) setDraft(val)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Your daily focus or intention..."
          maxLength={FOCUS_MAX}
          className="input-field text-xs w-full"
        />

        {/* Character counter + buttons */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="btn-press px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-white/15 hover:text-white/70 hover:bg-white/[0.04]"
            >
              Confirm
            </button>
            {isDirty && (
              <button
                onClick={handleCancel}
                className="btn-press px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.07] text-white/25 hover:text-white/60 hover:border-white/15 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
          <span className={[
            'text-[10px] tabular-nums transition-colors',
            overLimit ? 'text-red-400' : draft.length >= FOCUS_MAX * 0.85 ? 'text-white/35' : 'text-white/15',
          ].join(' ')}>
            {draft.length} / {FOCUS_MAX}
          </span>
        </div>
      </div>
    </div>
  )
}

// Ordered metric display: core trading metrics first, contextual second
const METRIC_KEYS_CORE: MetricKey[]      = ['winRate', 'totalPnl', 'avgWL', 'profitFactor', 'expectancy', 'maxDrawdown', 'avgR', 'ruleFollowRate']
const METRIC_KEYS_SECONDARY: MetricKey[] = ['bestDay', 'worstDay', 'consecWins', 'consecLosses']

function MetricCard({
  def,
  active,
  disabled,
  onClick,
}: {
  def: { label: string; desc: string }
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // inset box-shadow draws the left accent bar without disrupting padding or border layout
      style={active ? { boxShadow: 'inset 3px 0 0 0 var(--accent)' } : undefined}
      className={clsx(
        'btn-press flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left cursor-pointer',
        active   && 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/15',
        !active && !disabled && 'bg-transparent border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15',
        disabled && 'opacity-20 cursor-default pointer-events-none border-white/[0.04]',
      )}
    >
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={clsx(
          'text-xs leading-none',
          active   ? 'font-semibold text-white'    : 'font-medium text-white/55',
        )}>
          {def.label}
        </p>
        <p className={clsx(
          'text-[10px] leading-none mt-1.5',
          active ? 'text-white/40' : 'text-white/20',
        )}>
          {def.desc}
        </p>
      </div>

      {/* Indicator: filled accent circle with check when active, empty ring when not */}
      <div
        className={clsx(
          'w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150',
          !active && 'border border-white/15',
        )}
        style={active ? { backgroundColor: 'var(--accent)' } : undefined}
      >
        {active && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path
              d="M1 3.5L3.5 6L8 1"
              stroke="var(--accent-fg)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </button>
  )
}

function MetricsSection() {
  const { settings, updateSettings } = useAppStore()
  const selected = settings.visibleMetrics

  const toggle = (key: MetricKey) => {
    if (selected.includes(key)) {
      updateSettings({ visibleMetrics: selected.filter((k) => k !== key) })
    } else if (selected.length < 3) {
      updateSettings({ visibleMetrics: [...selected, key] })
    }
  }

  const renderCard = (key: MetricKey) => {
    const def      = ALL_METRIC_DEFS[key]
    const active   = selected.includes(key)
    const disabled = !active && selected.length >= 3
    return (
      <MetricCard
        key={key}
        def={def}
        active={active}
        disabled={disabled}
        onClick={() => toggle(key)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4" data-tutorial="settings-metrics">
      <p className="text-[11px] text-white/30 leading-relaxed">
        Choose up to 3 metrics to show in the header.
      </p>

      {/* Core metrics */}
      <div className="flex flex-col gap-1.5">
        {METRIC_KEYS_CORE.map(renderCard)}
      </div>

      {/* Secondary divider */}
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-px bg-white/[0.05] flex-1" />
        <span className="text-[9px] font-semibold text-white/15 uppercase tracking-[0.12em]">Contextual</span>
        <div className="h-px bg-white/[0.05] flex-1" />
      </div>

      {/* Secondary metrics */}
      <div className="flex flex-col gap-1.5">
        {METRIC_KEYS_SECONDARY.map(renderCard)}
      </div>

      <p className="text-[10px] text-white/15 tabular-nums">{selected.length} / 3 selected</p>
    </div>
  )
}

function DataSection({ onClose }: { onClose: () => void }) {
  const { trades, importTrades, clearTrades, settings } = useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ version: '1.0', trades }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `nookra-${localToday(settings.timezone)}.json` })
    a.click(); URL.revokeObjectURL(url)
  }

  const exportCSV = () => {
    const cols: (keyof Trade)[] = ['date','instrument','side','result','outcome','setupType','session','reasonForEntry','followedRules','emotionBefore','emotionDuring','didRight','didWrong','improve','entry','stopLoss','takeProfit']
    const esc = (v: unknown) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s }
    const csv = [cols.join(','), ...trades.map((t) => cols.map((c) => esc(t[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `nookra-${localToday(settings.timezone)}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const imported: Trade[] = Array.isArray(raw) ? raw : raw.trades
        if (Array.isArray(imported)) { importTrades(imported); onClose() }
      } catch { alert('Invalid file. Please import a valid trading journal JSON.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const actionBtn = 'btn-press w-full py-2.5 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer text-left px-3'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SLabel>Export</SLabel>
        <button onClick={exportJSON} className={actionBtn}>Export as JSON</button>
        <button onClick={exportCSV}  className={actionBtn}>Export as CSV</button>
      </div>
      <div className="flex flex-col gap-2">
        <SLabel>Import</SLabel>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        <button onClick={() => fileRef.current?.click()} className={actionBtn}>Import from JSON</button>
        <p className="text-[10px] text-white/15">Importing replaces all existing trades.</p>
      </div>
      <div className="h-px bg-white/[0.05]" />
      <div className="flex flex-col gap-2">
        <SLabel>Danger Zone</SLabel>
        <DangerBtn onClick={clearTrades} confirm="Yes, clear all trades">Clear all trades</DangerBtn>
        <DangerBtn onClick={() => { clearTrades(); localStorage.clear(); window.location.reload() }} confirm="Yes, reset everything">
          Reset all data
        </DangerBtn>
      </div>
    </div>
  )
}

function AccountSection() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SLabel>Cloud Sync</SLabel>
        <div className="px-3 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <p className="text-xs font-medium text-white/30">Sync across devices</p>
          <p className="text-[10px] text-white/15 mt-1">Available in a future update.</p>
        </div>
      </div>
    </div>
  )
}

// ── License Certificate Illustration (Settings) ─────────────────────────────

function LicenseCertificateIllustration() {
  const badge = (() => {
    const cx = 76, cy = 48, R = 11, r = 7
    const pts: string[] = []
    for (let i = 0; i < 16; i++) {
      const a = ((i * 22.5 - 90) * Math.PI) / 180
      const rad = i % 2 === 0 ? R : r
      pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`)
    }
    return `M${pts.join('L')}Z`
  })()

  return (
    <svg width="72" height="58" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Card body — cream with thick brown border */}
      <rect x="5" y="5" width="90" height="70" rx="10" fill="#F5EDD8" />
      <rect x="5" y="5" width="90" height="70" rx="10" stroke="#B8A88A" strokeWidth="2.5" />

      {/* Two bold teal header lines */}
      <rect x="16" y="17" width="48" height="5" rx="2.5" fill="var(--accent)" />
      <rect x="16" y="27" width="38" height="5" rx="2.5" fill="var(--accent)" opacity="0.75" />

      {/* Multiple brown/tan text lines */}
      <rect x="16" y="39" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.7" />
      <rect x="16" y="45" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.6" />
      <rect x="16" y="51" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.5" />
      <rect x="16" y="57" width="38" height="3" rx="1.5" fill="#C4B8A0" opacity="0.4" />
      <rect x="16" y="63" width="32" height="3" rx="1.5" fill="#C4B8A0" opacity="0.35" />

      {/* 8-pointed star badge — solid muted brown */}
      <path d={badge} fill="#A8977A" />
    </svg>
  )
}

// ── License Card (paid license certificate) ─────────────────────────────────

function LicenseCard({
  ownerName,
  devicesUsed,
  maxDevices,
  onDeactivate,
}: {
  ownerName: string
  devicesUsed: number
  maxDevices: number
  onDeactivate: () => void
}) {
  return (
    <div
      className="rounded-2xl border border-white/[0.06] p-5 flex flex-col gap-4"
      style={{
        background: 'rgba(255,255,255,0.04)',
        boxShadow: '0 2px 22px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Row 1: Image + text side by side */}
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <LicenseCertificateIllustration />
        </div>
        <div>
          <p className="text-[11px] text-white/35 font-medium tracking-wide">Licensed to:</p>
          <p className="text-[15px] text-white font-bold mt-1">{ownerName}</p>
          <p className="text-[12px] text-white/40 mt-2 tabular-nums">Used: {devicesUsed}/{maxDevices}</p>
        </div>
      </div>

      {/* Row 2: Deactivate button on its own line */}
      <button
        onClick={onDeactivate}
        className="self-start px-4 py-2 rounded-xl border border-edge-resting text-[12px] font-medium text-tertiary hover:text-negative hover:border-white/[0.14] hover:bg-white/[0.03] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,background-color,border-color,color,opacity,box-shadow] duration-150 ease-out cursor-pointer"
      >
        Deactivate
      </button>
    </div>
  )
}

// ── Device Row ──────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Last seen just now'
  if (diffMin < 60) return `Last seen ${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `Last seen ${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Last seen yesterday'
  if (diffDay < 30) return `Last seen ${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `Last seen ${diffMonth}mo ago`
  return `Last seen ${Math.floor(diffMonth / 12)}y ago`
}

function DeviceRow({
  deviceName,
  subtitle,
  isCurrent,
  onRemove,
  showDivider,
}: {
  deviceName: string
  subtitle: string
  isCurrent?: boolean
  onRemove?: () => void
  showDivider?: boolean
}) {
  return (
    <div
      className="px-5 py-3.5 flex items-center gap-4"
      style={showDivider ? { borderBottom: '1px solid rgba(255,255,255,0.05)' } : undefined}
    >
      {/* Laptop icon — teal accent for current device */}
      <div className="shrink-0" style={{ color: isCurrent ? 'var(--accent)' : 'rgba(255,255,255,0.25)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M2 20h20" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-medium truncate"
          style={{ color: isCurrent ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.70)' }}
        >
          {deviceName}
        </p>
        {subtitle && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {isCurrent && (
              <span
                className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            <p
              className="text-[11px]"
              style={{ color: isCurrent ? 'var(--accent)' : 'rgba(255,255,255,0.30)', opacity: isCurrent ? 0.7 : 1 }}
            >
              {subtitle}
            </p>
          </div>
        )}
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-full border border-edge-resting flex items-center justify-center text-ghost hover:text-negative hover:border-[rgba(239,68,68,0.32)] hover:bg-negative-soft-dim hover:scale-[1.06] transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out cursor-pointer shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── License ──────────────────────────────────────────────────────────────────

function LicenseSection() {
  const { status, expiresAt, deactivate: handleDeactivate } = useLicense()
  const deviceLabel = getDeviceLabel()
  const currentDeviceId = getDeviceId()
  const [tick, setTick] = useState(0)
  const [info, setInfo] = useState<LicenseInfo | null>(null)

  // Fetch real license info on mount for active licenses
  useEffect(() => {
    if (status === 'active') {
      getLicenseInfo().then(setInfo)
    }
  }, [status])

  // Tick every 30s so trial countdown updates live
  useEffect(() => {
    if (status !== 'trial') return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [status])

  void tick

  const isTrial = status === 'trial'
  const isActive = status === 'active'
  const remainingText = isTrial ? formatTrialRemaining(expiresAt) : null

  const ownerName = info?.ownerName || 'License Holder'
  const devicesUsed = info?.deviceCount ?? 1
  const maxDevices = info?.maxDevices ?? MAX_DEVICES
  const devices = info?.devices ?? []

  const handleRemoveDevice = async (deviceId: string) => {
    if (deviceId === currentDeviceId) {
      // Removing current device = full deactivation
      handleDeactivate()
      return
    }
    const success = await removeDevice(deviceId)
    if (success) {
      const updated = await getLicenseInfo()
      setInfo(updated)
    }
  }

  return (
    <div className="flex flex-col gap-5" data-tutorial="settings-license">

      {/* Header with teal icon */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--accent-dim)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <p className="text-[16px] font-bold text-white">License</p>
      </div>

      {/* Licensed: premium certificate card */}
      {isActive && (
        <>
          <LicenseCard
            ownerName={ownerName}
            devicesUsed={devicesUsed}
            maxDevices={maxDevices}
            onDeactivate={handleDeactivate}
          />

          {/* Devices heading */}
          <p className="text-[12px] font-semibold mt-1" style={{ color: 'var(--accent)', opacity: 0.6 }}>Devices</p>

          {/* Device list — current device first, grouped stack */}
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {[...devices]
              .sort((a, b) => {
                if (a.deviceId === currentDeviceId) return -1
                if (b.deviceId === currentDeviceId) return 1
                return 0
              })
              .map((device, i, arr) => {
                const isCurrent = device.deviceId === currentDeviceId
                return (
                  <DeviceRow
                    key={device.deviceId}
                    deviceName={device.deviceName}
                    subtitle={isCurrent ? 'Current device' : formatRelativeTime(device.lastSeenAt)}
                    isCurrent={isCurrent}
                    onRemove={() => handleRemoveDevice(device.deviceId)}
                    showDivider={i < arr.length - 1}
                  />
                )
              })}

            {/* Fallback if server hasn't responded yet */}
            {devices.length === 0 && (
              <DeviceRow
                deviceName={deviceLabel}
                subtitle="Current device"
                isCurrent
              />
            )}
          </div>
        </>
      )}

      {/* Trial: status + countdown */}
      {isTrial && (
        <>
          <div className="rounded-2xl border border-white/[0.08] p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between">
              <span className={LICENSE_LABEL_CLASS}>Status</span>
              <span className="text-[11px] font-semibold text-warning">Trial</span>
            </div>
            {remainingText && (
              <div className="flex items-center justify-between">
                <span className={LICENSE_LABEL_CLASS}>Time Left</span>
                <span className="text-[11px] text-white/50 tabular-nums">{remainingText}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className={LICENSE_LABEL_CLASS}>Device</span>
              <span className="text-[11px] text-white/50">{deviceLabel}</span>
            </div>
          </div>

          {/*
            Hover styles use arbitrary values (e.g. hover:text-[#f87171])
            instead of Tailwind utility names like hover:text-negative,
            because `text-negative` / `border-negative` / `bg-negative-soft`
            are custom CSS classes defined in src/index.css — NOT Tailwind
            utilities. Tailwind's hover: prefix only chains onto its own
            utilities, so the prior classes were silently no-op'ing,
            which is why the button felt dead under the cursor.

            Deactivate is a destructive action, so the hover state is
            deliberately strong — clear red border + tinted background +
            red text. No ambiguity.
          */}
          <button
            onClick={handleDeactivate}
            className="w-full py-2.5 rounded-lg text-[11px] font-medium border border-white/[0.10] bg-white/[0.02] text-white/55 cursor-pointer transition-all duration-150 ease-out hover:border-[rgba(248,113,113,0.55)] hover:bg-[rgba(248,113,113,0.10)] hover:text-[#f87171] hover:shadow-[0_0_0_1px_rgba(248,113,113,0.20),0_0_18px_rgba(248,113,113,0.10)] hover:-translate-y-[2px] active:scale-[0.98] active:translate-y-0"
          >
            Deactivate This Device
          </button>
        </>
      )}

      {/* Inactive: minimal info */}
      {!isActive && !isTrial && (
        <div className="rounded-2xl border border-white/[0.08] p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between">
            <span className={LICENSE_LABEL_CLASS}>Status</span>
            <span className="text-[11px] font-semibold text-negative">Inactive</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={LICENSE_LABEL_CLASS}>Device</span>
            <span className="text-[11px] text-white/50">{deviceLabel}</span>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

// ── What's New ───────────────────────────────────────────────────────────────

function WhatsNewSection() {
  const [updates, setUpdates] = useState<PublishedUpdate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPublishedUpdates()
      .then(setUpdates)
      .finally(() => setLoading(false))
    markUpdatesSeen()
  }, [])

  if (loading) {
    return <p className="text-[11px] text-white/20 py-8 text-center">Loading...</p>
  }

  if (updates.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm text-white/70 font-medium">What&rsquo;s New</span>
        <p className="text-[11px] text-white/25 py-6">No updates yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <span className="text-sm text-white/70 font-medium">What&rsquo;s New</span>
      <div className="flex flex-col gap-4">
        {updates.map((u) => (
          <div key={u.id} className="flex flex-col gap-1.5 pb-4 border-b border-white/[0.04] last:border-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-semibold text-white/70">{u.title}</span>
              {u.version && (
                <span className="text-[10px] text-white/20 font-mono">{u.version}</span>
              )}
            </div>
            <span className="text-[10px] text-white/20">
              {new Date(u.published_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
            {u.summary && (
              <p className="text-[11px] text-white/40 leading-relaxed">{u.summary}</p>
            )}
            {u.body && (
              <p className="text-[11px] text-white/30 leading-relaxed whitespace-pre-line mt-1">{u.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── About ─────────────────────────────────────────────────────────────────────

type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error'

function AboutSection() {
  const version = useAppVersion()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleCheck = async () => {
    setUpdateStatus('checking')
    setLatestVersion(null)
    setDownloadUrl(null)
    setErrorMessage('')
    const verdict = await checkForUpdate()
    if (verdict.status === 'update-available' || verdict.status === 'force-update') {
      setLatestVersion(verdict.latest.version)
      const host = await window.updateAPI!.getPlatform()
      setDownloadUrl(pickDownloadUrl(verdict.latest, host))
      setUpdateStatus('updateAvailable')
    } else if (verdict.status === 'error') {
      setErrorMessage(verdict.error || 'Could not reach update server')
      setUpdateStatus('error')
    } else {
      setUpdateStatus('upToDate')
    }
  }

  const handleDownload = async () => {
    if (!downloadUrl) return
    await window.updateAPI!.openDownload(downloadUrl)
  }

  const statusText: Record<UpdateStatus, string> = {
    idle: 'No check performed yet',
    checking: 'Checking for updates\u2026',
    upToDate: 'You\u2019re up to date',
    updateAvailable: `Update available: v${latestVersion}`,
    error: errorMessage || 'Check failed',
  }

  return (
    <div className="flex flex-col gap-5">

      {/* App identity */}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-white/70 font-medium">Nookra</span>
        <span className="text-[11px] text-white/25 tabular-nums">{version ? `v${version}` : ''}</span>
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Update section */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-white/25 leading-relaxed">
          Check for the latest version of Nookra.
        </p>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCheck}
            disabled={updateStatus === 'checking'}
            className="btn-press px-3.5 py-2 rounded-lg text-[11px] font-medium border border-white/[0.08] bg-white/[0.02] text-white/40 hover:border-white/15 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-default"
          >
            {updateStatus === 'checking' ? 'Checking\u2026' : 'Check for Updates'}
          </button>

          <span className={clsx(
            'text-[11px] tabular-nums transition-colors duration-200',
            updateStatus === 'upToDate' && 'text-emerald-400/60',
            updateStatus === 'updateAvailable' && 'text-amber-400/70',
            updateStatus === 'error' && 'text-rose-400/60',
            (updateStatus === 'idle' || updateStatus === 'checking') && 'text-white/20',
          )}>
            {statusText[updateStatus]}
          </span>
        </div>

        {updateStatus === 'updateAvailable' && downloadUrl && (
          <button
            onClick={handleDownload}
            style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent-border)' }}
            className="btn-press w-full py-2.5 rounded-lg text-xs font-semibold text-white border cursor-pointer transition-all duration-150"
          >
            Update Now
          </button>
        )}
      </div>

    </div>
  )
}

// ── Report a Bug ──────────────────────────────────────────────────────────────

// ── Shared email context helper ───────────────────────────────────────────────

function buildSystemInfo(type: string, version: string): string {
  const now = new Date()
  const timestamp = now.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
  const platform = (() => {
    const ua = navigator.userAgent
    if (/Mac/i.test(ua))         return 'macOS'
    if (/Win/i.test(ua))         return 'Windows'
    if (/Linux/i.test(ua))       return 'Linux'
    if (/iPhone|iPad/i.test(ua)) return 'iOS'
    if (/Android/i.test(ua))     return 'Android'
    return 'Unknown'
  })()

  return [
    '---',
    'System Info:',
    `Type:     ${type}`,
    `Version:  ${version ? `v${version}` : 'unknown'}`,
    `Time:     ${timestamp}`,
    `Platform: ${platform}`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────

const BUG_TYPES = ['UI Bug', 'Data Issue', 'Performance', 'Other'] as const
type BugType = typeof BUG_TYPES[number]

function ReportBugSection() {
  const version = useAppVersion()
  const [description,   setDescription]   = useState('')
  const [bugType,       setBugType]        = useState<BugType | null>(null)
  const [customBugType, setCustomBugType]  = useState('')
  const customRef = useRef<HTMLInputElement>(null)

  const clear = () => { setDescription(''); setBugType(null); setCustomBugType('') }

  const handleSelectType = (t: BugType) => {
    setBugType(bugType === t ? null : t)
    setCustomBugType('')
    if (t === 'Other') setTimeout(() => customRef.current?.focus(), 0)
  }

  const resolvedType = bugType === 'Other' && customBugType.trim()
    ? customBugType.trim()
    : bugType !== 'Other' && bugType
    ? bugType
    : bugType === 'Other'
    ? 'Other'
    : 'Nothing selected'

  const handleSend = () => {
    const userLines = `Message:\n\n${description.trim()}`
    const body = encodeURIComponent(`${userLines}\n\n${buildSystemInfo(resolvedType, version)}`)
    const subject = encodeURIComponent('Bug Report - Nookra')
    window.location.href = `mailto:nookratradingjournal@gmail.com?subject=${subject}&body=${body}`
    clear()
  }

  const canSend = description.trim().length > 0

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-white mb-1">Report a Bug</p>
        <p className="text-[11px] text-white/30 leading-relaxed">
          Describe what went wrong and what you were doing.
        </p>
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Description */}
      <div>
        <SLabel>Description</SLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What broke? What were you doing?"
          rows={4}
          className="input-field resize-none text-sm leading-relaxed"
        />
      </div>

      {/* Bug type */}
      <div className="flex flex-col gap-2">
        <SLabel>Type <span className="normal-case tracking-normal font-normal text-white/15 ml-1">optional</span></SLabel>
        <div className="flex flex-wrap gap-1.5">
          {BUG_TYPES.map((t) => (
            <ChipBtn key={t} active={bugType === t} onClick={() => handleSelectType(t)}>
              {t}
            </ChipBtn>
          ))}
        </div>
        {bugType === 'Other' && (
          <input
            ref={customRef}
            type="text"
            value={customBugType}
            onChange={(e) => setCustomBugType(e.target.value)}
            placeholder="Enter custom issue type…"
            className="input-field text-sm mt-0.5"
          />
        )}
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={clear}
          className={MODAL_CANCEL_BTN_CLASS}
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={canSend ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent-border)' } : undefined}
          className={MODAL_SEND_BTN_CLASS}
        >
          Send Report
        </button>
      </div>

    </div>
  )
}

// ── Feedback ──────────────────────────────────────────────────────────────────

const FEEDBACK_TYPES = ['General', 'Feature Request', 'UX / Design', 'Other'] as const
type FeedbackType = typeof FEEDBACK_TYPES[number]

function FeedbackSection() {
  const version = useAppVersion()
  const [message,            setMessage]           = useState('')
  const [feedbackType,       setFeedbackType]       = useState<FeedbackType | null>(null)
  const [customFeedbackType, setCustomFeedbackType] = useState('')
  const customRef = useRef<HTMLInputElement>(null)

  const clear = () => { setMessage(''); setFeedbackType(null); setCustomFeedbackType('') }

  const handleSelectType = (t: FeedbackType) => {
    setFeedbackType(feedbackType === t ? null : t)
    setCustomFeedbackType('')
    if (t === 'Other') setTimeout(() => customRef.current?.focus(), 0)
  }

  const resolvedType = feedbackType === 'Other' && customFeedbackType.trim()
    ? customFeedbackType.trim()
    : feedbackType !== 'Other' && feedbackType
    ? feedbackType
    : feedbackType === 'Other'
    ? 'Other'
    : 'Nothing selected'

  const handleSend = () => {
    const userLines = `Message:\n\n${message.trim()}`
    const body = encodeURIComponent(`${userLines}\n\n${buildSystemInfo(resolvedType, version)}`)
    const subject = encodeURIComponent('Feedback - Nookra')
    window.location.href = `mailto:nookratradingjournal@gmail.com?subject=${subject}&body=${body}`
    clear()
  }

  const canSend = message.trim().length > 0

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-white mb-1">Feedback</p>
        <p className="text-[11px] text-white/30 leading-relaxed">
          Share thoughts, ideas, or anything that could make this better.
        </p>
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Message */}
      <div>
        <SLabel>Message</SLabel>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          className="input-field resize-none text-sm leading-relaxed"
        />
      </div>

      {/* Feedback type */}
      <div>
        <SLabel>Type <span className="normal-case tracking-normal font-normal text-white/15 ml-1">optional</span></SLabel>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_TYPES.map((t) => (
            <ChipBtn
              key={t}
              active={feedbackType === t}
              onClick={() => handleSelectType(t)}
            >
              {t}
            </ChipBtn>
          ))}
        </div>
        {feedbackType === 'Other' && (
          <input
            ref={customRef}
            type="text"
            value={customFeedbackType}
            onChange={(e) => setCustomFeedbackType(e.target.value)}
            placeholder="Describe your feedback type…"
            className="input-field mt-2 text-sm"
          />
        )}
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={clear}
          className={MODAL_CANCEL_BTN_CLASS}
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={canSend ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent-border)' } : undefined}
          className={MODAL_SEND_BTN_CLASS}
        >
          Send Feedback
        </button>
      </div>

    </div>
  )
}

// ── Support placeholders ─────────────────────────────────────────────────────

function PlaceholderSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-[11px] text-white/30 leading-relaxed">{body}</p>
    </div>
  )
}

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  /** When provided, forces the panel's active section to this value and
   *  keeps it in sync. Used exclusively by the tutorial scene controller
   *  so each `settings-*` sub-step lands on the right nav section. When
   *  undefined (normal usage), the panel manages its own active state. */
  forceSection?: SectionId
}

export function SettingsPanel({ open, onClose, forceSection }: SettingsPanelProps) {
  const version = useAppVersion()
  const [active, setActive] = useState<SectionId>('appearance')
  const [hasNewUpdates, setHasNewUpdates] = useState(false)
  const { start: startTutorial } = useTutorial()

  // Replay handler — one-shot manual re-run. Does NOT touch the persisted
  // "already onboarded on this device" flags (licensed / trial). That flag
  // is written at auto-fire time by ActivationGate; if we cleared it here,
  // the next app launch would auto-fire the tour AGAIN — the opposite of
  // what replay should do. Replay just closes settings and restarts the
  // tour for the current session after the panel slide-out settles (~300ms
  // matches the panel transition below).
  const handleReplayTutorial = () => {
    onClose()
    setTimeout(() => startTutorial(FULL_TUTORIAL_STEPS), 320)
  }

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  useEffect(() => { if (open) setActive('appearance') }, [open])

  // Tutorial override — when the scene controller asks for a specific
  // section (e.g. `trading` for the Currency sub-step), snap to it. Takes
  // effect both while the panel is already open AND on the very first
  // render after `openSettings()` runs.
  useEffect(() => {
    if (forceSection) setActive(forceSection)
  }, [forceSection])

  // Check for unseen updates when panel opens
  useEffect(() => {
    if (!open) return
    hasUnseenUpdates().then(setHasNewUpdates).catch(() => {})
  }, [open])

  const handleNavClick = (id: SectionId) => {
    setActive(id)
    if (id === 'whats-new') {
      setHasNewUpdates(false)
    }
  }

  return (
    <>
      {/* Backdrop — wrapped in AnimatePresence so it fades out smoothly
          when `open` flips to false. Previous version unmounted the dim
          layer instantly, which made dismiss feel abrupt relative to the
          panel's 300ms slide. Duration is kept slightly shorter than the
          panel slide so the dim clears just ahead of the panel leaving
          the viewport. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={onClose}
            variants={BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BACKDROP_TRANSITION}
          />
        )}
      </AnimatePresence>
      <div
        data-tutorial="settings-panel"
        className={clsx(
          'fixed top-0 right-0 bottom-0 z-50 flex flex-col transition-transform duration-300 ease-out w-[440px]',
          'bg-[#111113] border-l border-white/[0.06]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <span className="text-sm font-semibold text-white">Settings</span>
          <button onClick={onClose} className={CLOSE_BTN_CLASS}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[116px] shrink-0 border-r border-white/[0.05] py-3 flex flex-col gap-0.5 overflow-y-auto">
            {NAV.map((s) => (
              <button
                key={s.id}
                onClick={() => handleNavClick(s.id)}
                className={clsx(
                  'text-left px-4 py-2 text-[11px] font-medium transition-all duration-150 cursor-pointer',
                  active === s.id ? 'text-white bg-white/[0.06]' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                )}
              >
                {s.label}
              </button>
            ))}

            {/* Support group */}
            <div className="mx-4 my-2 h-px bg-white/[0.05]" />
            <p className="px-4 pb-1 text-[9px] font-bold text-white/20 uppercase tracking-[0.14em]">Support</p>
            {NAV_SUPPORT.map((s) => (
              <button
                key={s.id}
                onClick={() => handleNavClick(s.id)}
                className={clsx(
                  'text-left px-4 py-2 text-[11px] font-medium transition-all duration-150 cursor-pointer relative',
                  active === s.id ? 'text-white bg-white/[0.06]' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                )}
              >
                {s.label}
                {s.id === 'whats-new' && hasNewUpdates && (
                  <span className="absolute top-2 right-3 w-[6px] h-[6px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {active === 'appearance' && <AppearanceSection onReplayTutorial={handleReplayTutorial} />}
            {active === 'trading'    && <TradingSection />}
            {active === 'focus'      && <FocusSection />}
            {active === 'metrics'    && <MetricsSection />}
            {active === 'data'       && <DataSection onClose={onClose} />}
            {active === 'account'    && <AccountSection />}
            {active === 'license'    && <LicenseSection />}
            {active === 'whats-new'  && <WhatsNewSection />}
            {active === 'about'      && <AboutSection />}
            {active === 'report-bug' && <ReportBugSection />}
            {active === 'feedback'   && <FeedbackSection />}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-white/[0.04] shrink-0">
          <p className="text-[9px] text-white/15 text-center tracking-wider uppercase">{version ? `v${version}` : ''} · Local</p>
        </div>
      </div>
    </>
  )
}
