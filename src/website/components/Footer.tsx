import React, { useEffect, useState } from 'react'
import { NookraMark } from '../Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config'

// Footer link data. Each row is either an anchor (href starts with `#` or
// `mailto:`) or a `doc` reference that opens an in-page modal with the
// matching content from DOCS below. Doc-backed links used to be dead
// `href="#"` placeholders that scrolled to the top of the page — now they
// open a real, scrollable, dismissible dialog so the footer feels finished.
type FooterLink =
  | { label: string; href: string }
  | { label: string; doc: DocKey }

type DocKey = 'release-notes' | 'privacy' | 'terms' | 'license'

const COLUMNS: Array<{ label: string; items: FooterLink[] }> = [
  {
    label: 'Product',
    items: [
      { label: 'Features',   href: '#features' },
      { label: 'Discipline', href: '#discipline' },
      { label: 'Preview',    href: '#preview' },
      { label: 'Download',   href: '#download' },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'FAQ',           href: '#faq' },
      { label: 'Contact',       href: SUPPORT_MAILTO },
      { label: 'Release notes', doc: 'release-notes' },
    ],
  },
  {
    label: 'Legal',
    items: [
      { label: 'Privacy', doc: 'privacy' },
      { label: 'Terms',   doc: 'terms' },
      { label: 'License', doc: 'license' },
    ],
  },
]

