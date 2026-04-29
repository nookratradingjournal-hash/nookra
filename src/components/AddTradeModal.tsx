import { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { Modal, CLOSE_BTN_CLASS } from './ui/Modal'
import { Button } from './ui/Button'
import { TagSelect } from './TagSelect'
import { ScreenshotViewer } from './ScreenshotViewer'
import { Trade, TradeScreenshot, Side, Outcome } from '../types'
import { fmtDateLong } from '../utils/dates'
import type { DemoScript, DemoFormField } from '../services/tutorial/actions'

// Which step each scriptable field lives on. Used by the tutorial demo
// autofill to switch steps at the right moment so the user visually sees
// the transition happen. Kept here (next to the form) so it stays in sync
// if a field ever moves between steps.
const FIELD_STEP: Record<DemoFormField['key'], 1 | 2> = {
  instrument: 1, side: 1, entry: 1, stopLoss: 1, takeProfit: 1,
  result: 1, outcome: 1, setupType: 1, strategy: 1, session: 1,
  reasonForEntry: 2, followedRules: 2,
  emotionBefore: 2, emotionDuring: 2,
  didRight: 2, didWrong: 2, improve: 2,
}

interface AddTradeModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (trade: Trade) => void
  defaultDate: string
  initialTrade?: Trade | null
  sessionOptions: string[]
  emotionOptions: string[]
  setupTypeOptions: string[]
  strategyOptions: string[]
  /** Default strategy to prefill when creating a NEW trade. Comes from the
   *  currently selected pre-trade checklist strategy. Existing trades use
   *  their own stored strategy instead. */
  defaultStrategy?: string
  onAddSession: (v: string) => void
  onAddEmotion: (v: string) => void
  onAddSetupType: (v: string) => void
  onRemoveSession?: (v: string) => void
  onRemoveEmotion?: (v: string) => void
  onRemoveSetupType?: (v: string) => void
  /** Tutorial-only: when provided alongside `open`, the modal typewriter-fills
   *  the listed fields, advances from step 1 → step 2 at the boundary, then
   *  auto-submits. Flow through `onSubmit` is unchanged — the app-level
   *  safeAddTrade guard still decides whether to persist. */
  demoScript?: DemoScript | null
}

type FormData = {
  instrument: string
  side: Side
  entry: string
  stopLoss: string
  takeProfit: string
  result: string
  outcome: Outcome | null
  setupType: string
  strategy: string
  session: string
  reasonForEntry: string
  followedRules: boolean | null
  emotionBefore: string
  emotionDuring: string
  didRight: string
  didWrong: string
  improve: string
  screenshots: TradeScreenshot[]
}

const DEFAULT: FormData = {
  instrument: '', side: 'long', entry: '', stopLoss: '', takeProfit: '',
  result: '', outcome: null, setupType: '', strategy: '', session: '',
  reasonForEntry: '', followedRules: null,
  emotionBefore: '', emotionDuring: '',
  didRight: '', didWrong: '', improve: '',
  screenshots: [],
}

// Allowed image MIME types
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// Shared inactive-state class for segmented/choice buttons in this form
// (Outcome, Rules, Side). Applied in the `!isSelected` clsx branch.
const UNSELECTED_BTN_CLASS =
  'bg-white/[0.03] border-white/[0.07] text-white/25 hover:border-white/15 hover:text-white/50 hover:bg-white/[0.05]'

/**
 * Read a file as a base64 data URL using FileReader.
 * Zero processing — the original bytes and format are preserved exactly.
 * This is used as the "original" source for the fullscreen viewer.
 */
async function readOriginal(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Generate a small thumbnail via canvas.
 * Max 800 px wide (2× the ~480 px modal width for retina sharpness).
 * Encoded as WebP at quality 0.88 — WebP handles sharp edges and text
 * much better than JPEG at the same file size.
 * Falls back to PNG automatically if the browser doesn't support WebP toDataURL.
 */
async function generateThumb(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const THUMB_W = 800
      const scale = Math.min(1, THUMB_W / img.naturalWidth)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/webp', 0.88))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }
    img.src = url
  })
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {title && <p className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.1em]">{title}</p>}
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.08em]">{label}</label>
      {children}
    </div>
  )
}

