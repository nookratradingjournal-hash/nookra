// ── Activation Gate ──────────────────────────────────────────────────────────
// Wraps the main app. On launch, checks license status.
// Shows the activation screen when no valid session exists.
// On successful license activation, shows a welcome screen before entering.

import { useState, useEffect, useLayoutEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import { AnimatePresence, motion, type Transition, type Variants } from 'framer-motion'
import { EASE } from '../services/motion/motion'
import {
  checkAccess,
  activateLicense,
  startTrial,
  deactivate,
  getTrialStatus,
  getLicenseInfo,
  setOwnerName,
  getCurrentLicenseKey,
  MAX_DEVICES,
  type LicenseStatus,
  type Session,
} from '../services/licensing/licensingService'
import { getDeviceLabel } from '../services/licensing/device'
import { tutorialFlowFromStatus } from '../services/tutorial/useShouldStartTutorial'
import {
  isTutorialDone,
  markTutorialDone,
  clearTutorialDoneForFlow,
  clearTutorialDoneForKey,
} from '../services/tutorial/tutorialState'
import { getDeviceId } from '../services/licensing/device'
import { FULL_TUTORIAL_STEPS } from '../services/tutorial/steps'
import { useTutorial } from './tutorial/TutorialContext'
import { useAppStore } from '../store/useAppStore'
// Design-system primitives — all chrome icons route through <Icon />.
// Body/label copy uses the semantic text classes (.text-title-sm,
// .text-secondary, .text-tertiary, .text-caption) defined in index.css.
import { Icon, type IconName } from './ui/Icon'
// Shared button primitive — replaces every raw `<button className="activation-cta">`
// so onboarding/activation CTAs live in the same design system as the rest
// of the app (radius, shadow, hover, press, disabled all unified).
import { Button } from './ui/Button'

// ── License Context ──────────────────────────────────────────────────────────

interface LicenseContextValue {
  status: LicenseStatus
  expiresAt: string | null
  deactivate: () => void
  refreshLicense: () => void
}

// ── Panel shell ─────────────────────────────────────────────────────────────
// The activation / loading / name-entry / welcome screens all share one
// container. Every visual property of that container (background, blur,
// border, shadow, light-diffusion overlays) is defined ONCE in index.css
// under the `.alcove-shell` rule + its ::before / ::after pseudo-elements.
//
// Do NOT add inline background / backdrop-filter / box-shadow here. Any such
// inline style would layer on top of the CSS material and break the spec.

function Panel({
  children,
  dragRegion,
  tone,
}: {
  children: ReactNode
  dragRegion?: ReactNode
  // Optional shell tone variant. 'elevated' swaps the shell background to a
  // slightly lighter dark gray — used only on the license-activated /
  // welcome screen for a softer, less-harsh-black feel. Everything else
  // (radius, border, shadow, positioning) stays identical.
  tone?: 'elevated'
}) {
  const shellClass =
    'alcove-shell fixed inset-0 flex flex-col' +
    (tone === 'elevated' ? ' alcove-shell--elevated' : '')
  return (
    <>
      <div className="alcove-environment fixed inset-0" />
      <div className={shellClass}>
        {dragRegion}
        {children}
      </div>
    </>
  )
}

// ── View transition animation ───────────────────────────────────────────────
// Shared "shrink and transition" spec — macOS-style minimize feel. Each top-
// level view (loading / nameEntry / welcome / activation / journal) is a
// motion.div keyed by its phase. AnimatePresence mode="wait" ensures the
// outgoing view completes its exit before the incoming view starts enter,
// eliminating flicker or double-render.
//
// Enter: scale 0.95 → 1, opacity 0 → 1
// Exit:  scale 1 → 0.9, opacity 1 → 0, translateY +6px (slight drop)
//
// Curve is Apple's "snappy ease" cubic-bezier(0.32, 0.72, 0, 1) — quick
// initial acceleration, smooth trailing settle. Duration sits at 300ms which
// lands inside the 250–350ms target band.

// Scene crossfade spec. The literal values (300ms + Apple snappy ease) are
// the motion system's `deliberate` duration and `snappy` easing — pulled
// from the shared module so they stay locked to the rest of the app.
const VIEW_TRANSITION: Transition = {
  duration: 0.3,
  ease: EASE.snappy,
}

const VIEW_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 0 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.9, y: 6 },
}

