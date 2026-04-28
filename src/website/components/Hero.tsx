import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger } from '../motion'
import { ArrowRightIcon, AppleIcon } from '../Icons'

export const Hero: React.FC = () => (
  <section
    id="top"
    className="nk-bg-hero relative min-h-[100svh] flex items-center pt-[120px] pb-[100px] overflow-hidden"
  >
    <div className="nk-container relative z-10 w-full">
      <motion.div
        initial="hidden"
        animate="show"
        variants={stagger}
        className="max-w-[880px] mx-auto text-center"
      >
        <motion.span variants={fadeUp} className="nk-eyebrow mb-7 nk-no-select">
          <span className="nk-eyebrow-dot" />
          A desktop trading journal · Mac-native
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="nk-t-display nk-text-primary mb-7"
        >
          <span className="nk-accent-word">Own</span> every trade.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="nk-t-body-lg max-w-[640px] mx-auto mb-4"
        >
          Nookra is a quiet desktop journal for traders who already have a process. Type each trade in by hand, watch your patterns surface in the calendar, and keep the metrics you actually care about visible while you work.
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="text-[14px] leading-[1.55] text-white/50 max-w-[520px] mx-auto mb-10"
        >
          No broker sync. No auto-import. No cloud. Just a clean place to face your trades.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="relative flex flex-wrap items-center justify-center gap-3.5"
        >
          <div aria-hidden className="nk-frost-glow" />
          <a href="#download" className="nk-btn nk-btn-primary relative">
            <AppleIcon size={15} />
            <span>Download for Mac</span>
          </a>
          <a href="#preview" className="nk-btn nk-btn-secondary relative">
            <span>View preview</span>
            <ArrowRightIcon size={14} />
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-7 text-[12px] text-white/55 flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
        >
          <span>$20 one-time</span>
          <span>·</span>
          <span>1-day free trial</span>
          <span>·</span>
          <span>30-day refund window</span>
          <span>·</span>
          <span>Apple Silicon</span>
        </motion.div>
      </motion.div>
    </div>

    <div className="nk-hairline absolute bottom-0 left-0 right-0" />
  </section>
)

export default Hero
