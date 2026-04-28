import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW, EASE } from '../motion'
import { ChevronDownIcon } from '../Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config'

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Does Nookra guarantee profitability?',
    a: 'No. No journal, tool, or app can do that — anyone who tells you otherwise is selling something. Nookra is a quiet place to record what you did and review it later. The trading decisions, the discipline, and the results are still yours.',
  },
  {
    q: 'Why manual trade entry?',
    a: 'Because typing the trade slows you down enough to remember it. Auto-import skips the part of journaling that actually matters: facing what you did, why you did it, and whether it lined up with the rules you wrote for yourself. Manual entry takes a few seconds and pays back across every review.',
  },
  {
    q: 'What can I record on each trade?',
    a: 'Instrument, direction, entry, stop, target, and P&L — plus the supporting context: setup, strategy, session, the reason you entered, what you did right, what you did wrong, what to improve, your emotional state before and during, whether you followed your rules, and any screenshots you want to attach. Everything is optional; fill in the parts that help you review.',
  },
  {
    q: 'Is the preview real data?',
    a: 'No. The preview above is a sandboxed mock running real Nookra components against demo trades — the numbers reset on every page refresh. Your actual trades only ever live in the desktop app, on your Mac.',
  },
  {
    q: 'Is my data private and local?',
    a: 'Yes. Trades, notes, and screenshots stay in your local app data folder by default. There is no required account, no cloud sync, no telemetry, no analytics SDK, and no third-party with access to your journal. You can export everything to JSON or CSV any time you want a backup.',
  },
  {
    q: 'Does Nookra support Mac and Windows?',
    a: 'Nookra is Mac-native today, built for Apple Silicon on macOS 13 or later. A Windows build is in private beta — when it ships, the Windows card on the download section will become active.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — Nookra is free for one day after you download it. That\u2019s long enough to log a session, review it the next morning, and decide if it earns a place in your routine. No card required up front; a license is a one-time $20 purchase, with a 30-day refund window.',
  },
  {
    q: 'How many devices can I use my license on?',
    a: 'Up to 2 personal devices. If you replace a Mac, deactivate the old device in Settings → License before activating the new one — that frees the slot up immediately.',
  },
  {
    q: 'Who is Nookra for?',
    a: 'Traders who already have a process and want a clean, private place to record and review their work. Beginners can absolutely use it — but Nookra doesn\u2019t teach trading. The decisions, the rules, and the lessons are yours to write.',
  },
  {
    q: 'Does Nookra grade or score my trades?',
    a: 'There is an optional Day Grade widget that combines your day\u2019s P&L with how often you ticked your own checklist items — useful as a glanceable signal, never a judgment. Beyond that, the app does not score, rate, or analyze your trades. The review is yours to do.',
  },
  {
    q: 'Can I export my journal?',
    a: 'Yes. Settings → Data has one-click export to JSON (lossless, for backup) or CSV (for spreadsheets). Import is also there if you want to move a backup onto another machine. Nothing about the data is locked inside the app.',
  },
]

export const FAQ: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="relative py-24 lg:py-32">
      <div className="nk-container">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.4fr] gap-12 lg:gap-20">
          <motion.div initial="hidden" whileInView="show" viewport={IN_VIEW} variants={stagger}>
            <motion.span variants={fadeUp} className="nk-eyebrow mb-5">
              <span className="nk-eyebrow-dot" />
              Questions
            </motion.span>
            <motion.h2 variants={fadeUp} className="nk-t-h1 nk-text-primary mb-4">
              Still deciding?
            </motion.h2>
            <motion.p variants={fadeUp} className="nk-t-body-lg mb-4">
              Honest answers to what most traders ask before they download.
            </motion.p>
            <motion.p variants={fadeUp} className="nk-t-caption">
              Need something else? Email{' '}
              <a href={SUPPORT_MAILTO} className="text-white/70 hover:text-white underline underline-offset-4 decoration-white/20 hover:decoration-[#AFC2D4]/60 transition-colors">
                {SUPPORT_EMAIL}
              </a>
              .
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={IN_VIEW} variants={stagger}>
            {FAQS.map((f, i) => {
              const isOpen = open === i
              return (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="nk-faq-item"
                  data-open={isOpen}
                >
                  <button
                    type="button"
                    className="nk-faq-trigger"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                  >
                    <span>{f.q}</span>
                    <span className="nk-faq-chevron" aria-hidden>
                      <ChevronDownIcon size={18} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-a-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: EASE }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="nk-faq-answer">{f.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default FAQ