// Shared wrapper — pins the animated view to the viewport so scaling happens
// around the window's visual center without pushing layout. Children render
// inside exactly as before; only the container animates.
function AnimatedView({
  viewKey,
  children,
}: {
  viewKey: string
  children: ReactNode
}) {
  return (
    <motion.div
      key={viewKey}
      className="fixed inset-0"
      variants={VIEW_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={VIEW_TRANSITION}
      style={{ transformOrigin: 'center center', willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
}

const LicenseContext = createContext<LicenseContextValue>({
  status: 'none',
  expiresAt: null,
  deactivate: () => {},
  refreshLicense: () => {},
})

export function useLicense() {
  return useContext(LicenseContext)
}

// ── Gate Component ───────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
}

export function ActivationGate({ children }: Props) {
  const [status, setStatus] = useState<LicenseStatus | 'loading'>('loading')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [welcomeSession, setWelcomeSession] = useState<Session | null>(null)
  const [nameEntry, setNameEntry] = useState<{ session: Session } | null>(null)
  const [welcomeOwnerName, setWelcomeOwnerName] = useState<string | null>(null)
  const [welcomeMaxDevices, setWelcomeMaxDevices] = useState<number>(MAX_DEVICES)
  const reloadFromStorage = useAppStore((s) => s.reloadFromStorage)

  const refreshLicense = useCallback(() => {
    checkAccess().then((result) => {
      // Trial-scoped data may have just been wiped inside checkAccess()
      // (natural expiration OR admin reset — both surface as 'trialExpired'
      // or 'none' when the cached status was 'trial'). Pull the store back
      // into sync with localStorage so stale trades/balance don't linger in
      // memory into the next trial.
      if (result.status === 'trialExpired' || result.status === 'none') {
        reloadFromStorage()
      }
      setStatus(result.status)
      setExpiresAt(result.expiresAt)
    }).catch(() => {
      // Safety net: if checkAccess() throws unexpectedly, avoid leaving
      // the app stuck on the loading screen. Fall back to 'none' so the
      // user sees the activation screen rather than an infinite spinner.
      setStatus('none')
      setExpiresAt(null)
    })
  }, [reloadFromStorage])

  // Initial check on mount
  useEffect(refreshLicense, [refreshLicense])

  // Re-check when tab becomes visible (catches admin resets in another tab)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLicense()
    }
    const onFocus = () => refreshLicense()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshLicense])

  // Active revalidation while the user is inside the app on a trial or paid
  // license. Catches admin reset / revoke even when the user never switches
  // windows. 60-second cadence is cheap (one RPC) and fast enough that a
  // reset is noticed before the user can log meaningful new data.
  useEffect(() => {
    if (status !== 'trial' && status !== 'active') return
    const id = setInterval(refreshLicense, 60_000)
    return () => clearInterval(id)
  }, [status, refreshLicense])

  // ── Window sizing: compact for locked flow, full for journal ──────────────
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.resizeWindow) return

    const isLocked =
      status === 'loading' || status === 'none' || status === 'trialExpired' || status === 'revoked' || status === 'invalid'
      || nameEntry !== null || welcomeSession !== null

    if (isLocked) {
      document.body.style.background = 'transparent'
      // Per-screen window height so no content is clipped. Each screen has
      // its own natural content height; the window matches it with a small
      // buffer. (CSS / layout untouched — only the IPC height value.)
      //   • Name entry: 500 — icon badge + title + copy + input + button
      //   • Welcome:    540 — certificate + name chip + 2-line message +
      //                       device row + button
      //   • Activation: 560 — title + 3 tab cards + tab content (license
      //                       input OR trial/purchase copy + 3 bullets) +
      //                       recovery link + CTA
      let height = 580
      if (nameEntry !== null) height = 520
      else if (welcomeSession !== null) height = 560
      if (status !== 'loading') {
        api.resizeWindow(420, height, false, false)
      }
    } else {
      document.body.style.background = '#09090b'
      api.resizeWindow(1400, 900, false, true, true)
    }
  }, [status, nameEntry, welcomeSession])

  // Drag region for compact window (no app-header visible during activation)
  const dragRegion = (
    <div
      style={{ WebkitAppRegion: 'drag', position: 'fixed', top: 0, left: 0, right: 0, height: '38px', zIndex: 9999 } as React.CSSProperties}
    />
  )

  // Set by handleDeactivate immediately before it flips status. Consumed by
  // the external-reset effect below to distinguish a user-initiated
  // deactivate (which also transitions to 'none') from an admin key reset
  // (which can ALSO transition to 'none' when validate_session reports that
  // the device/trial row is gone — see licensingService.checkAccess).
  const userDeactivateRef = useRef(false)

  const handleDeactivate = async () => {
    userDeactivateRef.current = true
    await deactivate()
    setStatus('none')
    setExpiresAt(null)
  }

  // ── Last-known active license key ─────────────────────────────────────────
  // Completion is scoped per license key. By the time `checkAccess` reports a
  // rejection the session is ALREADY cleared (licensingService.ts → checkAccess
  // calls clearSession() before returning the rejection status), so reading
  // getCurrentLicenseKey() inside the external-reset effect would return null
  // and there'd be nothing to scope the clear to.
  //
  // To avoid that, we snapshot the license key into this ref while we are
  // still 'active'. A dedicated effect keeps it fresh on every entry into
  // 'active', so the ref always holds the "key the user was most recently
  // on" — exactly the identity we need when detecting a reset of that key.
  const lastLicenseKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (status === 'active') {
      const k = getCurrentLicenseKey()
      if (k) lastLicenseKeyRef.current = k
    }
  }, [status])

  // ── External reset detection ──────────────────────────────────────────────
  // Distinguishes a true admin key-reset from a user-initiated deactivate.
  //
  // Rejection signals from `refreshLicense` → `checkAccess` → `validateSession`
  // can surface as any of: 'revoked' | 'invalid' | 'none'. 'none' is produced
  // when the backing row is gone entirely (admin trial reset deletes the trial
  // row; admin license reset removes this device's activation row so the
  // server no longer recognises the session).
  //
  // User self-deactivate ALSO transitions status to 'none', so 'none' alone
  // is ambiguous. `handleDeactivate` flips `userDeactivateRef` true before
  // calling setStatus; this effect consumes that flag to tell the two apart.
  //
  // When a true external reset is detected, completion is cleared with the
  // RIGHT scope:
  //   • licensed (prev === 'active') → clearTutorialDoneForKey(lastLicenseKey)
  //       Removes only the reset key from the per-key map. Any OTHER key
  //       the user previously onboarded on this device keeps its completion
  //       — so activating a different (already-onboarded) key after this
  //       reset does not re-show the tour.
  //   • trial    (prev === 'trial')  → clearTutorialDoneForFlow('trial')
  //       Trial completion is a single device-scoped flag; no key scope.
  //
  // We also unlatch the mount-guard ref so the next successful activation
  // of the reset key replays the tour.
  //
  // What we deliberately do NOT touch:
  //   • 'trialExpired'  — ambiguous (natural expiry OR admin trial reset);
  //                       treating it as a reset would re-show the tour on
  //                       every natural trial expiration.
  //   • user-initiated 'none' — self-deactivate path; user didn't ask to be
  //                             re-onboarded. Caught via userDeactivateRef.
  //   • 'loading'→anything  — initial boot, not a reset.
  //
  // `hasFiredThisMountRef` is declared here (ahead of the trigger effect) so
  // this effect can unlatch it. Its semantics are documented where it's
  // consumed below.
  const hasFiredThisMountRef = useRef(false)
  const prevStatusRef = useRef<LicenseStatus | 'loading'>('loading')
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    const wasInApp = prev === 'active' || prev === 'trial'
    // Any explicit rejection produced by validateSession. 'none' is included
    // because admin resets can surface through that code path (device row
    // removed / trial row deleted). The user-deactivate case ALSO lands on
    // 'none' but is filtered out below via userDeactivateRef.
    const isRejection = status === 'revoked' || status === 'invalid' || status === 'none'

    if (wasInApp && isRejection) {
      // User-initiated deactivate — consume the flag and preserve completion
      // so reactivating on the same device doesn't nag with the tour again.
      if (userDeactivateRef.current) {
        userDeactivateRef.current = false
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info('[tutorial-gate]', {
            event: 'user_deactivate_detected',
            prev,
            status,
            note: 'tutorial completion preserved',
          })
        }
        return
      }

      if (prev === 'active') {
        // Licensed reset — clear ONLY the key that was active, preserving
        // every other key's completion on this device.
        const resetKey = lastLicenseKeyRef.current
        clearTutorialDoneForKey(resetKey)
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info('[tutorial-gate]', {
            event: 'external_reset_detected',
            prev,
            status,
            flow_cleared: 'licensed',
            key_cleared: resetKey,
          })
        }
      } else {
        // Trial reset — single device-scoped flag, no key scope.
        clearTutorialDoneForFlow('trial')
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info('[tutorial-gate]', {
            event: 'external_reset_detected',
            prev,
            status,
            flow_cleared: 'trial',
          })
        }
      }
      hasFiredThisMountRef.current = false
    }
  }, [status])

  // ── Tutorial trigger ──────────────────────────────────────────────────────
  // Single-effect gate. Runs on every status change, re-reads persistence at
  // fire time, and fires at most once per device per flow.
  //
  // Why the single-effect shape matters (history): the previous version used
  // a hook (`useShouldStartTutorial`) that LATCHED a boolean to `true` the
  // first time the check passed. That boolean was then the only thing the
  // parent effect examined. Because `ActivationGate` does not unmount on
  // deactivate/reactivate (only `children` changes), the latched boolean
  // stayed `true` for the full app session, and every subsequent
  // journal → non-journal → journal transition re-fired the tour without
  // re-consulting localStorage. That is exactly the "shows every time"
  // symptom the user was seeing after deactivate→reactivate.
  //
  // The fix is to consult `isTutorialDone(flow)` fresh on every run, and to
  // scope the "already fired this mount" guard to a local ref. Deactivate
  // preserves the flag (see tutorialState.ts), so the second fire attempt
  // inside the same app session will early-return at the persistence check.
  // A cross-session reopen would skip even earlier — `hasFiredThisMount`
  // starts false on a fresh mount but `isTutorialDone` is already `true`
  // from the previous session's `markTutorialDone`.
  const { start: startTutorial } = useTutorial()
  // `hasFiredThisMountRef` is declared earlier (above the external-reset
  // effect) so that effect can unlatch it after an admin key reset.

  useEffect(() => {
    const isJournal = status === 'active' || status === 'trial'

    // Hard guards are evaluated top-to-bottom. Each one can veto the trigger
    // independently. Persistence is ALWAYS read fresh from localStorage — we
    // never trust an in-memory latched boolean, because ActivationGate
    // persists across deactivate/reactivate without unmounting.
    const flow = tutorialFlowFromStatus(status)
    const licenseActive = status === 'active'

    // Licensed completion is scoped per license key. Read the current key
    // from the cached session at fire time, so brand-new keys activated on
    // a device that ALREADY onboarded some earlier key still trigger the
    // tour (because the map has no entry for the new key).
    const currentLicenseKey = licenseActive ? getCurrentLicenseKey() : null
    const doneLicense = isTutorialDone('licensed', currentLicenseKey)
    const doneTrial = isTutorialDone('trial')
    // "Trial new" = trial flow is running on a device that has not yet been
    // marked trial-tutorial-done. Once we fire, the flag flips and this
    // becomes 'resumed' forever (until the user hits Replay Tutorial).
    const trialState: 'new' | 'resumed' | null =
      flow === 'trial' ? (doneTrial ? 'resumed' : 'new') : null

    const doneForThisFlow =
      flow === 'licensed' ? doneLicense :
      flow === 'trial'    ? doneTrial   :
      true  // no flow → treat as done so nothing fires

    const alreadyFiredThisSession = hasFiredThisMountRef.current

    // Gate decision — ALL must be true to trigger.
    //   1. status is a journal-visible state (active or trial)
    //   2. a flow was resolved
    //   3. THIS flow's persisted completion flag is false (per-key for
    //      licensed; per-device for trial)
    //   4. this mount has not already fired (StrictMode / re-render guard)
    const willTrigger =
      isJournal && flow !== null && !doneForThisFlow && !alreadyFiredThisSession

    // Required debug log — every decision point surfaces here.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[tutorial-gate]', {
        deviceId:                        getDeviceId(),
        status,
        licenseActive,
        flow,
        trialState,
        licenseKey:                      currentLicenseKey,
        tutorial_completed_this_license: doneLicense,
        tutorial_completed_trial:        doneTrial,
        alreadyFiredThisSession,
        tutorial_triggered:              willTrigger,
      })
    }

    if (!willTrigger) return

    // Passed every gate — fire.
    hasFiredThisMountRef.current = true
    // Persist BEFORE starting so a mid-tour quit / deactivate still remembers
    // that the tour was shown on this device for this key / flow.
    if (flow === 'licensed') {
      markTutorialDone('licensed', currentLicenseKey)
    } else if (flow === 'trial') {
      markTutorialDone('trial')
    }

    // Give the journal one paint to mount its targets.
    const t = setTimeout(() => startTutorial(FULL_TUTORIAL_STEPS), 400)
    return () => clearTimeout(t)
  }, [status, startTutorial])

  // Loading
  if (status === 'loading') {
    return (
      <Panel dragRegion={dragRegion}>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-[5px] h-[5px] rounded-full bg-white/30 animate-pulse" />
            <p className="text-overline">Loading</p>
          </div>
        </div>
      </Panel>
    )
  }

  // Name entry — shown for brand-new keys before the welcome screen.
  // Uses the same `tone="elevated"` as the Activation and Welcome panels so
  // the shell background / corner radius / shadow come from the shared
  // Panel variant — not from any local approximation.
  if (nameEntry) {
    return (
      <Panel dragRegion={dragRegion} tone="elevated">
        <NameEntryScreen
          onSave={async (savedName) => {
            const success = await setOwnerName(savedName)
            if (success) {
              setNameEntry(null)
              setWelcomeOwnerName(savedName)
              setWelcomeSession(nameEntry.session)
            }
            return success
          }}
        />
      </Panel>
    )
  }

  // Welcome screen — shown after successful license activation
  if (welcomeSession) {
    return (
      <Panel dragRegion={dragRegion} tone="elevated">
        <WelcomeScreen
          session={welcomeSession}
          ownerName={welcomeOwnerName}
          maxDevices={welcomeMaxDevices}
          onContinue={() => {
            setWelcomeSession(null)
            setWelcomeOwnerName(null)
            setStatus(welcomeSession!.status)
            setExpiresAt(welcomeSession!.expiresAt)
          }}
        />
      </Panel>
    )
  }

  // Gated: needs activation
  if (status === 'none' || status === 'trialExpired' || status === 'revoked' || status === 'invalid') {
    return (
      <Panel dragRegion={dragRegion} tone="elevated">
        <ActivationScreen
          status={status}
          onActivated={(newStatus, newExpiresAt) => {
            setStatus(newStatus)
            setExpiresAt(newExpiresAt)
          }}
          onLicenseSuccess={(session) => {
            // Check if this is a brand-new key (no owner name set)
            getLicenseInfo().then((info) => {
              if (info?.maxDevices) setWelcomeMaxDevices(info.maxDevices)
              if (!info?.ownerName) {
                // Brand new key — ask for name first
                setNameEntry({ session })
              } else {
                // Already claimed — go straight to welcome with existing name
                setWelcomeOwnerName(info.ownerName)
                setWelcomeSession(session)
              }
            }).catch(() => {
              // Network error — skip name entry, go to welcome
              setWelcomeSession(session)
            })
          }}
        />
      </Panel>
    )
  }

  // Passed: active or trial
  return (
    <LicenseContext.Provider value={{ status, expiresAt, deactivate: handleDeactivate, refreshLicense }}>
      {children}
    </LicenseContext.Provider>
  )
}

