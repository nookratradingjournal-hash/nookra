// ── Icon primitive ──────────────────────────────────────────────────────────
// Single, enforced entry point for every icon in the app. Wraps lucide-react
// so we get a unified outline icon set with consistent geometry.
//
// RULES (enforced by this component — do NOT bypass by importing lucide
// icons directly elsewhere):
//   • Size: 16px default (chrome, buttons, inline labels). 18px for larger
//     controls. 20px for prominent header icons. 14px for micro / meta.
//     That is the complete size ladder. No 12, 13, 15, 17, 19, 24.
//   • Stroke width: 1.5 everywhere. This is lucide's default and matches
//     macOS SF Symbols' Regular weight at body size. Never 1, 1.4, 1.75, 2.
//   • Style: outline only. No filled variants. No mixing with inline SVGs.
//   • Color: inherits from `currentColor` so callers control hue via
//     text-color classes (`.icon-secondary`, `text-[var(--accent)]`, etc.)
//
// USAGE:
//   import { Icon } from '@/components/ui/Icon'
//   <Icon name="check"   size={16} className="icon-accent" />
//   <Icon name="x"       size={14} className="icon-tertiary" />
//   <Icon name="chevron-right" />
//
// To add a new icon: pick the lucide name (kebab-case — see lucide.dev), add
// the import below and extend the REGISTRY map. Centralised so the set stays
// auditable.

import {
  // Chrome / control
  X,
  Check,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  // Objects
  User,
  Users,
  Shield,
  ShieldCheck,
  Key,
  Clock,
  ShoppingBag,
  Image,
  Camera,
  Laptop,
  Monitor,
  Calendar,
  Settings,
  Search,
  Trash2,
  Pencil,
  Copy,
  ExternalLink,
  Info,
  AlertTriangle,
  CircleHelp,
  // Status
  CircleCheck,
  CircleX,
  Loader,
  type LucideIcon,
} from 'lucide-react'

// ── Registry ────────────────────────────────────────────────────────────────
// kebab-case name → lucide component. Keeps call sites string-based so we
// can grep/audit icon usage without chasing imports across 20 files.
const REGISTRY = {
  // Controls
  'x':               X,
  'check':           Check,
  'plus':            Plus,
  'minus':           Minus,
  'chevron-left':    ChevronLeft,
  'chevron-right':   ChevronRight,
  'chevron-down':    ChevronDown,
  'chevron-up':      ChevronUp,
  'arrow-right':     ArrowRight,
  'arrow-left':      ArrowLeft,

  // Objects
  'user':            User,
  'users':           Users,
  'shield':          Shield,
  'shield-check':    ShieldCheck,
  'key':             Key,
  'clock':           Clock,
  'shopping-bag':    ShoppingBag,
  'image':           Image,
  'camera':          Camera,
  'laptop':          Laptop,
  'monitor':         Monitor,
  'calendar':        Calendar,
  'settings':        Settings,
  'search':          Search,
  'trash':           Trash2,
  'pencil':          Pencil,
  'copy':            Copy,
  'external-link':   ExternalLink,
  'info':            Info,
  'alert-triangle':  AlertTriangle,
  'help-circle':     CircleHelp,

  // Status
  'circle-check':    CircleCheck,
  'circle-x':        CircleX,
  'loader':          Loader,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof REGISTRY

// ── Size ladder ─────────────────────────────────────────────────────────────
// Only these sizes are permitted. Defaults to 16 (the body-line-height-native
// control size). Extend this union carefully — every new size is a design
// system decision, not a per-call override.
export type IconSize = 14 | 16 | 18 | 20

interface IconProps {
  name: IconName
  size?: IconSize
  className?: string
  'aria-hidden'?: boolean
  'aria-label'?: string
}

export function Icon({
  name,
  size = 16,
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: IconProps) {
  const Component = REGISTRY[name]
  return (
    <Component
      size={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden={ariaLabel ? undefined : ariaHidden}
      aria-label={ariaLabel}
      // Prevent browser-default icon baseline offset — keeps icons optically
      // centred inside flex-row buttons and inline labels.
      style={{ flexShrink: 0, display: 'block' }}
    />
  )
}
