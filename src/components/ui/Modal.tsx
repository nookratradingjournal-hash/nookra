// ── Modal ────────────────────────────────────────────────────────────────────
// Shared modal primitive. Every `AddTradeModal`, confirmation dialog, etc.
// routes through here so one set of entrance/exit animations applies to
// every dialog in the product.
//
// Motion spec comes from `services/motion/motion.ts`:
//   • Backdrop  — 180ms opacity fade (BACKDROP_VARIANTS)
//   • Panel     — 220ms scale-fade from 0.96 → 1 (MODAL_VARIANTS)
//   • Easing    — Apple snappy cubic-bezier(0.32, 0.72, 0, 1)
//
// Using AnimatePresence (mode="wait" is deliberately OFF so the backdrop
// and panel animate in tandem) gives us a proper exit animation when
// `open` flips to false — the previous version simply unmounted with
// `if (!open) return null`, which made dismiss feel abrupt.

import { useEffect } from 'react'
import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MODAL_TRANSITION, MODAL_VARIANTS,
  BACKDROP_TRANSITION, BACKDROP_VARIANTS,
} from '../../services/motion/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: string
  /** Extra classes appended to the panel chrome (border/radius/bg overrides).
   *  Optional — default shell behaviour is unchanged for every other modal. */
  panelClassName?: string
}

// Shared className for the small "×" close button in drawer/modal headers.
// Kept in sync across the app so close-control geometry stays consistent.
// Note: AdminPanel uses a slightly larger variant (w-8 h-8 rounded-xl) on
// purpose — that one is intentionally NOT migrated to this constant.
export const CLOSE_BTN_CLASS =
  'close-hover w-7 h-7 rounded-md flex items-center justify-center text-white/25'

export function Modal({ open, onClose, children, width = 'max-w-lg', panelClassName }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — separate motion layer so it can clear slightly ahead
              of the panel on exit, avoiding the "stuck dim" feel. */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={onClose}
            variants={BACKDROP_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BACKDROP_TRANSITION}
          />
          {/* Panel — scale-fade from 0.96 → 1 on enter, gentle 0.98 settle
              on exit. transformOrigin center keeps the scale anchored to
              the visual centre of the dialog. */}
          <motion.div
            className={clsx(
              'relative z-10 w-full modal-panel border rounded-2xl shadow-2xl',
              width,
              panelClassName,
            )}
            style={{
              transformOrigin: 'center center',
              willChange: 'transform, opacity',
            }}
            variants={MODAL_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={MODAL_TRANSITION}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