// ── Name Entry Screen ───────────────────────────────────────────────────────
// Shown once for brand-new keys before the welcome screen. Name is required.

function NameEntryScreen({
  onSave,
}: {
  onSave: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const success = await onSave(name.trim())
    setSaving(false)
    if (!success) setError('Could not save. Please try again.')
  }

  return (
    // ── Exact mirror of ActivationScreen's block structure ────────────────
    // Previous version had a screen-specific icon badge, per-element
    // `text-center` / `leading-relaxed` / `mb-8` / `shrink-0` overrides, and
    // `px-7` on the outer element. None of those appear on the activation
    // screen; they were local approximations that made this view visually
    // inconsistent. The structure below is lifted 1:1 from ActivationScreen
    // (see the `flex-1 flex flex-col justify-center overflow-hidden` root,
    // the `px-7 pt-8 text-center shrink-0` top block, the `px-7 pt-6`
    // content block, and the `px-7 pb-7 pt-6 shrink-0` bottom action block
    // around ActivationScreen lines 1081 / 1083 / 1119 / 1243). Same panel
    // shell (`tone="elevated"`), same `.activation-input`, same
    // `.activation-cta` — no local classes, no local CSS.
    <div className="flex-1 flex flex-col justify-center overflow-hidden">
      {/* ── Top: Icon anchor + title + subtitle ─────────────────────────
              Block padding (`px-7 pt-8 text-center shrink-0`) is the same
              as ActivationScreen's top block. The icon anchor above the
              title reuses the activation system's accent tokens 1:1 — no
              new CSS class is introduced, every value below is a live
              token also used by `.activation-cta`:
                • background/border/glow  →  `var(--accent)`,
                  `var(--accent-border)`, `var(--accent-dim)` (same trio
                  .activation-cta uses, index.css:512-527)
                • radius 14                →  matches the softened-card
                  family (.activation-cta / .activation-input share 14)
                • inner top highlight      →  identical to .activation-cta
                  (`inset 0 1px 0 rgba(255,255,255,0.14)`)
              The anchor's `mb-4` (vs the subtitle's natural `mb-2` from
              the `<h1>`) tightens the icon→title→subtitle trio so they
              read as one visual group — fixing the "empty void" feel
              without changing block structure. */}
      <div className="px-7 pt-8 text-center shrink-0">
        <div
          className="w-14 h-14 mx-auto mb-4 flex items-center justify-center"
          style={{
            borderRadius: 14,
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, white 8%) 0%, var(--accent) 100%)',
            border: '1px solid var(--accent-border)',
            boxShadow:
              'inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 6px 18px var(--accent-dim)',
            // Icon inherits color via `currentColor`; set accent-fg here so
            // the glyph reads correctly against the solid accent fill,
            // matching how .activation-cta pairs var(--accent) bg with
            // var(--accent-fg) text.
            color: 'var(--accent-fg)',
          }}
        >
          <Icon name="user" size={20} />
        </div>
        <h1 className="text-title-sm mb-2">
          Register your license
        </h1>
        <p className="text-secondary mx-auto" style={{ maxWidth: 320 }}>
          What name should this license be registered under?
        </p>
      </div>

      {/* ── Content: input — same THREE-part pattern as the License-tab
              input in ActivationScreen (lines 1121-1184): left icon inside
              `.relative`, `.activation-input`, and inline right-side
              `.activation-input-action` submit button. The right action
              was previously missing, which left the input visually
              "half-dressed" relative to the activation family (the
              `.activation-input` class reserves 40px of right padding for
              it — see index.css line 418). Pulling in that third piece
              reuses the same live component from the activation screen
              rather than approximating the look with an empty slot. */}
      <div className="px-7 pt-6">
        <div className="relative">
          <div
            className="absolute pointer-events-none icon-tertiary"
            style={{
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              lineHeight: 0,
            }}
          >
            <Icon name="user" size={14} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={name}
            // Silent 20-char cap. The native `maxLength` attribute stops
            // further keystrokes/paste once the cap is hit — no counter,
            // no helper text, no visible indicator. The `.slice(0, 20)`
            // in onChange is belt-and-braces for any programmatic input
            // event that bypasses the native guard.
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Your name"
            disabled={saving}
            maxLength={20}
            className="activation-input"
          />
          {/* Inline action — identical component to the License-tab arrow
              (ActivationScreen lines 1154-1167). Shows when the user has
              typed a name; same icon, same class, same spinner. Clicking
              it is equivalent to pressing Enter or the Continue CTA —
              single handleSave path, no separate state machine. */}
          {name.trim().length > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-label="Save name"
              className="activation-input-action"
            >
              {saving
                ? <Icon name="loader" size={14} className="animate-spin" />
                : <Icon name="arrow-right" size={14} />
              }
            </button>
          )}
        </div>
        {error && (
          <p className="text-ui-xs text-negative mt-2 px-1">{error}</p>
        )}
      </div>

      {/* ── Bottom: action button — same region spec (`px-7 pb-7 pt-6
              shrink-0`) as ActivationScreen's CTA block (line 1243).
              The CTA itself is the bare `.activation-cta` class, no
              `mt-*` or `shrink-*` modifiers. */}
      <div className="px-7 pb-7 pt-6 shrink-0">
        {/* Was: raw <button className="activation-cta">. Switched to the
            shared <Button variant="primary" size="lg" block> so this CTA
            now participates in the unified button system (14px radius,
            48px height, upgraded halo shadow, explicit transitions). */}
        <Button
          variant="primary"
          size="lg"
          block
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving\u2026' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