const OUTCOME_DISABLED_REASON: Partial<Record<Outcome, string>> = {
  win:       'P&L must be positive for a win',
  loss:      'P&L must be negative for a loss',
  breakeven: 'P&L must be zero for breakeven',
}

function OutcomeSelector({
  value,
  onChange,
  disabledOutcomes = new Set<Outcome>(),
}: {
  value: Outcome | null
  onChange: (v: Outcome) => void
  disabledOutcomes?: Set<Outcome>
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {([['win', 'Win'], ['loss', 'Loss'], ['breakeven', 'Break Even']] as [Outcome, string][]).map(([v, label]) => {
        const isDisabled = disabledOutcomes.has(v)
        const isSelected = value === v
        return (
          <button
            key={v}
            type="button"
            disabled={isDisabled}
            onClick={isDisabled ? undefined : () => onChange(v)}
            title={isDisabled ? OUTCOME_DISABLED_REASON[v] : undefined}
            className={clsx(
              'py-2.5 rounded-xl text-sm font-semibold border transition-all duration-150',
              isDisabled
                ? 'opacity-30 cursor-not-allowed bg-white/[0.02] border-white/[0.05] text-white/20'
                : 'cursor-pointer',
              !isDisabled && isSelected && v === 'win'       && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/[0.22]',
              !isDisabled && isSelected && v === 'loss'      && 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/[0.22]',
              !isDisabled && isSelected && v === 'breakeven' && 'bg-white/8 border-white/20 text-white hover:bg-white/[0.13]',
              !isDisabled && !isSelected && UNSELECTED_BTN_CLASS,
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function RulesSelector({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {([true, false] as const).map((v) => {
        const isFollowedActive = value === v && v === true
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            style={
              isFollowedActive
                ? {
                    backgroundColor: 'var(--accent-dim)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--accent)',
                  }
                : undefined
            }
            className={clsx(
              'py-2 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer',
              isFollowedActive && 'hover:brightness-110',
              value === v && v === false && 'bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/[0.18]',
              value !== v && UNSELECTED_BTN_CLASS,
            )}
          >
            {v ? '✓ Followed' : '✗ Broke rules'}
          </button>
        )
      })}
    </div>
  )
}

export function AddTradeModal({
  open, onClose, onSubmit, defaultDate, initialTrade,
  sessionOptions, emotionOptions, setupTypeOptions, strategyOptions, defaultStrategy,
  onAddSession, onAddEmotion, onAddSetupType,
  onRemoveSession, onRemoveEmotion, onRemoveSetupType,
  demoScript,
}: AddTradeModalProps) {
  const [form, setForm] = useState<FormData>(DEFAULT)
  const [step, setStep] = useState<1 | 2>(1)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pre-fill form when editing an existing trade
  useEffect(() => {
    if (open) {
      if (initialTrade) {
        setForm({
          instrument: initialTrade.instrument,
          side: initialTrade.side,
          entry: initialTrade.entry ? String(initialTrade.entry) : '',
          stopLoss: initialTrade.stopLoss ? String(initialTrade.stopLoss) : '',
          takeProfit: initialTrade.takeProfit ? String(initialTrade.takeProfit) : '',
          result: initialTrade.result !== undefined ? String(initialTrade.result) : '',
          outcome: initialTrade.outcome,
          setupType: initialTrade.setupType,
          strategy: initialTrade.strategy ?? '',
          session: initialTrade.session,
          reasonForEntry: initialTrade.reasonForEntry,
          followedRules: initialTrade.followedRules,
          emotionBefore: initialTrade.emotionBefore,
          emotionDuring: initialTrade.emotionDuring,
          didRight: initialTrade.didRight,
          didWrong: initialTrade.didWrong,
          improve: initialTrade.improve,
          screenshots: initialTrade.screenshots ?? [],
        })
      } else {
        // New trade: pre-fill strategy from the active pre-trade checklist
        // strategy. User can still override via the strategy field in step 1.
        // Exception — when a tutorial `demoScript` is driving the modal, we
        // leave strategy blank so the demo's own `strategy` script field can
        // visibly fill it and make the auto-wire-up between the checklist
        // switcher and Add Trade obvious to the viewer.
        setForm({
          ...DEFAULT,
          strategy: demoScript ? '' : (defaultStrategy ?? ''),
        })
      }
      setStep(1)
    }
  }, [open, initialTrade, defaultStrategy, demoScript])

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  // ── Tutorial demo autofill ───────────────────────────────────────────────
  // When the behavioral tutorial opens this modal with a `demoScript`, it
  // wants to put on a show: typewriter-fill step 1, transition to step 2,
  // typewriter-fill reflections, then submit. We keep the real submit path
  // (onSubmit → safeAddTrade) so the tutorial's guard rails still apply —
  // the trade never hits localStorage, it lands in the transient slot.
  //
  // Refs here avoid stale closures when the demo runs across multiple
  // renders, and let us cancel the in-flight sequence cleanly if the user
  // escapes the tutorial mid-typing.
  const handleSubmitRef = useRef<() => void>(() => {})
  const stepRef = useRef<1 | 2>(1)
  useEffect(() => { stepRef.current = step }, [step])

  useEffect(() => {
    if (!open || !demoScript) return
    let cancelled = false
    const timers: number[] = []
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, ms)
        timers.push(t)
      })

    const applyField = async (field: DemoFormField) => {
      // Enum / boolean fields — always instant. Typewriter would have
      // nothing visible to type into since these are pick-buttons.
      if (field.key === 'side') {
        set('side', (field.value === 'short' ? 'short' : 'long') as Side)
        return
      }
      if (field.key === 'outcome') {
        const v = field.value as Outcome
        if (v === 'win' || v === 'loss' || v === 'breakeven') set('outcome', v)
        return
      }
      if (field.key === 'followedRules') {
        set('followedRules', field.value !== 'false')
        return
      }

      // All remaining fields are string-valued. Narrowed explicitly so the
      // FormData[K] type check holds without a cast-through-unknown.
      const textKey = field.key as
        | 'instrument' | 'entry' | 'stopLoss' | 'takeProfit' | 'result'
        | 'setupType' | 'strategy' | 'session' | 'reasonForEntry'
        | 'emotionBefore' | 'emotionDuring'
        | 'didRight' | 'didWrong' | 'improve'

      if (field.instant) { set(textKey, field.value); return }

      const globalDelay = demoScript.typeDelayMs ?? 45
      const perCharDelay = field.typeDelayMs ?? globalDelay
      let built = ''
      for (const ch of field.value) {
        if (cancelled) return
        built += ch
        set(textKey, built)
        await sleep(perCharDelay)
      }
    }

    const run = async () => {
      // Let the modal finish its open animation before the first keystroke
      // — otherwise the fill looks frantic, like the form was typing
      // before it appeared. One-field-per-step tutorial scripts pass
      // `initialDelayMs: 0` so re-triggering the effect (each Next click
      // swaps in a new single-field script) doesn't stall for 380ms.
      await sleep(demoScript.initialDelayMs ?? 380)
      for (const field of demoScript.fields) {
        if (cancelled) return
        const targetStep = FIELD_STEP[field.key]
        if (targetStep !== stepRef.current) {
          setStep(targetStep)
          // Wait out the step-transition visual so the next field types
          // into its actual destination, not a ghost of the previous step.
          await sleep(420)
        }
        await applyField(field)
        if (field.pauseAfterMs) await sleep(field.pauseAfterMs)
      }
      if (cancelled) return
      // Split-stage tutorials opt out of auto-submit so the user clicks Next
      // to advance rather than the form closing itself.
      if (demoScript.autoSubmit === false) return
      await sleep(demoScript.submitAfterMs ?? 900)
      if (cancelled) return
      handleSubmitRef.current()
    }

    run()
    return () => {
      cancelled = true
      for (const t of timers) window.clearTimeout(t)
    }
    // Re-run only when the modal opens with a fresh script — we don't
    // want to restart the whole typewriter on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, demoScript])

  // ── Outcome / result consistency ──────────────────────────────────────────
  // Derive which outcomes are logically impossible given the current P&L value.
  const resultNum  = parseFloat(form.result)
  const hasResult  = form.result.trim() !== '' && !isNaN(resultNum)
  const disabledOutcomes: Set<Outcome> = (() => {
    if (!hasResult) return new Set<Outcome>()
    if (resultNum > 0) return new Set<Outcome>(['loss'])       // loss impossible; breakeven allowed
    if (resultNum < 0) return new Set<Outcome>(['win'])        // win impossible; breakeven allowed
    return new Set<Outcome>(['win', 'loss'])                   // exactly 0 → breakeven only
  })()

  // Auto-correct: only clear clearly impossible selections; breakeven is always valid.
  useEffect(() => {
    if (!hasResult) return
    if (resultNum > 0 && form.outcome === 'loss') set('outcome', 'win')        // loss impossible on positive
    else if (resultNum < 0 && form.outcome === 'win') set('outcome', 'loss')   // win impossible on negative
    else if (resultNum === 0) set('outcome', 'breakeven')                      // zero → breakeven
    // breakeven on non-zero P&L is a valid manual choice — leave it alone
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.result])

  const handleSubmit = () => {
    const resultVal = parseFloat(form.result) || 0
    // Final safety coerce: only block truly impossible combos; breakeven is always valid.
    let coercedOutcome = form.outcome
    if (form.result.trim() !== '' && !isNaN(parseFloat(form.result))) {
      if (resultVal > 0 && coercedOutcome === 'loss')      coercedOutcome = 'win'        // loss on positive P&L → win
      else if (resultVal < 0 && coercedOutcome === 'win')  coercedOutcome = 'loss'       // win on negative P&L → loss
      else if (resultVal === 0)                             coercedOutcome = 'breakeven'  // zero → breakeven
      // breakeven on non-zero P&L is intentional — keep it
    }
    const trade: Trade = {
      id: initialTrade?.id ?? Math.random().toString(36).slice(2, 9),
      date: initialTrade?.date ?? defaultDate,
      instrument: form.instrument || 'Unknown',
      side: form.side,
      entry: parseFloat(form.entry) || 0,
      stopLoss: parseFloat(form.stopLoss) || 0,
      takeProfit: parseFloat(form.takeProfit) || 0,
      result: resultVal,
      outcome: coercedOutcome,
      setupType: form.setupType,
      strategy: form.strategy.trim() || undefined,
      session: form.session,
      reasonForEntry: form.reasonForEntry,
      followedRules: form.followedRules ?? true,
      emotionBefore: form.emotionBefore,
      emotionDuring: form.emotionDuring,
      didRight: form.didRight,
      didWrong: form.didWrong,
      improve: form.improve,
      screenshots: form.screenshots.length > 0 ? form.screenshots : undefined,
    }
    onSubmit(trade)
    setStep(1)
    onClose()
  }

  // Keep the ref pointing at the latest closure so the tutorial autofill
  // effect always submits with current form state (rather than whatever
  // handleSubmit looked like when the demo started).
  useEffect(() => { handleSubmitRef.current = handleSubmit })

  const handleClose = () => {
    setForm(DEFAULT)
    setStep(1)
    setUploadError(null)
    setLightboxIdx(null)
    onClose()
  }

  const canGoNext = form.instrument.trim().length > 0

  // ── Screenshot handlers ───────────────────────────────────────────────────
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files ?? [])
    // Reset input immediately — before any async work — so the same file can
    // be re-selected and so the stale synthetic event is never accessed later.
    e.target.value = ''
    if (!allFiles.length) return

    const invalid = allFiles.filter((f) => !ALLOWED_TYPES.has(f.type))
    if (invalid.length) {
      setUploadError(`Unsupported type: ${invalid.map((f) => f.name).join(', ')}. Use PNG, JPG, or WebP.`)
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const results = await Promise.all(
        allFiles.map(async (file): Promise<TradeScreenshot> => {
          const [original, thumb] = await Promise.all([
            readOriginal(file),   // lossless — original format preserved
            generateThumb(file),  // WebP thumbnail for inline preview
          ])
          return { original, thumb }
        })
      )
      setForm((f) => ({ ...f, screenshots: [...f.screenshots, ...results] }))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const removeScreenshot = (idx: number) => {
    setLightboxIdx(null)
    setForm((f) => ({ ...f, screenshots: f.screenshots.filter((_, i) => i !== idx) }))
  }

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  // Unified keyboard handler for all fields in this form.
  // Plain Enter = confirm (next step or save); Shift+Enter in multiline = newline.
  const handleEnterKey = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    multiline = false,
  ) => {
    if (e.key !== 'Enter') return
    if (multiline && e.shiftKey) return   // Shift+Enter → allow default newline in textareas
    e.preventDefault()
    if (step === 1 && canGoNext) setStep(2)
    else if (step === 2) handleSubmit()
  }

  return (
    <>
      {/* Full-screen viewer — portal to document.body, sits above everything */}
      {lightboxIdx !== null && form.screenshots.length > 0 && (
        <ScreenshotViewer
          screenshots={form.screenshots.map((s) => s.original)}
          initialIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      <Modal open={open} onClose={handleClose} width="max-w-lg">
        {/* Hidden file input — triggered programmatically, no label wrapper needed */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleScreenshotUpload}
          onClick={(e) => e.stopPropagation()}
        />

      <div className="flex flex-col max-h-[88vh]" data-tutorial="add-trade-modal">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold text-white">{initialTrade ? 'Edit Trade' : 'New Trade'}</h2>
            <p className="text-[11px] text-white/25">{fmtDateLong(defaultDate)}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex gap-1.5">
              <div className={clsx('w-1.5 h-1.5 rounded-full transition-colors', step >= 1 ? 'bg-white' : 'bg-white/20')} />
              <div className={clsx('w-1.5 h-1.5 rounded-full transition-colors', step >= 2 ? 'bg-white' : 'bg-white/20')} />
            </div>
            <button
              onClick={handleClose}
              className={CLOSE_BTN_CLASS}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {step === 1 ? (
            <div className="flex flex-col gap-6">
              <Section>
                <div className="flex gap-3">
                  <Field label="Instrument">
                    <input
                      className="input-field uppercase font-semibold"
                      placeholder="NQ, ES, SPY..."
                      value={form.instrument}
                      onChange={(e) => set('instrument', e.target.value.toUpperCase())}
                      onKeyDown={handleEnterKey}
                    />
                  </Field>
                  <Field label="P&L">
                    <input
                      className="input-field"
                      placeholder="+500"
                      type="number"
                      value={form.result}
                      onChange={(e) => set('result', e.target.value)}
                      onKeyDown={handleEnterKey}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Result">
                <OutcomeSelector value={form.outcome} onChange={(v) => set('outcome', v)} disabledOutcomes={disabledOutcomes} />
              </Section>

              <Section title="Direction">
                <div className="grid grid-cols-2 gap-2">
                  {(['long', 'short'] as Side[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('side', s)}
                      className={clsx(
                        'py-2.5 rounded-xl text-sm font-semibold border transition-all duration-150 cursor-pointer',
                        form.side === s && s === 'long' && 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/[0.22]',
                        form.side === s && s === 'short' && 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/[0.22]',
                        form.side !== s && UNSELECTED_BTN_CLASS,
                      )}
                    >
                      {s === 'long' ? '↑ Long' : '↓ Short'}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Prices">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'entry' as const, label: 'Entry' },
                    { key: 'stopLoss' as const, label: 'Stop' },
                    { key: 'takeProfit' as const, label: 'Target' },
                  ].map(({ key, label }) => (
                    <Field key={key} label={label}>
                      <input
                        className="input-field"
                        placeholder="0.00"
                        type="number"
                        value={form[key] as string}
                        onChange={(e) => set(key, e.target.value)}
                        onKeyDown={handleEnterKey}
                      />
                    </Field>
                  ))}
                </div>
              </Section>

              <Section title="Strategy">
                <TagSelect
                  options={strategyOptions}
                  value={form.strategy}
                  onChange={(v) => set('strategy', v)}
                  // Strategy chips mirror the pre-trade checklist strategies
                  // (managed via the switcher on the journal page). A typed-in
                  // override is still accepted as free-text on this trade but
                  // doesn't mint a new checklist strategy — that's a deliberate
                  // separation so Add Trade stays a labeling surface, not a
                  // sneaky path to create playbooks.
                  onAddOption={() => {}}
                  placeholder="custom..."
                />
              </Section>

              <Section title="Setup">
                <TagSelect
                  options={setupTypeOptions}
                  value={form.setupType}
                  onChange={(v) => set('setupType', v)}
                  onAddOption={onAddSetupType}
                  onRemoveOption={onRemoveSetupType}
                  placeholder="new setup..."
                />
              </Section>

              <Section title="Session">
                <TagSelect
                  options={sessionOptions}
                  value={form.session}
                  onChange={(v) => set('session', v)}
                  onAddOption={onAddSession}
                  onRemoveOption={onRemoveSession}
                  placeholder="new session..."
                />
              </Section>

              <Section>
                <Field label="Reason for Entry">
                  <textarea
                    className="input-field resize-none"
                    rows={3}
                    placeholder="What did you see that made you take this trade?"
                    value={form.reasonForEntry}
                    onChange={(e) => set('reasonForEntry', e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, true)}
                  />
                </Field>
              </Section>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Section title="Rules">
                <RulesSelector value={form.followedRules} onChange={(v) => set('followedRules', v)} />
              </Section>

              <Section title="Emotion Before">
                <TagSelect
                  options={emotionOptions}
                  value={form.emotionBefore}
                  onChange={(v) => set('emotionBefore', v)}
                  onAddOption={onAddEmotion}
                  onRemoveOption={onRemoveEmotion}
                  placeholder="new emotion..."
                />
              </Section>

              <Section title="Emotion During / After">
                <TagSelect
                  options={emotionOptions}
                  value={form.emotionDuring}
                  onChange={(v) => set('emotionDuring', v)}
                  onAddOption={onAddEmotion}
                  onRemoveOption={onRemoveEmotion}
                  placeholder="new emotion..."
                />
              </Section>

              <Section>
                <Field label="What I did right">
                  <textarea
                    className="input-field resize-none"
                    rows={2}
                    placeholder="What went well?"
                    value={form.didRight}
                    onChange={(e) => set('didRight', e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, true)}
                  />
                </Field>
                <Field label="What I did wrong">
                  <textarea
                    className="input-field resize-none"
                    rows={2}
                    placeholder="What went wrong?"
                    value={form.didWrong}
                    onChange={(e) => set('didWrong', e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, true)}
                  />
                </Field>
                <Field label="Improve next time">
                  <textarea
                    className="input-field resize-none"
                    rows={2}
                    placeholder="What will I change?"
                    value={form.improve}
                    onChange={(e) => set('improve', e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, true)}
                  />
                </Field>
              </Section>

              <Section title="Screenshots">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden min-w-0">

                  {form.screenshots.length === 0 ? (
                    /* ── Empty state ── */
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={triggerFileInput}
                      className="group/empty w-full flex flex-row items-center gap-3 px-4 cursor-pointer hover:bg-white/[0.03] hover:-translate-y-[2px] active:translate-y-0 transition-all duration-150 ease-out disabled:opacity-50"
                      style={{ height: 72 }}
                    >
                      <svg width="18" height="16" viewBox="0 0 28 24" fill="none" className="shrink-0 text-white/20 group-hover/empty:text-white/35 transition-colors duration-150">
                        <rect x="1" y="1" width="26" height="22" rx="3.5" stroke="currentColor" strokeWidth="1.4"/>
                        <circle cx="19.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M1 16L8.5 8.5L14 14L18 10.5L27 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div className="flex flex-col gap-0.5 text-left">
                        <span className="text-xs text-white/30 group-hover/empty:text-white/55 transition-colors duration-150 leading-none">
                          {uploading ? 'Uploading…' : 'Add screenshot'}
                        </span>
                        <span className="text-[10px] text-white/15 group-hover/empty:text-white/30 transition-colors duration-150 leading-none">PNG · JPG · WebP</span>
                      </div>
                    </button>

                  ) : (
                    /* ── Filled state: one row per screenshot + add more row ── */
                    <div className="flex flex-col">
                      {form.screenshots.map((s, i) => (
                        <div key={i}>
                          {/* Separator between rows */}
                          {i > 0 && <div className="h-px bg-white/[0.05] mx-0" />}

                          {/* Screenshot row */}
                          <div className="flex flex-row items-stretch" style={{ height: 72 }}>
                            {/* Thumbnail */}
                            <div
                              className="group/thumb relative shrink-0 cursor-pointer bg-black/20"
                              style={{ width: 96 }}
                              onClick={() => setLightboxIdx(i)}
                            >
                              <img
                                src={s.thumb}
                                alt={`Screenshot ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150 bg-black/40">
                                <span className="text-[10px] font-semibold text-white tracking-widest uppercase">View</span>
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="w-px bg-white/[0.07] shrink-0" />

                            {/* Right side: label + actions */}
                            <div className="flex-1 flex flex-col justify-center gap-2 px-4">
                              <span className="text-[11px] text-white/25 leading-none tabular-nums">
                                {form.screenshots.length === 1
                                  ? '1 screenshot'
                                  : `${i + 1} of ${form.screenshots.length}`}
                              </span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setLightboxIdx(i)}
                                  className="text-[11px] text-white/35 hover:text-white/70 transition-colors duration-150 leading-none cursor-pointer"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeScreenshot(i)}
                                  className="text-[11px] text-white/35 hover:text-red-400 active:text-red-500 transition-colors duration-150 leading-none cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Add more row */}
                      <div className="h-px bg-white/[0.05]" />
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={triggerFileInput}
                        className="group/add w-full flex flex-row items-center gap-2.5 px-4 cursor-pointer hover:bg-white/[0.03] hover:-translate-y-[2px] active:translate-y-0 transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-default"
                        style={{ height: 40 }}
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0 text-white/20 group-hover/add:text-white/40 transition-colors duration-150">
                          <path d="M5.5 1V10M1 5.5H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        <span className="text-[11px] text-white/30 group-hover/add:text-white/55 transition-colors duration-150 leading-none">
                          {uploading ? 'Uploading…' : 'Add more'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline error */}
                {uploadError && (
                  <p className="text-[11px] text-red-400/80 leading-snug mt-1">{uploadError}</p>
                )}
              </Section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep(2)} disabled={!canGoNext}>
                Next →
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" onClick={handleSubmit}>{initialTrade ? 'Save Changes' : 'Save Trade'}</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
    </>
  )
}
