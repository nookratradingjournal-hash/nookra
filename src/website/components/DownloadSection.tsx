import React from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, IN_VIEW } from '../motion'
import { AppleIcon, WindowsIcon, ArrowRightIcon } from '../Icons'

// Download URLs.
//
// The DMG (114 MB) is too large to bundle into the marketing site, so it
// lives on GitHub Releases — free, supports files up to 2 GB, gives you a
// download counter for free. After publishing the v1.0.0 release on GitHub,
// replace `nookratradingjournal-hash` and `<your-repo>` below with the actual
// values. The URL pattern is:
//   https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>
const MAC_URL: string =
  'https://github.com/nookratradingjournal-hash/nookra/releases/download/v1.0.0/Nookra.dmg'

// Windows is in private beta; setting WINDOWS_URL to a non-null string when
// the Windows installer ships will activate the Windows download card
// automatically.
const WINDOWS_URL: string | null = null

export const DownloadSection: React.FC = () => (
  <section id="download" className="relative py-24 lg:py-32 nk-bg-section-alt">
    <div className="nk-container">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="max-w-[720px] mx-auto text-center mb-10"
      >
        <motion.h2 variants={fadeUp} className="nk-t-h1 nk-text-primary mb-4">
          Get Nookra on your machine.
        </motion.h2>
        <motion.p variants={fadeUp} className="nk-t-body-lg">
          Mac-native today. Windows in private beta. 1-day free trial on every download — no card required up front.
        </motion.p>
      </motion.div>

      {/* Visible pricing card. $20 one-time matches the licensing service's
          single-tier pricing; the trial / refund / no-subscription line
          mirrors the rest of the site. */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={fadeUp}
        className="max-w-[440px] mx-auto text-center mb-10"
      >
        <div className="inline-flex items-baseline gap-2 px-6 py-4 rounded-2xl border border-white/[0.10] bg-white/[0.025]">
          <span className="text-[42px] font-bold tabular-nums tracking-tight text-white leading-none">$20</span>
          <span className="text-[14px] text-white/55">one-time</span>
        </div>
        <div className="mt-4 text-[12.5px] text-white/55 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>1-day free trial</span>
          <span className="text-white/20">·</span>
          <span>30-day refund window</span>
          <span className="text-white/20">·</span>
          <span>No subscription</span>
        </div>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={stagger}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[820px] mx-auto"
      >
        <DownloadCard
          Icon={AppleIcon}
          platform="macOS"
          tagline="13.0 or later · Apple Silicon"
          size="114 MB"
          href={MAC_URL}
          available
        />
        <DownloadCard
          Icon={WindowsIcon}
          platform="Windows"
          tagline="10 · 11 · x64"
          size="In private beta"
          href={WINDOWS_URL}
          available={!!WINDOWS_URL}
        />
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={fadeUp}
        className="flex flex-wrap items-center justify-center gap-3 mt-10"
      >
        <a href={MAC_URL} download className="nk-btn nk-btn-secondary">
          <span>Start free trial</span>
          <ArrowRightIcon size={14} />
        </a>
        <a href="#" className="nk-btn nk-btn-ghost nk-btn-sm" aria-disabled="true">
          <span>Buy a license</span>
        </a>
      </motion.div>

      <motion.p
        initial="hidden"
        whileInView="show"
        viewport={IN_VIEW}
        variants={fadeUp}
        className="text-center text-[12px] text-white/40 mt-6"
      >
        Version 1.0 · Last updated April 2026
      </motion.p>
    </div>
  </section>
)

const DownloadCard: React.FC<{
  Icon: React.FC<any>
  platform: string
  tagline: string
  size: string
  href: string | null
  available: boolean
}> = ({ Icon, platform, tagline, size, href, available }) => {
  const interactive = available && !!href
  const Component: React.ElementType = interactive ? 'a' : 'div'
  return (
    <Component
      href={interactive ? href! : undefined}
      download={interactive ? '' : undefined}
      aria-disabled={!interactive}
      className={
        'group flex items-center gap-4 p-5 md:p-6 rounded-2xl border transition-all duration-200 ' +
        (interactive
          ? 'bg-white/[0.03] border-white/[0.10] hover:border-[rgba(175,194,212,0.45)] hover:bg-white/[0.05] hover:-translate-y-[2px] cursor-pointer'
          : 'bg-white/[0.02] border-white/[0.06] cursor-default')
      }
    >
      <div
        className={
          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ' +
          (interactive
            ? 'bg-white/[0.05] border-white/[0.10] text-white group-hover:text-[#D6E6F4] group-hover:border-[rgba(175,194,212,0.35)]'
            : 'bg-white/[0.02] border-white/[0.06] text-white/40')
        }
      >
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={'text-[15px] font-semibold tracking-tight ' + (interactive ? 'text-white' : 'text-white/60')}>
            {/* Inactive title is just the platform name — the right-hand
                "Status / In private beta" column carries the meaning, so
                a "Coming soon" suffix here is redundant and reads as a
                placeholder when it shouldn't. */}
            {interactive ? `Download for ${platform}` : platform}
          </span>
        </div>
        <div className="text-[12px] text-white/45 mt-0.5">{tagline}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={'text-[11px] uppercase tracking-[0.08em] font-semibold ' + (interactive ? 'text-white/40' : 'text-white/28')}>
          {interactive ? 'Size' : 'Status'}
        </div>
        <div className={'text-[12.5px] font-medium mt-0.5 ' + (interactive ? 'text-white/75' : 'text-white/50')}>
          {size}
        </div>
      </div>
    </Component>
  )
}

export default DownloadSection