// ── Welcome Screen ──────────────────────────────────────────────────────────
// Shown after successful paid license activation. Creates a premium "moment."

// ── Reveal Timeline ─────────────────────────────────────────────────────────
// Audio: activation-success.mp3 — 4-note ascending chime (2429ms, stereo)
// Played at 0.80x rate → ~3.0s total (tail faded near end).
//
// Beat onsets (measured from waveform at actual sample positions):
//   14ms   ding 1 (first note attack)
//   41ms   ding 2
//   55ms   ding 3
//   86ms   ding 4 (chord/shimmer - new frequencies)
//
// Dead air: 13.9ms before first ding. We seek past it (offset=0.0139s).
//
// Web Audio API with pre-decoded buffer — near-zero decode latency (~0ms).
// At 0.80x rate from offset=0.0139s:
//   Ding 1: (14 - 13.9) / 0.80 ≈  0ms after .start()
//   Ding 2: (41 - 13.9) / 0.80 ≈ 34ms after .start()
//   Ding 3: (55 - 13.9) / 0.80 ≈ 51ms after .start()
//   Ding 4: (86 - 13.9) / 0.80 ≈ 90ms after .start()
//
// Visual pipeline: setTimeout → React render (16ms) → CSS impact (30ms) = ~46ms
// Audio is delayed 46ms so ding 1 lands when the first visual pop impacts.
// Step values unchanged — pop impact lands on the beat.
//
// With 46ms audio delay:
//   Ding 1 audible at ~46ms ≈ step1 visual impact at ~46ms  ✓
//   Ding 2 audible at ~80ms ≈ step2 visual impact at ~101ms (close)  ✓
//   Ding 3 audible at ~97ms ≈ step3 visual impact at ~156ms  ✓
//   Ding 4 audible at ~136ms ≈ step4 visual impact at ~284ms  ✓
//
// Steps 1–4 reveal on the beats. The full chimes + shimmer play uncut.
// Only the quiet decay tail is faded (1800–2200ms), then a 100ms pause,
// then Get Started button + sparkle at 2300ms.
const REVEAL = {
  volume: 0.55,         // audible and satisfying, not blasting
  rate: 0.80,           // 20% slower — bright, snappy
  audioDelay: 0.046,    // 46ms delay to align ding 1 with visual pipeline
  seekOffset: 0.0139,   // skip 13.9ms dead air before first note attack
  step1: 0,             // certificate
  step2: 180,           // name chip
  step3: 380,           // success text
  step4: 600,           // device row
  fadeAt: 1800,         // fade the quiet decay tail (all chimes + shimmer already done)
  fadeDur: 400,         // fade to silence over 400ms
  step5Sound: 2250,     // Get Started sound — 50ms early to compensate audio decode latency
  step5: 2300,          // Get Started button — after fade + 100ms clean pause
} as const

