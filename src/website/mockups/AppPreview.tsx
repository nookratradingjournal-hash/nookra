import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { HeroStats } from '../../components/HeroStats'
import { Checklist } from '../../components/Checklist'
import { Calendar } from '../../components/Calendar'
import { TradeList } from '../../components/TradeList'
import { WidgetContent } from '../../components/widgets/WidgetContent'
import { DEMO_TRADES, DEMO_STRATEGIES, DEMO_ACTIVE_STRATEGY_ID, DEMO_STARTING_BALANCE } from './demoData'

/**
 * Mini Nookra app preview — faithful miniature of the real desktop app.
 *
 * Reuses the real components (HeroStats, Calendar, TradeList, Checklist,
 * WidgetContent) wired through the in-memory localStorage sandbox. Layout
 * mirrors the real app: 48px sticky header, slim widget rails on each
 * side, 860px center column with each section below.
 *
 * Scroll behavior: internal scroll IS allowed so the visitor can browse
 * the full preview, but `overscroll-behavior` is left at the default
 * `auto`. That gives natural scroll-chaining — when the preview's
 * internal scroll reaches its bottom (or top), additional wheel events
 * propagate to the marketing page, so the visitor never gets trapped.
 *
 * Widget rails: three unique widgets per side (no duplicates between
 * left and right). Left: day-grade, session (medium), best-today.
 * Right: daily-risk, bias (medium), streak.
 *
 * All preview state resets on page refresh.
 */
