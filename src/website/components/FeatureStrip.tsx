import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW } from '../motion'
import { JournalIcon, ChecklistIcon, ChartIcon, WidgetsIcon, CalendarIcon, LockIcon } from '../Icons'

const FEATURES = [
  {
    icon: JournalIcon,
    title: 'Trade Journal',
    body: 'Type in every trade with notes, screenshots, and the rules you actually followed.',
  },
  {
    icon: CalendarIcon,
    title: 'Calendar Review',
    body: 'A monthly heatmap of green and red days. Click any day to revisit what you logged.',
  },
  {
    icon: ChartIcon,
    title: 'Performance Metrics',
    body: 'Equity, win rate, total P&L, average win/loss — surfaced where you work, not buried.',
  },
  {
    icon: ChecklistIcon,
    title: 'Pre-Trade Checklist',
    body: 'Write the reminders you need before clicking. Check them off the next time you trade.',
  },
  {
    icon: WidgetsIcon,
    title: 'Custom Widgets',
    body: 'Pin streak, daily risk, sessions, bias, recent trades — whatever keeps you honest.',
  },
  {
    icon: LockIcon,
    title: 'Private & Local',
    body: 'Trades, notes, and screenshots stay on your Mac. No account, no telemetry, no sync.',
  },
]

export const FeatureStrip: React.FC = () => (
  <section id="features" className="relative py-24 lg:py-32">
    <div className="nk-container">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="max-w-[760px] mx-auto text-center mb-16 lg:mb-20"
      >
        <motion.span variants={fadeUp} className="nk-eyebrow mb-5 nk-no-select">
          <span className="nk-eyebrow-dot" />
          What&rsquo;s in the box
        </motion.span>
        <motion.h2 variants={fadeUp} className="nk-t-h1 nk-text-primary mb-4">
          Every tool you need. Nothing you don&rsquo;t.
        </motion.h2>
        <motion.p variants={fadeUp} className="nk-t-body-lg max-w-[580px] mx-auto">
          Six surfaces, all built for traders who already have a process and want a clean place to record and review it. No noise, no advice, no auto-graded scoreboards.
        </motion.p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[1080px] mx-auto"
      >
        {FEATURES.map((f, i) => (
          <motion.div
            key={i}
            variants={fadeUp}
            className="nk-card-frost group rounded-2xl p-6 flex flex-col"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 border border-white/[0.08] transition-all duration-200 group-hover:border-[rgba(175,194,212,0.35)] group-hover:bg-[rgba(175,194,212,0.06)]"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <f.icon size={19} style={{ color: 'rgba(237,240,246,0.78)' }} />
            </div>
            <div className="text-[15.5px] font-semibold leading-[1.35] tracking-tight text-white/95 mb-2">
              {f.title}
            </div>
            <p className="text-[13.5px] leading-[1.55] text-white/60">
              {f.body}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
)

export default FeatureStrip
