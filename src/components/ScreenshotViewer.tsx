import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface ScreenshotViewerProps {
  screenshots: string[]
  initialIdx: number
  onClose: () => void
}

export function ScreenshotViewer({ screenshots, initialIdx, onClose }: ScreenshotViewerProps) {
  const [idx, setIdx] = useState(initialIdx)
  // mounted drives the enter animation — flipped to true after first paint
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Animate out then call onClose. The timer is tracked so it can be
  // cancelled if the component unmounts mid-close — otherwise the callback
  // fires on a stale closure after the parent has already torn down.
  const closeTimerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])
  const close = useCallback(() => {
    setMounted(false)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      onClose()
    }, 160)
  }, [onClose])

  const prev = useCallback(() =>
    setIdx((i) => (i - 1 + screenshots.length) % screenshots.length),
    [screenshots.length],
  )
  const next = useCallback(() =>
    setIdx((i) => (i + 1) % screenshots.length),
    [screenshots.length],
  )

  // Keyboard: ESC = close, ←/→ = navigate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      close()
      else if (e.key === 'ArrowLeft')  prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close, prev, next])

  const src = screenshots[idx]
  const count = screenshots.length

  return createPortal(
    <div
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 160ms ease' }}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/[0.92]"
      onClick={close}
    >
      {/* ── Image ── */}
      <img
        key={src}
        src={src}
        alt={`Screenshot ${idx + 1} of ${count}`}
        draggable={false}
        style={{
          maxWidth: '90vw',
          maxHeight: '86vh',
          transform: mounted ? 'scale(1)' : 'scale(0.96)',
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="rounded-xl object-contain shadow-2xl select-none"
        onClick={(e) => e.stopPropagation()}
      />

      {/* ── Top bar: counter + download + close ── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Counter */}
        <span className="pointer-events-auto text-xs font-medium text-white/40 tabular-nums select-none">
          {count > 1 ? `${idx + 1} / ${count}` : ''}
        </span>

        {/* Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Download */}
          <a
            href={src}
            download={`screenshot-${idx + 1}.jpg`}
            title="Download image"
            onClick={(e) => e.stopPropagation()}
            className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-white/50 hover:text-white transition-all duration-150"
          >
            <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
              <path d="M6.5 1v9M3 7l3.5 3.5L10 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 12h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </a>
          {/* Close */}
          <button
            type="button"
            title="Close (Esc)"
            onClick={close}
            className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-white/50 hover:text-white transition-all duration-150"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1L10 10M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Navigation arrows ── */}
      {count > 1 && (
        <>
          <button
            type="button"
            title="Previous (←)"
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/50 hover:text-white transition-all duration-150"
          >
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
              <path d="M8 1L1.5 7.5L8 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            title="Next (→)"
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/50 hover:text-white transition-all duration-150"
          >
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
              <path d="M1 1L7.5 7.5L1 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      )}

      {/* ── Dot indicators (multiple images) ── */}
      {count > 1 && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {screenshots.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx(i) }}
              className="transition-all duration-150"
              style={{
                width: i === idx ? 16 : 6,
                height: 6,
                borderRadius: 3,
                background: i === idx ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
