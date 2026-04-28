import React, { useEffect, useState } from 'react'
import { NookraMark, MenuIcon, CloseIcon, AppleIcon } from '../Icons'

const LINKS = [
  { href: '#preview',    label: 'Preview' },
  { href: '#features',   label: 'Features' },
  { href: '#discipline', label: 'Discipline' },
  { href: '#faq',        label: 'FAQ' },
]

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    // rAF-throttled so a fast scroll doesn't fire setState 60+ times per
    // frame on weak devices. Uses a closure-captured `raf` flag, the same
    // pattern as the global scroll-progress listener in website-entry.tsx.
    let raf = 0
    let last = false
    const tick = () => {
      const next = window.scrollY > 24
      if (next !== last) { setScrolled(next); last = next }
      raf = 0
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <a
        href="#preview"
        className="fixed top-2 left-2 z-[120] -translate-y-20 focus:translate-y-0 transition-transform bg-white/10 text-white px-3 py-2 rounded-lg text-sm"
      >
        Skip to content
      </a>

      <header
        className={
          'fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ' +
          (scrolled
            ? 'backdrop-blur-xl bg-[rgba(9,9,11,0.72)] border-b border-white/[0.06]'
            : 'backdrop-blur-md bg-transparent border-b border-transparent')
        }
      >
        <div className="nk-container flex items-center justify-between h-[62px]">
          <div className="flex items-center gap-2 nk-no-select">
            <a href="#top" className="flex items-center gap-2.5" aria-label="Nookra home">
              <NookraMark size={26} />
              <span className="text-[15px] font-semibold tracking-tight text-white/95">Nookra</span>
            </a>
            {/* Version badge. Static — release notes live in the desktop
                app's What's New panel and in the Footer "Release notes"
                modal, not on a separate /changelog page. */}
            <span
              className="ml-1 text-[10px] font-semibold tracking-[0.06em] text-white/40 px-1.5 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.02] select-none"
              title="Version 1.0"
            >
              v1.0
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="px-3.5 py-2 text-[13.5px] text-white/65 hover:text-white transition-colors rounded-lg hover:bg-white/[0.04]"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a href="#download" className="nk-btn nk-btn-primary nk-btn-sm">
              <AppleIcon size={13} />
              <span>Download</span>
            </a>
            <button
              type="button"
              className="md:hidden nk-btn nk-btn-ghost nk-btn-sm"
              onClick={() => setMenu(m => !m)}
              aria-label="Toggle menu"
              aria-expanded={menu}
            >
              {menu ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>

        {menu && (
          <div className="md:hidden border-t border-white/[0.06] bg-[rgba(9,9,11,0.95)] backdrop-blur-xl">
            <nav className="nk-container py-3 flex flex-col gap-1" aria-label="Mobile primary">
              {LINKS.map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenu(false)}
                  className="px-3 py-2.5 text-[14px] text-white/75 hover:text-white rounded-lg hover:bg-white/[0.04]"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </header>
    </>
  )
}

export default Navbar
