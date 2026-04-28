// MUST be the first import — installs an in-memory localStorage shim BEFORE
// any transitively-loaded store module can read real localStorage.
// See src/website/storage-sandbox.ts.
import './website/storage-sandbox'

import React from 'react'
import ReactDOM from 'react-dom/client'
import WebsiteApp from './website/App'
import './website/website.css'

// Scroll-progress CSS variables — installed at module scope so the ambient
// background system runs even if a child component crashes during render.
// rAF-throttled passive listener; honors prefers-reduced-motion via the CSS
// fallback rules in website.css. Two variables are written to documentElement:
//   --nk-scroll    raw scroll progress, 0..1
//   --nk-vignette  precomputed vignette opacity (max(0, p - 0.55) * 2.2,
//                  clamped to 1). Done in JS because Chromium's calc()/max()
//                  folding for unitless custom properties has been historically
//                  unreliable — easier to ship the math here.
{
  let raf = 0
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    const v = Math.min(1, Math.max(0, (p - 0.55) * 2.2))
    const root = document.documentElement.style
    root.setProperty('--nk-scroll', p.toFixed(4))
    root.setProperty('--nk-vignette', v.toFixed(4))
    raf = 0
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
  // Run once synchronously so the variables are set even if rAF is paused
  // (some headless preview tools don't tick rAF until the page is visible).
  // Run again after layout settles so scrollHeight is accurate.
  update()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(update)
  window.addEventListener('load', update, { once: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebsiteApp />
  </React.StrictMode>
)