export const AppPreview: React.FC = () => {
  const hydrated = useRef(false)
  const [ready, setReady] = useState(false)
  const [month, setMonth] = useState(3)
  const [year, setYear] = useState(2026)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const { getState, setState } = useAppStore
    const store = getState()
    store.importTrades(DEMO_TRADES)
    store.setStartingBalance(DEMO_STARTING_BALANCE)
    setState({ strategies: DEMO_STRATEGIES, activeStrategyId: DEMO_ACTIVE_STRATEGY_ID })
    setReady(true)
  }, [])

  const trades           = useAppStore(s => s.trades)
  const settings         = useAppStore(s => s.settings)
  const strategies       = useAppStore(s => s.strategies)
  const activeStrategyId = useAppStore(s => s.activeStrategyId)
  const focusNote        = useAppStore(s => s.focusNote)
  const startingBalance  = useAppStore(s => s.startingBalance)
  const selectedDate     = useAppStore(s => s.selectedDate)

  const activeStrat = strategies.find(s => s.id === activeStrategyId)
  const items = activeStrat?.items ?? []

  // Toggle stays interactive (user can flip existing items in the demo).
  // Add / remove / edit are no-ops in the preview — the website should not
  // let visitors mutate the demo checklist beyond toggling. The "+ Add item"
  // and "+ Add divider" buttons in the real Checklist are visually dimmed
  // via the `.nk-checklist-locked` wrapper + scoped CSS so they're clearly
  // inactive (no click, no input opens, no toast).
  const onToggle    = (id: string) => useAppStore.getState().toggleChecklistItem(id)
  const onAdd       = (_text: string) => {}
  const onAddSpacer = (_text: string) => {}
  const onRemove    = (_id: string) => {}
  const onEdit      = (_id: string, _text: string) => {}

  const onPrevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const onNextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const onSelectDate = (d: string) => useAppStore.getState().selectDate(d)

  return (
    <div
      className="nk-app-preview-card relative overflow-hidden"
      style={{
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#09090b',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 80px 160px rgba(0,0,0,0.55), 0 30px 60px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="nk-app-preview nk-app-preview-scroll"
        style={{
          // Internal scroll IS allowed (so the visitor can browse the full
          // preview), but `overscrollBehavior: 'auto'` (the default) keeps
          // the natural scroll-chaining: once the preview hits its top or
          // bottom, further wheel events propagate to the marketing page
          // so the visitor never gets stuck inside the card.
          height: 720,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'auto',
          position: 'relative',
        }}
      >
        <div className="journal-root" style={{ background: '#09090b', minHeight: '100%' }}>
          {/* ── Real app header (visual reproduction — see App.tsx:1552) ── */}
          <header
            className="app-header sticky top-0 z-40"
            style={{
              height: 48,
              display: 'flex',
              alignItems: 'center',
              // Soft fade at the bottom of the header replaces the explicit
              // 1px hairline border + dark drop-shadow that used to sit
              // here. The hairline read as a hard black stripe when the
              // header pinned during internal scroll.
              background:
                'linear-gradient(180deg, rgba(22,22,25,0.94) 0%, rgba(14,14,16,0.94) 90%, rgba(14,14,16,0) 100%)',
              // Lowered from blur(18px) saturate(140%) — same visual effect
              // but cheaper to composite, especially on mobile Safari.
              backdropFilter: 'blur(12px) saturate(120%)',
              WebkitBackdropFilter: 'blur(12px) saturate(120%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              position: 'sticky',
            }}
          >
            {/* macOS traffic lights — decorative only, pinned to top-left of
                the window frame (outside the centered 860px content rail). */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                gap: 6,
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 1,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)', display: 'inline-block' }} />
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)', display: 'inline-block' }} />
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)', display: 'inline-block' }} />
            </div>
            <div
              className="w-full max-w-[860px] mx-auto px-8"
              style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div className="flex items-center" style={{ transform: 'translateY(1px)' }}>
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.25)',
                    marginRight: 8, display: 'inline-block', flexShrink: 0,
                  }}
                />
                <span className="text-[10.5px] font-semibold tracking-[0.16em] text-white/30 uppercase select-none">
                  Nookra
                </span>
                <span className="ml-2 text-[8.5px] font-bold text-[#C4C4C8]/95 uppercase tracking-[0.16em] select-none px-1.5 py-0.5 rounded-md bg-[rgba(142,142,147,0.16)] border border-[rgba(142,142,147,0.42)]">
                  Preview
                </span>
              </div>
              <div className="flex items-center gap-1.5" style={{ transform: 'translateY(1px)' }}>
                <HeaderIconBtn label="Widgets">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                  </svg>
                </HeaderIconBtn>
                <HeaderIconBtn label="Settings">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </HeaderIconBtn>
              </div>
            </div>
          </header>

          {/* ── 3-col body: left rail · center column · right rail ──
              Each rail shows three unique widgets (no left/right duplicates),
              kept short enough that the rails don't dominate the card. */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: '140px 1fr 140px',
              alignItems: 'start',
              gap: 8,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 14,
            }}
          >
            <WidgetRail side="left" />

            <main className="max-w-[860px] mx-auto px-8 pb-12 w-full">
              {ready && (
                <>
                  <HeroStats
                    trades={trades}
                    currency={settings.currency}
                    startingBalance={startingBalance}
                    focusNote={focusNote}
                    quotesEnabled={settings.quotesEnabled}
                    visibleMetrics={settings.visibleMetrics}
                  />

                  <section id="section-checklist" className="mt-10">
                    <SectionLabel label="Pre-Trade Checklist" />
                    <PreviewStrategySwitcher
                      strategies={strategies}
                      activeId={activeStrategyId}
                      onSwitch={(id) => useAppStore.getState().setActiveStrategy(id)}
                    />
                    <div className="nk-checklist-locked">
                      <Checklist
                        items={items}
                        onToggle={onToggle}
                        onAdd={onAdd}
                        onAddSpacer={onAddSpacer}
                        onRemove={onRemove}
                        onEdit={onEdit}
                      />
                    </div>
                  </section>

                  <section id="section-calendar" className="mt-12">
                    <SectionLabel label="Calendar" />
                    <Calendar
                      trades={trades}
                      selectedDate={selectedDate}
                      onSelectDate={onSelectDate}
                      month={month}
                      year={year}
                      onPrevMonth={onPrevMonth}
                      onNextMonth={onNextMonth}
                      currency={settings.currency}
                      showCount={true}
                      tileStyle={settings.tileStyle ?? 'solid'}
                    />
                  </section>

                  <section id="section-recent-trades" className="mt-12">
                    <SectionLabel label="Recent Trades" />
                    <TradeList trades={trades} currency={settings.currency} />
                  </section>
                </>
              )}
            </main>

            <WidgetRail side="right" />
          </div>
        </div>

        {/* Bottom fade — purely visual, doesn't block clicks */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 80,
            background: 'linear-gradient(180deg, rgba(9,9,11,0) 0%, rgba(9,9,11,0.85) 70%, rgba(9,9,11,0.96) 100%)',
          }}
        />
      </div>

    </div>
  )
}

