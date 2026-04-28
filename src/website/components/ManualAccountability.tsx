import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW } from '../motion'

/**
 * Brand statement — manual entry as discipline. Kept clean: eyebrow,
 * headline, one paragraph, three short pillar lines, one closing line.
 * No glass cards, no decorative serif quote, no background glow — the
 * message stands on its own.
 */
export const ManualAccountability: React.FC = () => (
  <section id="discipline" className="relative py-24 lg:py-32">
    <div className="nk-container">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="max-w-[760px] mx-auto text-center"
      >
        <motion.span variants={fadeUp} className="nk-eyebrow mb-6 nk-no-select">
          <span className="nk-eyebrow-dot" />
          Manual for a reason
        </motion.span>

        <motion.h2 variants={fadeUp} className="nk-t-h1 nk-text-primary mb-7">
          Typed by hand. <span className="nk-accent-word">Owned by you.</span>
        </motion.h2>

        <motion.p variants={fadeUp} className="nk-t-body-lg max-w-[620px] mx-auto mb-6">
          Nookra doesn&rsquo;t sync your broker. Every trade gets typed in by you. Typing slows you down just enough to remember the price you paid, the rule you wrote, and the thing you saw before you clicked.
        </motion.p>

        <motion.p variants={fadeUp} className="text-[14.5px] italic leading-[1.55] text-white/45 max-w-[480px] mx-auto mb-14">
          Without a journal, every trade is a story you&rsquo;ll forget by Friday.
        </motion.p>

        <motion.div
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-3 gap-y-6 sm:gap-x-10 max-w-[640px] mx-auto mb-14"
        >
          <Pillar
            title="Memory"
            body="The act of typing a trade is the act of recalling it. Price, rule, reason, screenshot — the journal forces you to face what actually happened, not what you wish had."
          />
          <Pillar
            title="Honesty"
            body="The fields don't fill themselves. There's no auto-grader writing your story for you — only the words you choose to put down, the rules you check off, and the lessons you bother to write."
          />
          <Pillar
            title="Ownership"
            body="Nobody else takes the loss or the discipline. A clean record of your own work is the only thing that lets you change your trading — Nookra just gives that record a quiet place to live."
          />
        </motion.div>

        <motion.p
          variants={fadeUp}
          className="text-[18px] md:text-[20px] leading-[1.5] tracking-[-0.005em] text-white/75 max-w-[600px] mx-auto"
        >
          Nookra doesn&rsquo;t trade for you. It gives you a clean place to record what you did and review it later.
        </motion.p>
      </motion.div>
    </div>
  </section>
)

const Pillar: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <motion.div variants={fadeUp} className="text-center">
    <div className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.14em] mb-2">
      {title}
    </div>
    <p className="text-[13.5px] leading-[1.55] text-white/65">{body}</p>
  </motion.div>
)

export default ManualAccountability