// Doc copy. Plain-English v1.0 launch text — short enough to read in the
// modal without scrolling much, accurate to what the desktop app actually
// does. If anything in the app's behavior changes (new network calls,
// different refund window, license terms shift), update these strings.
const DOCS: Record<DocKey, { title: string; eyebrow: string; body: string[] }> = {
  'release-notes': {
    title: 'Release notes',
    eyebrow: 'What\u2019s new',
    body: [
      'Version 1.0 — initial public release.',
      'Manual trade entry with notes, screenshots, rules-followed, emotion fields, and per-strategy routines.',
      'Local-first storage. No account required, no cloud sync, no auto-import.',
      'Calendar heatmap, hero stats, recent trades, and customizable widget rails on each side of the workspace.',
      '1-day free trial included on every download. One-time $20 license afterwards.',
      'Future v1.x release notes will appear in the desktop app\u2019s What\u2019s New panel.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    eyebrow: 'What stays on your machine',
    body: [
      `Nookra is a desktop trading journal that runs on your Mac. Your trades, notes, screenshots, checklists, and settings are stored in the app\u2019s local data folder on your computer. They never leave your device. There is no cloud sync, no analytics SDK, and no telemetry watching how you use the app.`,
      `The app does talk to one server — our Supabase backend — for two things only: license/trial validation and release-note fetching. When you activate a license or start a trial, we receive your license key (or trial token) and a random device UUID the app generates on first launch. That UUID lets us enforce the device limit on a license; it is not derived from your hardware and is not tied to your name or email. When the app checks for new release notes, it fetches the public updates list from the same backend. None of your trade data is ever included in either request.`,
      `If you email support at ${SUPPORT_EMAIL}, we read what you wrote and reply. That correspondence stays in our inbox — we don\u2019t publish it, sell it, or share it.`,
      `We do not sell, share, or trade your data with anyone. We do not run ads. We do not embed analytics or session-replay tools in the desktop app or on this marketing site.`,
      `To remove your local data, use Settings → Data → Reset all data inside the app, or delete the Nookra app data folder. To deactivate a device under your license, use Settings → License.`,
      `This policy applies to Nookra v1.0. If anything material changes, the in-app What\u2019s New panel will say so. Questions: ${SUPPORT_EMAIL}.`,
    ],
  },
  terms: {
    title: 'Terms of Use',
    eyebrow: 'What you\u2019re agreeing to',
    body: [
      `Nookra is a journaling and review tool. It is not a trading-signal service, a broker, or a financial advisor. The app does not predict the market, generate trade ideas, or guarantee outcomes — every trading decision recorded in your journal is yours.`,
      `You are responsible for the trades you log and the conclusions you draw from them. Past results in your journal — yours or anyone else\u2019s — are not a forecast of future returns. Nothing in the app should be read as a recommendation to take or close a position.`,
      `Nookra is provided as-is. We do our best to ship clean software, but bugs happen. We are not liable for trading losses or for data loss inside the app. Please back up regularly using Settings → Data → Export.`,
      `A license lets you install Nookra on up to 2 personal devices. You may not redistribute the binary, share your license key publicly, or repackage the app.`,
      `The 1-day free trial ends when the trial window expires. Continuing to use the app afterwards requires a license, which is a one-time $20 purchase.`,
      `We may revoke a license that is being misused (key sharing, attempts to bypass the device limit, or fraudulent payment). When we can, we\u2019ll notify you by email first.`,
      `If anything material in these terms changes, the in-app What\u2019s New panel will say so. Questions: ${SUPPORT_EMAIL}.`,
    ],
  },
  license: {
    title: 'License Agreement',
    eyebrow: 'What you\u2019re buying',
    body: [
      `A Nookra license is a one-time $20 purchase that unlocks the desktop app for personal use after the 1-day free trial ends. There is no subscription and no recurring charge.`,
      `One license covers up to 2 personal devices. If you replace a Mac, deactivate the old device in Settings → License before activating the new one.`,
      `A 30-day refund window applies to every license. Email ${SUPPORT_EMAIL} from the address you used to buy and we\u2019ll review the request. If a refund is approved, the license may be disabled and future activations may be blocked.`,
      `The license is for personal use. You may not redistribute or resell the app binary, share your license key publicly, or use the app as the back end of a paid trading-signal or trade-copying service for other people.`,
      `Nookra is provided as-is. We make no warranties about fitness for any particular purpose, and we are not liable for trading losses or for data loss inside the app. Use Settings → Data → Export to back up regularly.`,
      `Questions about your license: ${SUPPORT_EMAIL}.`,
    ],
  },
}

export const Footer: React.FC = () => {
  const [openDoc, setOpenDoc] = useState<DocKey | null>(null)

  // Esc closes the modal and we restore body scroll lock when it shuts.
  useEffect(() => {
    if (!openDoc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDoc(null) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [openDoc])

  return (
    <footer className="relative border-t border-white/[0.06] pt-16 pb-10 overflow-hidden">
      {/* Footer wordmark — bg-clip-text gradient that fades to transparent at
          the bottom and bleeds off the page edge. */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 bottom-[-60px] select-none pointer-events-none"
        style={{
          fontSize: 'clamp(120px, 22vw, 260px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0) 80%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        Nookra
      </div>

      <div className="nk-container relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <NookraMark size={24} />
              <span className="text-[15px] font-semibold tracking-tight text-white/92">Nookra</span>
            </div>
            <p className="text-[13px] leading-[1.55] text-white/50 max-w-[240px]">
              A quiet desktop journal for disciplined traders.
            </p>
          </div>

          {COLUMNS.map(g => (
            <div key={g.label}>
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold mb-3">{g.label}</div>
              <ul className="space-y-2">
                {g.items.map(it => (
                  <li key={it.label}>
                    {'href' in it ? (
                      <a
                        href={it.href}
                        className="text-[13.5px] text-white/65 hover:text-white transition-colors"
                      >
                        {it.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenDoc(it.doc)}
                        className="text-[13.5px] text-white/65 hover:text-white transition-colors text-left bg-transparent border-0 p-0 cursor-pointer"
                      >
                        {it.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-white/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="text-[12px] text-white/40">© 2026 Nookra. All rights reserved.</div>
          <div className="text-[12px] text-white/40">Made for Mac · Built for discipline</div>
        </div>
      </div>

      {openDoc && <DocModal doc={DOCS[openDoc]} onClose={() => setOpenDoc(null)} />}
    </footer>
  )
}

const DocModal: React.FC<{
  doc: typeof DOCS[DocKey]
  onClose: () => void
}> = ({ doc, onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={doc.title}
    className="fixed inset-0 z-[200] flex items-center justify-center p-4"
  >
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
    />
    <div
      className="relative w-full max-w-[560px] max-h-[80vh] overflow-y-auto rounded-2xl border border-white/[0.10] bg-[#0E1114] shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between px-7 pt-6 pb-3 border-b border-white/[0.06] sticky top-0 bg-[#0E1114]">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-white/40 mb-1">
            {doc.eyebrow}
          </div>
          <h3 className="text-[20px] font-semibold tracking-tight text-white">{doc.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-4 -mr-2 -mt-1 w-8 h-8 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-7 py-6 space-y-4">
        {doc.body.map((p, i) => (
          <p key={i} className="text-[14px] leading-[1.65] text-white/70">{p}</p>
        ))}
      </div>
    </div>
  </div>
)

export default Footer
