import React from 'react'

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const NookraMark: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className} aria-hidden>
    <defs>
      <linearGradient id="nk-mark" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        {/* Carbon Ice silver gradient — matches the desktop app's brand
            accent. Was emerald before; switched so the website mark and
            the in-app accent read as the same product. */}
        <stop stopColor="#D6E6F4" />
        <stop offset="1" stopColor="#AFC2D4" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="26" height="26" rx="8" fill="#0b0b0d" stroke="rgba(255,255,255,0.08)" />
    <path d="M7 19 L11.5 13 L14.5 16 L21 9" stroke="url(#nk-mark)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="21" cy="9" r="1.7" fill="url(#nk-mark)" />
  </svg>
)

export const JournalIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3Z"/><path d="M4 17h15"/><path d="M8 8h7"/><path d="M8 12h5"/></svg>
)

export const ChecklistIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><path d="m4 7 2 2 3-3"/><path d="m4 14 2 2 3-3"/><path d="M13 8h7"/><path d="M13 15h7"/></svg>
)

export const ChartIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><path d="M4 20V5"/><path d="M4 20h16"/><path d="M7 15l4-5 3 3 5-7"/></svg>
)

export const WidgetsIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>
)

export const CalendarIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>
)

export const LockIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
)

export const ArrowRightIcon: React.FC<IconProps> = ({ size = 16, ...p }) => (
  <svg {...base(size)} {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
)

export const ChevronDownIcon: React.FC<IconProps> = ({ size = 18, ...p }) => (
  <svg {...base(size)} {...p}><path d="m6 9 6 6 6-6"/></svg>
)

export const AppleIcon: React.FC<IconProps> = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
)

export const WindowsIcon: React.FC<IconProps> = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M3 5.5 11 4v7.5H3zM12 3.85 21 2.5V12h-9zM3 12.5h8V20L3 18.5zM12 12.5h9V21l-9-1.35z"/>
  </svg>
)

export const MenuIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>
)

export const CloseIcon: React.FC<IconProps> = ({ size = 22, ...p }) => (
  <svg {...base(size)} {...p}><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>
)
