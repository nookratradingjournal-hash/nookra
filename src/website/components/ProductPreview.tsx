import React, { useRef } from 'react'
// useReducedMotion + useScroll + useTransform power the subtle parallax
// drift on the preview card. The hooks honor prefers-reduced-motion so
// the card sits still for users who opt out of motion.
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { fadeUp, IN_VIEW, stagger } from '../motion'
import AppPreview from '../mockups/AppPreview'

export const ProductPreview: React.FC = () => {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  // Subtle parallax — preview drifts up gently as the user scrolls past.
  // Honors prefers-reduced-motion.
  const parallaxY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [30, -30])
  return (
  <section ref={ref} id="preview" className="relative py-24 lg:py-32 overflow-hidden">
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 1000px 440px at 50% 40%, rgba(203,213,225,0.04) 0%, transparent 62%)',
      }}
    />

    <div className="nk-container relative z-10">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="text-center max-w-[720px] mx-auto mb-14 lg:mb-16"
      >
        <motion.span variants={fadeUp} className="nk-eyebrow mb-5 nk-no-select">
          <span className="nk-eyebrow-dot" />
          The workspace
        </motion.span>
        <motion.h2 variants={fadeUp} className="nk-t-h1 nk-text-primary mb-4">
          The whole journal, on one screen.
        </motion.h2>
        <motion.p variants={fadeUp} className="nk-t-body-lg max-w-[600px] mx-auto">
          Equity at the top. Your routine in the middle. A monthly calendar of every trading day. Recent trades below. Customizable widgets on the rails. Everything you need to review the work, nothing you have to chase.
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 }}
        className="relative mx-auto max-w-[1240px]"
      >
        <div
          aria-hidden
          className="absolute -inset-12 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(175,194,212,0.13) 0%, rgba(175,194,212,0.04) 40%, transparent 72%), radial-gradient(ellipse 60% 50% at 50% 90%, rgba(216,208,191,0.04) 0%, transparent 65%)',
            filter: 'blur(10px)',
          }}
        />
        <motion.div className="relative" style={{ y: parallaxY }}>
          <AppPreview />
        </motion.div>
      </motion.div>
    </div>
  </section>
  )
}

export default ProductPreview