// ── PreviewStrategySwitcher ────────────────────────────────────────────────
// Visual port of the real StrategySwitcher (src/components/StrategySwitcher.tsx)
// scaled down to the surface needed by the preview: chevrons + active name.
// Rename / add / delete affordances are intentionally omitted — the preview
// is locked, and the real app's full switcher is reachable in the desktop
// build. Switches between the two demo strategies via the sandboxed store.
const PreviewStrategySwitcher: React.FC<{
  strategies: Array<{ id: string; name: string }>
  activeId: string
  onSwitch: (id: string) => void
}> = ({ strategies, activeId, onSwitch }) => {
  if (strategies.length < 2) return null
  const idx = Math.max(0, strategies.findIndex(s => s.id === activeId))
  const active = strategies[idx]
  const prevId = strategies[(idx - 1 + strategies.length) % strategies.length].id
  const nextId = strategies[(idx + 1) % strategies.length].id

  return (
    <div className="flex items-center gap-1 mt-1 mb-3 group/row">
      <button
        type="button"
        onClick={() => onSwitch(prevId)}
        title="Previous strategy"
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150 text-white/25 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer"
      >
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M6 1L1.5 5.5L6 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onSwitch(nextId)}
        title={active.name}
        className="text-sm font-medium text-white/55 hover:text-white/85 transition-colors duration-150 px-1.5 py-0.5 rounded-md hover:bg-white/[0.03] cursor-pointer truncate min-w-0 max-w-[260px]"
      >
        {active.name}
      </button>

      <button
        type="button"
        onClick={() => onSwitch(nextId)}
        title="Next strategy"
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150 text-white/25 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer"
      >
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M1 1L5.5 5.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="flex-1" />
    </div>
  )
}

// ── SectionLabel — copy of helper from App.tsx:374 ─────────────────────────
const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-4 mb-6">
    <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.14em] whitespace-nowrap shrink-0">
      {label}
    </span>
    <div className="flex-1 h-px bg-white/[0.05]" />
  </div>
)

// ── Header icons ───────────────────────────────────────────────────────────
// Visual-only — hover lifts and the button registers a press, but no toast,
// no modal, no state change. Cursor stays default so the icons don't shout
// "click me to do something" — they're chrome that mirrors the real app's
// shape without claiming any preview-side function.
const HeaderIconBtn: React.FC<{
  children: React.ReactNode; label: string
}> = ({ children, label }) => (
  <span
    aria-label={label}
    title={label}
    className="text-white/20 hover:text-white/55 hover:bg-white/[0.06] border border-transparent p-1.5 rounded-md transition-colors duration-150 inline-flex items-center justify-center"
  >
    {children}
  </span>
)

// ── Widget rails ──────────────────────────────────────────────────────────
// Three unique widgets per side. Heights: 130px small + 220px medium +
// 130px small ≈ 480px, short enough that the rails don't dominate the
// 720px crop. Rendered as static divs (no click handler, no focus state).
type RailSide = 'left' | 'right'
const RAIL_WIDGETS: Record<RailSide, Array<{ type: string; h: number; key: string }>> = {
  left: [
    { key: 'L1', type: 'small/day-grade',  h: 130 },
    { key: 'L2', type: 'medium-v/session', h: 220 },
    { key: 'L3', type: 'small/best-today', h: 130 },
  ],
  right: [
    { key: 'R1', type: 'small/daily-risk', h: 130 },
    { key: 'R2', type: 'medium-v/bias',    h: 220 },
    { key: 'R3', type: 'small/streak',     h: 130 },
  ],
}

// Widgets are rendered as static visual chrome — no click handler, no
// focus ring, no green glow. Earlier the rail items were buttons that
// flashed an emerald box-shadow on click; that read as a UI affordance
// the preview can't actually deliver, so it's been dropped.
const WidgetRail: React.FC<{ side: RailSide }> = ({ side }) => (
  <aside style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {RAIL_WIDGETS[side].map((w) => (
      <div
        key={w.key}
        className="placed-widget block"
        style={{ height: w.h, width: '100%' }}
        aria-hidden
      >
        <WidgetContent type={w.type} />
      </div>
    ))}
  </aside>
)

export default AppPreview
