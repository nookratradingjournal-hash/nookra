import type { Variants } from 'framer-motion'

// Centralized motion presets. Keep restrained — the site should feel
// confident and calm. No bounces, no overshoots.
//
// Variants are written so each one has BOTH `hidden` and `show` transitions.
// Most fadeUp/fadeIn animations only define a transition on `show`, but with
// re-firing in-view (see IN_VIEW below) we also need a soft transition on
// `hidden` so the exit doesn't snap to invisible — it gently fades back out.
export const EASE = [0.2, 0.8, 0.2, 1] as const

const EXIT = { duration: 0.35, ease: EASE }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14, transition: EXIT },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.55, ease: EASE } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0,        transition: EXIT },
  show:   { opacity: 1,        transition: { duration: 0.6, ease: EASE } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 12, transition: EXIT },
  show:   { opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.7, ease: EASE } },
}

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 24, transition: EXIT },
  show:   { opacity: 1, x: 0,  transition: { duration: 0.6, ease: EASE } },
}

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -24, transition: EXIT },
  show:   { opacity: 1, x: 0,   transition: { duration: 0.6, ease: EASE } },
}

export const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
}

export const staggerFast: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
}

// Default whileInView viewport — triggers when ~20% of the element is visible,
// and re-fires every time the element enters / leaves the viewport. Keeping
// `once: false` lets sections animate back in when the user scrolls UP toward
// them, not just on the first downward pass. The `hidden` variant exits via a
// faster ~0.35s curve (see EXIT above) so the fade-out doesn't drag.
export const IN_VIEW = { once: false, amount: 0.2 } as const
