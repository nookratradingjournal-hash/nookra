import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW } from '../motion'
import { AppleIcon, ArrowRightIcon } from '../Icons'

export const FinalCTA: React.FC = () => (
  <section className="relative py-28 lg:py-40 overflow-hidden">
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 1100px 540px at 50% 50%, rgba(175,194,212,0.14) 0%, rgba(175,194,212,0.05) 38%, transparent 68%), radial-gradient(ellipse 700px 360px at 50% 100%, rgba(216,208,191,0.05) 0%, transparent 70%)',
      }}
    />
    <div className="nk-container relative z-10 text-center">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="max-w-[760px] mx-auto"
      >
        <motion.span variants={fadeUp} className="nk-eyebrow mb-6 nk-no-select">
          <span className="nk-eyebrow-dot" />
          The next session
        </motion.span>
        <motion.h2 variants={fadeUp} className="nk-t-display nk-text-primary mb-5">
          Start reviewing your trades.
        </motion.h2>
        <motion.p variants={fadeUp} className="nk-t-body-lg mb-3 max-w-[560px] mx-auto">
          Install Nookra, log your next session by hand, and read it back the morning after. That&rsquo;s the whole loop.
        </motion.p>
        <motion.p variants={fadeUp} className="text-[14px] leading-[1.55] text-white/50 max-w-[480px] mx-auto mb-9">
          One-time $20 license · 1-day free trial · 30-day refund window · No subscription, ever.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-wrap justify-center gap-3 mb-5">
          <a href="#download" className="nk-btn nk-btn-primary">
            <AppleIcon size={15} />
            <span>Download Nookra</span>
          </a>
          <a href="#preview" className="nk-btn nk-btn-secondary">
            <span>View preview</span>
            <ArrowRightIcon size={14} />
          </a>
        </motion.div>
        <motion.p variants={fadeUp} className="nk-t-caption">
          Mac-native today · Windows in private beta
        </motion.p>
      </motion.div>
    </div>
  </section>
)

export default FinalCTA
