// ── Button primitive ────────────────────────────────────────────────────────
// Canonical button for the entire app. Enforces one visual language across
// onboarding, settings, modals, admin, and the main journal.
//
//   • Radius      — 12px `rounded-control` (matches input-field / chip system)
//   • Heights     — fixed 28 / 34 / 40 px, so adjacent buttons + inputs align
//   • Icon gap    — 6px (gap-1.5), matching macOS control spacing
//   • Transitions — EXPLICIT property list, 150ms ease-out. Never `transition-all`.
//   • Focus       — accent-coloured focus-visible ring (keyboard accessible)
//   • Disabled    — opacity 40, identical size, pointer events off
//
// Size ladder (fixed heights so buttons align across rows):
//   sm — 28px tall — text-ui-sm  (11px) — inline/secondary actions
//   md — 34px tall — text-ui-base(13px) — default CTA
//   lg — 40px tall — text-ui-md  (14px) — prominent primary action
//
// Variants (only these five — no one-off button styles elsewhere):
//   primary   — solid accent fill with soft highlight + accent-dim glow.
//               Used for: Continue, Activate, Save Trade, Get Started.
//   secondary — surface-resting fill, hairline border. Neutral prominence.
//   ghost     — transparent, reveals surface-hover on hover. Inline actions.
//   outline   — hairline border, transparent fill. Cancel / dismiss.
//   danger    — red-tinted ghost (close / destructive).
//
// ICONS: pass a `leadingIcon` / `trailingIcon` (IconName from Icon.tsx) to
// get the correct 14px/16px sizing for the chosen button size.

import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: Variant
  size?: Size
  leadingIcon?: IconName
  trailingIcon?: IconName
  /** True for full-width (e.g. modal footers). */
  block?: boolean
  children?: ReactNode
}

// Icon sizes scale to the button size — avoids icons that look oversized
// inside sm buttons or undersized inside lg.
const ICON_SIZE: Record<Size, 14 | 16> = {
  sm: 14,
  md: 16,
  lg: 16,
}

// Height + horizontal padding + base text class per size tier. Numbers chosen
// so baseline aligns with adjacent inputs at the same tier.
const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-7  px-3   text-ui-sm',    // 28px
  md: 'h-[34px] px-3.5 text-ui-base', // 34px
  lg: 'h-10 px-4   text-ui-md',    // 40px
}

// The explicit transition string — same for every variant so hover/press feel
// identical. Properties are listed so NO layout property (width / height /
// margin) can accidentally ride the tween if a consumer adds a hover-size
// change. Dur = 150ms, curve = ease-out (Apple-style decel) — matches the
// motion-system `DURATION.quick` token.
const BTN_TRANSITION =
  'transition-[transform,background-color,border-color,color,opacity,box-shadow,filter] ' +
  'duration-150 ease-out'

// Focus-visible ring — same across every variant. 2px accent-tinted ring +
// 1px dark offset so it reads on both light and dark surfaces. Only shows
// for keyboard users (focus-visible), never on mouse click.
const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] ' +
  'focus-visible:ring-[color:var(--accent)]'

