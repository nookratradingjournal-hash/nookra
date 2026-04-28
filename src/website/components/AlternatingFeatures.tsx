import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, slideLeft, slideRight, IN_VIEW } from '../motion'

/**
 * Three alternating feature blocks — each describes a real Nookra surface
 * with a generic visual mock. No personal-strategy names, no auto-grading
 * chips, no fake session/rule-adherence claims. Mock cards are abstract
 * representations of structure only.
 */

type MockKey = 'calendar' | 'checklist' | 'widgets'
type Block = {
  eyebrow: string
  title: string
  body: string
  points: string[]
  reverse?: boolean
  mock: MockKey
}

const BLOCKS: Block[] = [
  {
    eyebrow: 'Calendar',
    title: 'Every trading day, in one view.',
    body: 'A monthly heatmap that turns your year into a single page. Green and red tiles map your wins and losses across the month — click any day to revisit the trades you logged that session, the rules you followed, and the notes you took.',
    points: [
      'Monthly heatmap colored by daily net P&L',
      'Click any day to read the trades you logged',
      'Trade-count badges so heavy days stand out',
      'No auto-import — only the trades you typed in',
    ],
    mock: 'calendar',
  },
  {
    eyebrow: 'Checklist',
    title: 'A simple routine, in front of you.',
    body: 'A pre-trade checklist that lives where you trade. Build the reminders you personally need to see — risk, size, setup, mindset — and tick them off before you click. Multiple named lists let you keep one routine for breakouts, another for pullbacks, without ever mixing them.',
    points: [
      'Multiple named checklists for different setups',
      'Section dividers and free-form items, fully editable',
      'Tick or untick — the choice is always yours',
      'Strategy name auto-fills when you log the trade',
    ],
    mock: 'checklist',
    reverse: true,
  },
  {
    eyebrow: 'Widgets',
    title: 'A dashboard you arrange.',
    body: 'Drag the widgets that matter onto the rails and leave the rest behind. Day Grade, Streak, Daily Risk, Session breakdown, Recent Trades, Bias — pin the ones that keep you honest, hide the ones you\u2019re tempted to obsess over.',
    points: [
      'Small and medium widgets to suit your workspace',
      'Keep the metrics that hold you accountable in view',
      'Hide the ones that pull you away from the work',
      'Reshape the layout any time your routine changes',
    ],
    mock: 'widgets',
  },
]

const renderMock = (key: MockKey) => {
  if (key === 'calendar')  return <CalendarMock />
  if (key === 'checklist') return <ChecklistMock />
  return <WidgetsMock />
}

export const AlternatingFeatures: React.FC = () => (
  <section className="relative py-24 lg:py-32 nk-bg-section-alt">
    <div className="nk-container space-y-24 lg:space-y-32">
      {BLOCKS.map((b, i) => (
        <FeatureBlock key={i} {...b} />
      ))}
    </div>
  </section>
)

const FeatureBlock: React.FC<Block> = ({ eyebrow, title, body, points, reverse, mock }) => (
  <div
    className={
      'grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center ' +
      (reverse ? 'lg:[&>*:first-child]:order-2' : '')
    }
  >
    <motion.div initial="hidden" whileInView="show" viewport={IN_VIEW} variants={stagger}>
      <motion.span variants={fadeUp} className="nk-eyebrow mb-5">
        <span className="nk-eyebrow-dot" />
        {eyebrow}
      </motion.span>
      <motion.h2 variants={fadeUp} className="nk-t-h2 nk-text-primary mb-4">
        {title}
      </motion.h2>
      <motion.p variants={fadeUp} className="nk-t-body-lg mb-6 max-w-[520px]">
        {body}
      </motion.p>
      <motion.ul variants={stagger} className="space-y-2.5">
        {points.map((p, i) => (
          <motion.li key={i} variants={fadeUp} className="flex items-start gap-2.5 text-[14.5px] leading-[1.55] text-white/72">
            <span className="mt-[7px] w-1 h-1 rounded-full bg-[#AFC2D4] flex-shrink-0 shadow-[0_0_6px_rgba(175,194,212,0.8)]" />
            <span>{p}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>

    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      variants={reverse ? slideRight : slideLeft}
      className="relative"
    >
      <div
        aria-hidden
        className="absolute -inset-8 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(203,213,225,0.04) 0%, transparent 68%)',
          filter: 'blur(5px)',
        }}
      />
      <div className="relative">{renderMock(mock)}</div>
    </motion.div>
  </div>
)

// ── Mock cards (abstract visualizations of real surfaces) ───────────────────

const CalendarMock: React.FC = () => {
  // Generic monthly heatmap — no specific dates, no personal data, no setup
  // names. Just shape: 7-col grid of green/red/empty cells.
  const cells: Array<'pos' | 'neg' | 'empty'> = [
    'empty','empty','pos','pos','neg','empty','empty',
    'pos','empty','neg','pos','pos','empty','empty',
    'pos','neg','pos','pos','empty','empty','pos',
    'pos','pos','neg','pos','empty','empty','pos',
    'empty','empty','empty','empty','empty','empty','empty',
  ]
  return (
    <div className="nk-glass-elevated p-5 md:p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">Monthly view</div>
          <div className="text-[15px] text-white/92 font-semibold mt-1 tracking-tight">Calendar</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-white/45">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/40 border border-emerald-500/50" /> Win
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/35 border border-red-500/50" /> Loss
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-[9px] uppercase tracking-[0.1em] text-white/25 text-center font-semibold">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => (
          <div
            key={i}
            className={
              'h-[44px] rounded-lg ' +
              (c === 'pos'   ? 'bg-emerald-500/[0.14] border border-emerald-500/[0.22]' :
               c === 'neg'   ? 'bg-red-500/[0.12] border border-red-500/[0.22]' :
                               'bg-white/[0.018]')
            }
          />
        ))}
      </div>
    </div>
  )
}

