import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW } from '../motion'

/**
 * Trust strip — sits between the product preview and the "Typed by hand"
 * section. Three plain truths about Nookra's architecture, framed as
 * differentiators rather than apologies. All claims are verifiable in the
 * actual Electron app: no login, no cloud sync, manual entry by design.
 */
const ITEMS = [
  {
    label: 'No accounts',
    body: 'No login, no invitation, no waitlist. Download Nookra and you\u2019re working in seconds — your trades belong to your Mac, not to a server somewhere.',
  },
  {
    label: 'No cloud',
    body: 'Every trade, screenshot, and note stays on your machine by default. Local-first, fully offline, yours to back up however you already back up your work.',
  },
  {
    label: 'No auto-import',
    body: 'Nothing pulls from your broker. You type each trade in yourself — slowly enough to remember the price, the rule, and what you saw before you clicked.',
  },
]

export const TrustStrip: React.FC = () => (
  <section className="relative py-14 lg:py-16 border-y border-white/[0.06] nk-bg-section-frost">
    <div className="nk-container relative z-10">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="grid grid-cols-1 md:grid-cols-3 gap-y-10 md:gap-x-10 max-w-[1000px] mx-auto"
      >
        {ITEMS.map(item => (
          <motion.div key={item.label} variants={fadeUp} className="text-center md:text-left">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#AFC2D4] mb-2">
              {item.label}
            </div>
            <p className="text-[13.5px] leading-[1.6] text-white/62 max-w-[300px] mx-auto md:mx-0">
              {item.body}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
)

export default TrustStrip
