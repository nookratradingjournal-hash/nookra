import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

interface StrategySwitcherProps {
  name: string
  count: number
  onPrev: () => void
  onNext: () => void
  onAdd: () => void
  onRename: (name: string) => void
  onRemove: () => void
}

/**
 * Pre-trade checklist strategy switcher.
 *
 * Sits directly under the "Pre-Trade Checklist" section label and lets the
 * user page through saved strategies, rename the active one, and create a
 * new one. Purposely one-row and low-contrast so it reads as a sub-header,
 * not a second section header — it should melt into the rhythm of the
 * journal page rather than shouting for attention.
 *
 * Interaction rules:
 *   • Prev/next chevrons only render when count > 1.
 *   • Name is click-to-edit (matches the checklist SpacerRow pattern).
 *   • Delete (×) only renders when count > 1, reveals on row hover.
 *   • "+" always available and always creates a fresh "Strategy N".
 */
export function StrategySwitcher({
  name, count, onPrev, onNext, onAdd, onRename, onRemove,
}: StrategySwitcherProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    const v = draft.trim()
    if (v && v !== name) onRename(v)
    else setDraft(name)
    setEditing(false)
  }

  const canNavigate = count > 1

  return (
    <div
      data-tutorial="strategy-switcher"
      className="flex items-center gap-1 mt-1 mb-3 group/row"
    >
      {/* Prev */}
      <button
        type="button"
        onClick={onPrev}
        disabled={!canNavigate}
        title="Previous strategy"
        className={clsx(
          'shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150',
          canNavigate
            ? 'text-white/25 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer'
            : 'text-white/10 cursor-default',
        )}
      >
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M6 1L1.5 5.5L6 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Name — click to rename, inline input on edit. `min-w-0` lets the
          button shrink below its content size inside a tight flex parent so
          `truncate` can kick in; `maxLength` caps pathological pastes. */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(name); setEditing(false) }
          }}
          onBlur={commit}
          maxLength={60}
          className="text-sm font-medium text-white/80 bg-transparent outline-none border-b border-white/20 pb-0.5 min-w-[120px] max-w-[260px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={name}
          className="text-sm font-medium text-white/55 hover:text-white/85 transition-colors duration-150 px-1.5 py-0.5 rounded-md hover:bg-white/[0.03] cursor-pointer truncate min-w-0 max-w-[260px]"
        >
          {name}
        </button>
      )}

      {/* Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canNavigate}
        title="Next strategy"
        className={clsx(
          'shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150',
          canNavigate
            ? 'text-white/25 hover:text-white/70 hover:bg-white/[0.04] cursor-pointer'
            : 'text-white/10 cursor-default',
        )}
      >
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M1 1L5.5 5.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Spacer pushes add / delete to the right */}
      <div className="flex-1" />

      {/* Delete — only when multiple strategies exist, reveals on row hover.
          Wraps onRemove in a confirm prompt so a mis-click can't wipe out a
          strategy's checklist in one gesture. Store also rejects deletes
          when only one strategy remains (belt + suspenders). */}
      {count > 1 && (
        <button
          type="button"
          onClick={() => {
            const ok = window.confirm(
              `Delete strategy "${name}"? This removes its checklist items. This cannot be undone.`,
            )
            if (ok) onRemove()
          }}
          title="Delete strategy"
          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white/20 hover:text-white/70 hover:bg-white/[0.04] transition-all duration-150 cursor-pointer opacity-0 group-hover/row:opacity-100"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1 1L8 8M8 1L1 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      {/* Add */}
      <button
        type="button"
        onClick={onAdd}
        title="New strategy"
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/[0.04] hover:-translate-y-[1px] active:translate-y-0 transition-all duration-150 ease-out cursor-pointer"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M4.5 1V8M1 4.5H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