export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  block,
  className,
  style,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isPrimary = variant === 'primary'

  // The primary style drives the accent background + inset top-highlight +
  // soft accent-dim glow from runtime CSS variables (user-chosen accent).
  // Other variants use tokenised Tailwind utilities.
  const primaryStyle: CSSProperties = isPrimary
    ? {
        // Gradient fill — 92% accent at top blended with 10% white → solid
        // accent at bottom. Reads as a lit surface, not a flat rectangle.
        background:
          'linear-gradient(180deg,' +
          ' color-mix(in srgb, var(--accent) 92%, white 10%) 0%,' +
          ' var(--accent) 100%)',
        color: 'var(--accent-fg)',
        borderColor: 'var(--accent-border)',
        // Quad shadow layers for crisp material depth (NOT blurry glow):
        //   (1) top inset highlight — "lit from above"
        //   (2) bottom inset shade — subtle rim
        //   (3) ambient accent halo
        //   (4) contact shadow (dark, very short) for grounding
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.22),' +
          'inset 0 -1px 0 rgba(0,0,0,0.14),' +
          '0 6px 20px -6px var(--accent-dim),' +
          '0 2px 4px -2px rgba(0,0,0,0.35)',
        ...style,
      }
    : style ?? {}

  return (
    <button
      {...props}
      disabled={disabled}
      style={primaryStyle}
      className={clsx(
        // Shared base — layout, typography, radius, transitions, focus
        'inline-flex items-center justify-center gap-1.5',
        'font-medium rounded-xl select-none whitespace-nowrap',
        'border',                     // keeps border width stable across variants
        BTN_TRANSITION,
        FOCUS_RING,
        // Press scale — applied to every non-disabled variant uniformly so
        // tactile feedback is consistent app-wide.
        'active:scale-[0.98]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'disabled:active:scale-100',   // no press on disabled
        SIZE_CLASSES[size],
        block && 'w-full',

        // Variant palettes — hover only brightens/tints, never resizes.
        variant === 'primary' &&
          // Filled accent CTA — brightness bump + small lift.
          'hover:brightness-[1.12] hover:-translate-y-[2px] active:brightness-[0.96]',
        variant === 'secondary' &&
          // Clean lit-up — brighter edge + small lift + soft contact
          // shadow + inset top highlight. No colored halo.
          'bg-[rgba(30,30,36,0.72)] border-[color:var(--edge-strong)] text-primary ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.28)] ' +
          'hover:bg-[rgba(48,48,58,0.92)] hover:border-white/[0.22] hover:-translate-y-[2px] ' +
          'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_16px_-4px_rgba(0,0,0,0.55)]',
        variant === 'ghost' &&
          // Visible fill + brighter text.
          'bg-transparent border-transparent text-secondary ' +
          'hover:bg-white/[0.08] hover:text-primary',
        variant === 'outline' &&
          // Brighter edge + small lift + soft contact shadow + inset highlight.
          'bg-surface-resting border-[color:var(--edge-strong)] text-primary ' +
          'hover:border-white/[0.22] hover:bg-white/[0.05] hover:-translate-y-[2px] ' +
          'hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]',
        variant === 'danger' &&
          // Distinguishable destructive — red icon + red-tinted edge +
          // faint red fill. No halo. Reads as different from neutral
          // buttons without being loud.
          'bg-transparent border-transparent text-tertiary ' +
          'hover:text-negative hover:border-[rgba(239,68,68,0.28)] hover:bg-negative-soft-dim',

        className
      )}
    >
      {leadingIcon && <Icon name={leadingIcon} size={ICON_SIZE[size]} aria-hidden />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={ICON_SIZE[size]} aria-hidden />}
    </button>
  )
}

// ── Icon-only button ────────────────────────────────────────────────────────
// Square button sized to the control ladder, centred icon, no label. Use for
// close buttons, nav arrows, ghost toggles.
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  icon: IconName
  size?: Size
  variant?: Variant
  'aria-label': string
}

const ICON_BUTTON_SIZE: Record<Size, string> = {
  sm: 'h-7  w-7',
  md: 'h-8  w-8',
  lg: 'h-9  w-9',
}

export function IconButton({
  icon,
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  const isPrimary = variant === 'primary'
  const primaryStyle: CSSProperties | undefined = isPrimary
    ? {
        background: 'var(--accent)',
        color: 'var(--accent-fg)',
        borderColor: 'var(--accent-border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px var(--accent-dim)',
      }
    : undefined

  return (
    <button
      {...props}
      style={primaryStyle}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl select-none border',
        BTN_TRANSITION,
        FOCUS_RING,
        'active:scale-[0.96]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'disabled:active:scale-100',
        ICON_BUTTON_SIZE[size],
        variant === 'primary' &&
          'hover:brightness-[1.12] active:brightness-[0.96]',
        variant === 'secondary' &&
          'bg-surface-hover border-edge-strong text-primary ' +
          'hover:bg-surface-active hover:border-white/[0.22] ' +
          'hover:shadow-[0_4px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.10)]',
        variant === 'ghost' &&
          'bg-transparent border-transparent text-tertiary ' +
          'hover:bg-white/[0.08] hover:text-primary',
        variant === 'outline' &&
          'bg-transparent border-edge-strong text-secondary ' +
          'hover:border-white/[0.22] hover:bg-white/[0.05] ' +
          'hover:shadow-[0_4px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.10)]',
        variant === 'danger' &&
          // Distinguishable destructive — red icon + red-tinted edge +
          // faint red fill. No halo.
          'bg-transparent border-transparent text-tertiary ' +
          'hover:text-negative hover:border-[rgba(239,68,68,0.28)] hover:bg-negative-soft-dim',
        className
      )}
    >
      <Icon name={icon} size={ICON_SIZE[size]} aria-label={props['aria-label']} aria-hidden={false} />
    </button>
  )
}