// ── Web Audio API: pre-decoded success chime ────────────────────────────────
// The MP3 is fetched and decoded into an AudioBuffer at module load time.
// Playback uses BufferSourceNode.start() which has near-zero latency
// (the audio is already decoded in memory — no HTMLAudioElement decode delay).

let audioCtx: AudioContext | null = null
let successBuffer: AudioBuffer | null = null
let activeSource: AudioBufferSourceNode | null = null
let activeGain: GainNode | null = null

// Pre-fetch and decode the MP3 into a buffer (doesn't require user gesture)
fetch('./activation-success.mp3')
  .then((res) => res.arrayBuffer())
  .then((buf) => {
    // Create a temporary offline context just for decoding if main context
    // hasn't been created yet (user gesture hasn't happened)
    const ctx = audioCtx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    return ctx.decodeAudioData(buf).then((decoded) => {
      successBuffer = decoded
      // If we created a throwaway context, don't keep it — we'll make a proper
      // one on user gesture. But if audioCtx was already set, this was it.
      if (!audioCtx) ctx.close().catch(() => {})
    })
  })
  .catch(() => {}) // silent fail — audio is a nice-to-have

/** Ensure AudioContext exists and is resumed (call during user gesture). */
function ensureAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/** Re-decode the buffer into the live AudioContext if needed.
 *  The initial decode may have used a throwaway context. */
async function ensureBufferDecoded(ctx: AudioContext): Promise<void> {
  if (successBuffer && successBuffer.sampleRate === ctx.sampleRate) return
  try {
    const res = await fetch('./activation-success.mp3')
    const buf = await res.arrayBuffer()
    successBuffer = await ctx.decodeAudioData(buf)
  } catch {} // silent fail
}

/** Play the success chime via Web Audio API. Near-zero latency thanks to
 *  pre-decoded AudioBuffer. Delays playback by 46ms to align the first ding
 *  attack with the CSS pop animation's visual impact. */
function playDing(): void {
  try {
    if (!audioCtx || !successBuffer) return
    const ctx = audioCtx

    // Create gain node for volume control + fade
    const gain = ctx.createGain()
    gain.gain.value = REVEAL.volume
    gain.connect(ctx.destination)

    // Create buffer source
    const source = ctx.createBufferSource()
    source.buffer = successBuffer
    source.playbackRate.value = REVEAL.rate
    source.connect(gain)

    // Start playback: delay by 46ms, seek past 13.9ms dead air
    source.start(ctx.currentTime + REVEAL.audioDelay, REVEAL.seekOffset)

    // Store refs for fade-out and stop
    activeSource = source
    activeGain = gain

    // Clean up when playback ends naturally
    source.onended = () => {
      if (activeSource === source) {
        activeSource = null
        activeGain = null
      }
    }
  } catch {}
}

/** Smoothly fade the success chime's gain to `target` over `duration` ms.
 *  Uses Web Audio API's linearRampToValueAtTime for glitch-free fading. */
function fadeSuccessAudio(target: number, duration: number): void {
  if (!audioCtx || !activeGain) return
  const ctx = audioCtx
  const gain = activeGain
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(target, ctx.currentTime + duration / 1000)
}