const ChecklistMock: React.FC = () => {
  // Generic checklist items — universal trader prompts, not strategy-specific.
  const items = [
    { label: 'Stop loss set',          done: true },
    { label: 'Position size confirmed',done: true },
    { label: 'Risk under my limit',    done: true },
    { label: 'I wrote down my reason', done: false },
    { label: 'I am calm enough to take this trade', done: false },
  ]
  const checkedCount = items.filter(i => i.done).length

  return (
    <div className="nk-glass-elevated p-5 md:p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">Pre-trade checklist</div>
          <div className="text-[15px] text-white/92 font-semibold mt-1 tracking-tight">Your list, your routine</div>
        </div>
        <div className="text-[11px] text-white/45 tabular-nums">{checkedCount} / {items.length}</div>
      </div>

      <div className="h-px bg-white/[0.06] rounded-full overflow-hidden mb-4">
        <div className="h-full bg-white/30 rounded-full" style={{ width: `${(checkedCount / items.length) * 100}%` }} />
      </div>

      <div className="space-y-0">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <span
              className={
                'w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 ' +
                (it.done ? 'bg-white/90 border-white/90' : 'border-white/15')
              }
            >
              {it.done && (
                <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                  <path d="M1 4L3 6L7 2" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className={'text-[13.5px] ' + (it.done ? 'text-white/30 line-through' : 'text-white/65')}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// WidgetsMock — mirrors the real app's widget grid.
// Real small widgets are 108×108 (square) and medium-h are 220×108 (wide).
// Layout: 4 small (1×1) on the top row + 2 medium-h (2×1) on the bottom row.
const WidgetsMock: React.FC = () => (
  <div
    className="relative overflow-hidden"
    style={{
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.08)',
      background: '#0b0b0d',
      boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 10px 24px rgba(0,0,0,0.3)',
    }}
  >
    {/* Mini titlebar */}
    <div
      className="flex items-center gap-1.5 px-3.5 py-2.5 relative border-b border-white/[0.05]"
      style={{ background: 'rgba(255,255,255,0.025)' }}
    >
      <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
      <span className="ml-2 text-[9px] font-semibold tracking-[0.16em] text-white/30 uppercase">
        Nookra
      </span>
    </div>

    {/* 4-col grid: top row = four square small widgets (1×1),
        bottom row = two medium-h widgets that each span 2 cols (2×1).
        Aspect ratio is matched to the real app's 108×108 / 220×108 sizes. */}
    <div className="grid grid-cols-4 gap-2.5 p-3">
      <RailCard label="Day grade" value="A"   tone="pos" />
      <RailCard label="Streak"    value="3" />
      <RailCard label="Win rate"  value="62%" highlighted />
      <RailCard label="Avg R"     value="+1.2" tone="pos" />
      <RailCard label="Daily P&L" sparkline span={2} />
      <RailCard label="Equity"    sparkline span={2} />
    </div>
  </div>
)

const RailCard: React.FC<{
  label: string
  value?: string
  tone?: 'pos' | 'neg' | 'neutral'
  sparkline?: boolean
  highlighted?: boolean
  span?: number
}> = ({ label, value, tone = 'neutral', sparkline, highlighted, span }) => (
  <div
    className="rounded-lg px-2.5 py-2.5 flex flex-col justify-between transition-all duration-200"
    style={{
      gridColumn: span ? `span ${span}` : undefined,
      // Small (1×1) cards are square. Medium-h spans 2 cols and stays the
      // same height as the small ones to match the real app's 108-tall
      // medium-h widget proportions.
      aspectRatio: span ? `${span} / 1` : '1 / 1',
      background: highlighted ? 'rgba(175,194,212,0.12)' : 'rgba(255,255,255,0.055)',
      border: highlighted
        ? '1px solid rgba(175,194,212,0.45)'
        : '1px solid rgba(255,255,255,0.05)',
      boxShadow: highlighted
        ? '0 0 26px rgba(175,194,212,0.22), inset 0 1px 0 rgba(255,255,255,0.06)'
        : '0 2px 8px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)',
    }}
  >
    <div className="text-[8.5px] font-bold text-white/35 uppercase tracking-[0.12em] truncate">
      {label}
    </div>
    {sparkline ? (
      <svg viewBox="0 0 120 32" className="w-full" style={{ height: '60%' }} preserveAspectRatio="none">
        <path
          d="M 0 24 L 18 21 L 36 22 L 54 15 L 72 17 L 90 8 L 120 3"
          stroke="#34d399"
          strokeWidth="1.4"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <div
        className={
          'text-[26px] font-bold tabular-nums tracking-tight leading-none ' +
          (tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-red-400' : 'text-white/90')
        }
      >
        {value || '\u2014'}
      </div>
    )}
  </div>
)

export default AlternatingFeatures