/** Stop the success chime source node. */
function stopSuccessAudio(): void {
  if (activeSource) {
    try { activeSource.stop() } catch {}
    activeSource = null
    activeGain = null
  }
}

/** Play the Get Started button sound — magic appear sparkle.
 *  Uses get-started.mp3 (the uploaded audio file). Seeks to 296ms to capture
 *  the full sparkle attack including the initial tap transient. */
const getStartedAudio = new Audio('./get-started.mp3')
getStartedAudio.preload = 'auto'

function playCompletionTone(): void {
  try {
    getStartedAudio.currentTime = 0.296     // seek to full sparkle attack onset (296ms in file)
    getStartedAudio.volume = 0.5
    getStartedAudio.playbackRate = 1.0
    getStartedAudio.play().catch(() => {})
  } catch {}
}

function CertificateIllustration() {
  // 8-pointed star badge path (center 76,48, outer 11, inner 7)
  const badge = (() => {
    const cx = 76, cy = 48, R = 11, r = 7
    const pts: string[] = []
    for (let i = 0; i < 16; i++) {
      const a = ((i * 22.5 - 90) * Math.PI) / 180
      const rad = i % 2 === 0 ? R : r
      pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`)
    }
    return `M${pts.join('L')}Z`
  })()

  return (
    <svg width="100" height="80" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Card body — cream with thick brown border */}
      <rect x="5" y="5" width="90" height="70" rx="10" fill="#F5EDD8" />
      <rect x="5" y="5" width="90" height="70" rx="10" stroke="#B8A88A" strokeWidth="2.5" />

      {/* Two bold teal header lines */}
      <rect x="16" y="17" width="48" height="5" rx="2.5" fill="var(--accent)" />
      <rect x="16" y="27" width="38" height="5" rx="2.5" fill="var(--accent)" opacity="0.75" />

      {/* Multiple brown/tan text lines */}
      <rect x="16" y="39" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.7" />
      <rect x="16" y="45" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.6" />
      <rect x="16" y="51" width="44" height="3" rx="1.5" fill="#C4B8A0" opacity="0.5" />
      <rect x="16" y="57" width="38" height="3" rx="1.5" fill="#C4B8A0" opacity="0.4" />
      <rect x="16" y="63" width="32" height="3" rx="1.5" fill="#C4B8A0" opacity="0.35" />

      {/* 8-pointed star badge — solid muted brown */}
      <path d={badge} fill="#A8977A" />
    </svg>
  )
}

function WelcomeScreen({
  session,
  ownerName,
  maxDevices: maxDev,
  onContinue,
}: {
  session: Session
  ownerName?: string | null
  maxDevices?: number
  onContinue: () => void
}) {
  // 5 reveal phases synced to audio beats
  // 0=empty, 1=certificate, 2=name chip, 3=message, 4=device row, 5=button
  const [step, setStep] = useState(0)

  // Get Started readiness — gated separately from visibility (step>=5).
  // The button starts its 500ms scale+opacity reveal at REVEAL.step5 (2300ms).
  // It is only intended to be interactive AFTER that reveal completes, so
  // clicks/keyboard must remain blocked for the full 500ms settle window.
  // Enabled at step5 + the button reveal transition duration (500ms).
  const [isGetStartedReady, setIsGetStartedReady] = useState(false)
  const BUTTON_REVEAL_MS = 500

  useLayoutEffect(() => {
    const advance = (to: number) => setStep((prev) => Math.max(prev, to))

    playDing()                                           // main chime — Web Audio API, near-zero latency (46ms delay built in)
    const timers = [
      setTimeout(() => advance(1), REVEAL.step1),      // 0ms — certificate, impact ~46ms ≈ ding 1 at ~46ms
      setTimeout(() => advance(2), REVEAL.step2),      // 55ms — name chip, impact ~101ms ≈ ding 2 at ~80ms
      setTimeout(() => advance(3), REVEAL.step3),      // 110ms — success text, impact ~156ms ≈ ding 3 at ~97ms
      setTimeout(() => advance(4), REVEAL.step4),      // 238ms — device row, impact ~284ms ≈ ding 4 at ~136ms
      setTimeout(() => fadeSuccessAudio(0, REVEAL.fadeDur), REVEAL.fadeAt), // 1800ms — fade decay tail to silence via GainNode
      setTimeout(() => {                               // 2250ms — stop chime, start get-started sound
        stopSuccessAudio()
        playCompletionTone()
      }, REVEAL.step5Sound),
      setTimeout(() => advance(5), REVEAL.step5),      // 2300ms — button appears (audio already decoding)
      // Button becomes interactive only after its reveal animation has
      // actually finished settling (2300 + 500 = 2800ms).
      setTimeout(() => setIsGetStartedReady(true), REVEAL.step5 + BUTTON_REVEAL_MS),
      setTimeout(() => advance(5), 5000),              // failsafe
    ]

    return () => timers.forEach(clearTimeout)
  }, [])

  const deviceLabel = getDeviceLabel()
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)'               // smooth decel (Get Started)
  const popEase = 'cubic-bezier(0.22, 1.06, 0.36, 1)'        // gentle overshoot — controlled, premium
  const pop = (visible: boolean) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'scale(1)' : 'scale(0.6)',
    transition: `opacity 100ms ease-out, transform 150ms ${popEase}`,
  })
  const slide = (visible: boolean) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.7)',
    transition: `opacity 100ms ease-out, transform 150ms ${popEase}`,
  })

  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-10">
        {/* Beat 1: Certificate */}
        <div className="mb-7 shrink-0" style={pop(step >= 1)}>
          <CertificateIllustration />
        </div>

        {/* Beat 2: Name chip — 20px accent tile + unified check icon */}
        <div
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mb-7 shrink-0"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.06)',
            ...pop(step >= 2),
          }}
        >
          <div className="w-5 h-5 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Icon name="check" size={14} className="text-white" />
          </div>
          <span className="text-ui-base font-medium text-white/85">{ownerName || deviceLabel}</span>
        </div>

        {/* Beat 3: Success message — title-sm tier, primary text */}
        <div className="shrink-0" style={slide(step >= 3)}>
          <p className="text-title-sm font-medium text-center leading-relaxed mb-1" style={{ color: 'var(--text-primary)' }}>
            Your license has been activated.
          </p>
          <p className="text-title-sm font-medium text-center leading-relaxed mb-8" style={{ color: 'var(--text-primary)' }}>
            You're all set to proceed.
          </p>
        </div>

        {/* Beat 4: Device usage — 16px monitor icon, 6px gap, caption tier */}
        <div className="flex items-center gap-1.5 mb-8 shrink-0" style={slide(step >= 4)}>
          <Icon name="monitor" size={16} className="icon-quaternary" />
          <span className="text-caption">Used 1/{maxDev ?? MAX_DEVICES} devices</span>
        </div>

        {/* Beat 5: Button — grand arrival.
            Visibility is driven by step>=5 (opacity + scale). Interactivity is
            a SEPARATE gate: `isGetStartedReady` flips true only after the
            500ms reveal transition has finished settling. Before that:
              • disabled={true} blocks React onClick AND keyboard (Space/Enter)
              • pointerEvents:'none' on the wrapper kills any stray hover/click
              • tabIndex={-1} + aria-hidden keep it out of focus order
              • cursor stays 'default' so it doesn't look clickable yet
            After ready: all restored to normal interactive behavior. */}
        <div className="w-full shrink-0" style={{
          opacity: step >= 5 ? 1 : 0,
          transform: step >= 5 ? 'scale(1)' : 'scale(0.82)',
          transition: `opacity 500ms ${ease}, transform 500ms ${ease}`,
          pointerEvents: isGetStartedReady ? 'auto' : 'none',
        }}>
          {/* Was: raw <button> with a pile of inline styles and its own
              radius/height/shadow. Now uses the shared <Button> so this
              welcome-screen CTA inherits the same premium primary look
              as every other CTA in the app. */}
          <Button
            variant="primary"
            size="lg"
            block
            onClick={onContinue}
            disabled={!isGetStartedReady}
            tabIndex={isGetStartedReady ? 0 : -1}
            aria-hidden={!isGetStartedReady}
            style={{ cursor: isGetStartedReady ? 'pointer' : 'default' }}
          >
            Get Started
          </Button>
        </div>
    </div>
  )
}

// ── Activation Screen ────────────────────────────────────────────────────────

type ActivationTab = 'license' | 'trial' | 'purchase'

function ActivationScreen({
  status,
  onActivated,
  onLicenseSuccess,
}: {
  status: LicenseStatus
  onActivated: (status: LicenseStatus, expiresAt: string | null) => void
  onLicenseSuccess: (session: Session) => void
}) {
  const [tab, setTab] = useState<ActivationTab>('license')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Two-step license flow:
  //   1. User types the key → arrow appears on the right of the input.
  //   2. User clicks the arrow → `handleValidate` calls the licensing
  //      service. On success we store the resulting session and flip
  //      `validated` to true. The input becomes read-only, the arrow is
  //      replaced with a permanent shield-check confirmed icon, and the
  //      main "Activate License" CTA enables. Clicking the CTA then
  //      proceeds with the stored session (no second activation call).
  //   3. Once `validated` is true, there is NO UI path to toggle it back
  //      off. The confirmed icon has no onClick handler; the input is
  //      `readOnly`. A future explicit reset path would need to be added
  //      deliberately (e.g. a dedicated "change license" button).
  const [validated, setValidated] = useState(false)
  const [validatedSession, setValidatedSession] = useState<Session | null>(null)
  const reloadFromStorage = useAppStore((s) => s.reloadFromStorage)

  // Trial status from server (async)
  const [trialStatus, setTrialStatus] = useState<{
    used: boolean; active: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchStatus = () => {
      getTrialStatus().then((s) => {
        if (!cancelled) setTrialStatus(s)
      }).catch(() => {})
    }
    fetchStatus()
    // Re-fetch on window focus / visibility so "Resume Free Trial" flips to
    // "Start Free Trial" immediately after an admin reset in another window,
    // without forcing the user to reload.
    const onFocus = () => fetchStatus()
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStatus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Arrow click — actually validates/activates the license on the server.
  // Success → lock input + store session; user still needs to click the
  // main CTA to proceed.
  const handleValidate = async () => {
    if (!key.trim() || busy || validated) return
    setBusy(true)
    setError(null)

    // Unlock audio while we have user-gesture context.
    // Web Audio API: create/resume AudioContext (must happen during user gesture).
    // Also re-decode the buffer into the live context if the initial decode
    // used a throwaway offline context.
    const ctx = ensureAudioContext()
    ensureBufferDecoded(ctx)
    // HTMLAudioElement unlock for get-started sound (kept as-is)
    getStartedAudio.volume = 0
    getStartedAudio.play()
      .then(() => { getStartedAudio.pause(); getStartedAudio.currentTime = 0 })
      .catch(() => {})

    try {
      const result = await activateLicense(key.trim())
      if (result.success && result.session) {
        setValidatedSession(result.session)
        setValidated(true)
        setBusy(false)
      } else {
        setBusy(false)
        setError(result.error ?? 'Activation failed')
      }
    } catch {
      setBusy(false)
      setError('Connection failed. Please try again.')
    }
  }

  // CTA click — only reachable when `validated` is true. The license was
  // already activated during `handleValidate`, so here we just transition
  // the app to the next screen using the stored session.
  const handleActivate = () => {
    if (!validated || !validatedSession || busy) return
    reloadFromStorage()
    onLicenseSuccess(validatedSession)
  }

  const handleTrial = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await startTrial()
      setBusy(false)
      if (result.success && result.session) {
        reloadFromStorage()
        // Trials skip the welcome screen — enter directly
        onActivated(result.session.status, result.session.expiresAt)
      } else {
        setError(result.error ?? 'Could not start trial')
      }
    } catch {
      setBusy(false)
      setError('Connection failed. Please try again.')
    }
  }

  const isExpired = status === 'trialExpired'
  const canTrial = trialStatus
    ? trialStatus.active || (!isExpired && !trialStatus.used)
    : !isExpired
  const isResume = trialStatus?.active && trialStatus?.used

  // Subtitle copy comes straight from the macOS Setup Assistant playbook —
  // each row needs one short line explaining what the choice does. Without
  // subtitles "License vs Purchase" is genuinely ambiguous to a first-time
  // visitor.
  const tabs: { id: ActivationTab; label: string; sub: string }[] = [
    { id: 'license',  label: 'License',  sub: 'Enter a paid activation key' },
    { id: 'trial',    label: 'Trial',    sub: 'Try free for 1 day' },
    { id: 'purchase', label: 'Purchase', sub: 'Open the purchase page' },
  ]

  // Tab icons — monochrome (single tone), no per-tab color identity.
  // The selected row carries the only color signal: a subtle teal fill
  // behind the whole row plus the icon flipping to teal-300.
  const tabIcons: Record<ActivationTab, IconName> = {
    license:  'shield-check',
    trial:    'clock',
    purchase: 'key',
  }

  return (
    <div className="flex-1 flex flex-col justify-center overflow-hidden">
      {/* ── Top: Title + subtitle — app's semantic type tokens ──────────── */}
      <div className="px-7 pt-8 text-center shrink-0">
        <h1 className="text-title-sm mb-2">
          Activate Nookra
        </h1>
        <p className="text-secondary mx-auto" style={{ maxWidth: 320 }}>
          Choose how you&rsquo;d like to activate Nookra and get started.
        </p>
      </div>

      {/* ── Middle: vertical method picker (Setup-Assistant style) ─────────
           Replaces the older 3-up horizontal card grid. Apple's setup
           flows stack consequential decisions vertically with monochrome
           icons + title + subtitle + chevron — no per-option color
           coding. The selected row is the only colored thing; everything
           else stays neutral. */}
      <div className="px-7 pt-7 shrink-0">
        <div className="tab-list">
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setError(null) }}
                className={`tab-card${active ? ' tab-card--active' : ''}`}
                data-tab={t.id}
                type="button"
              >
                <div className="tab-chip">
                  <Icon name={tabIcons[t.id]} size={18} />
                </div>
                <div className="tab-card__text">
                  <span className="tab-card__label">{t.label}</span>
                  <span className="tab-card__sub">{t.sub}</span>
                </div>
                <div className="tab-card__chevron">
                  <Icon name="chevron-right" size={14} />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Content section (per tab) ──────────────────────────────────── */}
      <div className="px-7 pt-6">

        {tab === 'license' && (
          <div>
            <div className="relative">
              <div
                className="absolute pointer-events-none icon-tertiary"
                style={{
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  lineHeight: 0,
                }}
              >
                <Icon name="key" size={14} />
              </div>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  // Enter-to-validate while typing; Enter after lock is
                  // a no-op so the user can't accidentally re-activate.
                  if (!validated) handleValidate()
                }}
                placeholder="License Key"
                disabled={busy}
                readOnly={validated}
                className={`activation-input${validated ? ' activation-input--locked' : ''}`}
              />

              {/* Right-side inline action — arrow while typing, check once
                  validated. Clicking the check resets validation so the
                  user can edit the key again (explicit reset path). */}
              {!validated && key.trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={busy}
                  aria-label="Validate license key"
                  className="activation-input-action"
                >
                  {busy
                    ? <Icon name="loader" size={14} className="animate-spin" />
                    : <Icon name="arrow-right" size={14} />
                  }
                </button>
              )}
              {validated && (
                // Post-validation: permanent confirmed state. The button is
                // still a <button> (so hover / focus styles are preserved
                // and it stays keyboard-focusable as an indicator), but it
                // has NO onClick handler — clicking does nothing. The
                // validated flag cannot be toggled off from the UI.
                <button
                  type="button"
                  aria-label="License key validated"
                  aria-disabled="true"
                  title="License key validated"
                  className="activation-input-action activation-input-action--success"
                >
                  <Icon name="shield-check" size={14} />
                </button>
              )}
            </div>
            {error && (
              <p className="text-ui-xs text-negative mt-2 px-1">{error}</p>
            )}
          </div>
        )}

        {tab === 'trial' && (
          canTrial ? (
            <div>
              <p className="text-secondary text-center leading-relaxed">
                {isResume
                  ? 'Your trial is still active. Pick up where you left off.'
                  : 'Full access for 24 hours. No payment or setup required.'}
              </p>
              <div className="flex flex-col gap-1.5 mt-4">
                {['Full feature access', 'No payment required', 'Instant activation'].map((b) => (
                  <div key={b} className="flex items-center gap-1.5">
                    <Icon name="check" size={14} className="icon-accent" />
                    <span className="text-tertiary">{b}</span>
                  </div>
                ))}
              </div>
              {error && (
                <p className="text-caption mt-3 text-center text-negative">{error}</p>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="text-tertiary leading-relaxed">
                Your free trial has been used on this device. Enter a license key to continue.
              </p>
            </div>
          )
        )}

        {tab === 'purchase' && (
          <div>
            <p className="text-secondary text-center leading-relaxed">
              One-time purchase. Lifetime usage. No subscription.
            </p>
            <div className="flex flex-col gap-1.5 mt-4">
              {[
                'Activate on up to 2 devices',
                'Lifetime updates included',
                'No recurring fees',
              ].map((b) => (
                <div key={b} className="flex items-center gap-1.5">
                  <Icon name="check" size={14} className="icon-accent" />
                  <span className="text-tertiary">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Bottom: recovery link + action button ──────────────────────── */}
      <div className="px-7 pb-7 pt-6 shrink-0">
        {tab === 'license' && (
          <div
            className="flex items-center justify-center"
            style={{ gap: 6, marginBottom: 20 }}
          >
            <Icon name="help-circle" size={14} className="icon-tertiary" />
            <span className="text-tertiary" style={{ fontSize: 13 }}>Lost your license?</span>
            <button
              type="button"
              className="activation-recover-link"
              onClick={(e) => e.preventDefault()}
            >
              Recover license.
            </button>
          </div>
        )}

        {tab === 'license' && (() => {
          // CTA only enables after the two-step flow: user validated the
          // key via the inline arrow → `validated` is true. Text in the
          // input alone is NOT enough.
          const enabled = !busy && validated
          return (
            <Button
              variant="primary"
              size="lg"
              block
              onClick={handleActivate}
              disabled={!enabled}
            >
              {busy ? 'Activating\u2026' : 'Activate License'}
            </Button>
          )
        })()}

        {tab === 'trial' && canTrial && (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={handleTrial}
            disabled={busy}
          >
            {busy
              ? (isResume ? 'Resuming\u2026' : 'Starting\u2026')
              : isResume ? 'Resume Free Trial' : 'Start 24-Hour Free Trial'}
          </Button>
        )}

        {tab === 'purchase' && (
          <Button variant="primary" size="lg" block disabled>
            Purchase (Coming Soon)
          </Button>
        )}
      </div>
    </div>
  )
}
