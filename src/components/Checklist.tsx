import { useState, useRef, useEffect } from 'react'
import { ChecklistItem } from '../types'
import { clsx } from 'clsx'

interface ChecklistProps {
  items: ChecklistItem[]
  onToggle: (id: string) => void
  onAdd: (text: string) => void
  onAddSpacer: (text: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string, text: string) => void
}

function SpacerRow({
  item,
  onRemove,
  onEdit,
}: {
  item: ChecklistItem
  onRemove: () => void
  onEdit: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    const v = draft.trim()
    if (v && v !== item.text) onEdit(v)
    else setDraft(item.text)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 pt-4 pb-1 group">
      <div className="h-px flex-1 bg-white/[0.06]" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(item.text); setEditing(false) }
          }}
          onBlur={commit}
          className="text-[9px] font-bold text-white/30 uppercase tracking-[0.14em] bg-transparent outline-none border-b border-white/20 w-24 text-center"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[9px] font-bold text-white/20 uppercase tracking-[0.14em] hover:text-white/60 transition-colors duration-150 whitespace-nowrap px-1 cursor-pointer"
        >
          {item.text || 'Section'}
        </button>
      )}
      <div className="h-px flex-1 bg-white/[0.06]" />
      <button
        onClick={onRemove}
        className="close-hover opacity-0 group-hover:opacity-100 text-white/20 text-sm leading-none w-4 h-4 flex items-center justify-center ml-1 rounded hover:-translate-y-[1px] active:translate-y-0"
      >
        &times;
      </button>
    </div>
  )
}

function CheckRow({
  item,
  onToggle,
  onRemove,
  onEdit,
}: {
  item: ChecklistItem
  onToggle: () => void
  onRemove: () => void
  onEdit: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commitEdit = () => {
    const v = draft.trim()
    if (v && v !== item.text) onEdit(v)
    else setDraft(item.text)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 py-2 group">
      <button
        onClick={onToggle}
        className={clsx(
          'w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer',
          item.checked ? 'bg-white/90 border-white/90' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.04]'
        )}
      >
        {item.checked && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4L3 6L7 2" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') { setDraft(item.text); setEditing(false) }
          }}
          onBlur={commitEdit}
          className="flex-1 bg-transparent text-sm text-white outline-none border-b border-white/20 pb-0.5"
        />
      ) : (
        <span
          className={clsx(
            'flex-1 text-sm cursor-default transition-colors duration-150 select-none',
            item.checked ? 'text-white/20 line-through' : 'text-white/55'
          )}
          onDoubleClick={() => setEditing(true)}
        >
          {item.text}
        </span>
      )}

      <button
        onClick={onRemove}
        className="close-hover opacity-0 group-hover:opacity-100 text-white/20 text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:-translate-y-[1px] active:translate-y-0"
      >
        &times;
      </button>
    </div>
  )
}

export function Checklist({ items, onToggle, onAdd, onAddSpacer, onRemove, onEdit }: ChecklistProps) {
  const [adding, setAdding] = useState<'item' | 'spacer' | null>(null)
  const [newText, setNewText] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  const startAdding = (type: 'item' | 'spacer') => {
    setAdding(type)
    setTimeout(() => addInputRef.current?.focus(), 10)
  }

  const confirmAdd = () => {
    const v = newText.trim()
    if (v) {
      if (adding === 'item') onAdd(v)
      else if (adding === 'spacer') onAddSpacer(v)
    }
    setNewText('')
    setAdding(null)
  }

  const itemEntries = items.filter((i) => i.kind === 'item')
  const checkedCount = itemEntries.filter((i) => i.checked).length
  const totalItems = itemEntries.length

  // Empty state: no items AND no spacers AND not currently mid-add.
  // Uses `items.length` (not `totalItems`) so leftover spacers would still
  // render normally — but with the default now empty, this is the state
  // a brand-new user lands in.
  const isEmpty = items.length === 0 && !adding

  return (
    <div>
      {totalItems > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-white/[0.04] relative overflow-hidden rounded-full">
            <div
              className="absolute left-0 top-0 h-full bg-white/20 transition-all duration-300 rounded-full"
              style={{ width: `${(checkedCount / totalItems) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-white/20 tabular-nums shrink-0">
            {checkedCount}/{totalItems}
          </span>
        </div>
      )}

      {isEmpty ? (
        // Empty state — no rows, no sections. Just the prompt and the full
        // action row. Order is `+ Add divider` then `+ Add item` so the
        // primary "Add item" CTA sits on the right; dividers are allowed
        // even in the empty state so the user can structure the routine
        // before filling it in.
        <div className="flex flex-col items-start gap-2 py-1">
          <span className="text-xs text-white/25">Your pre-trade routine is empty</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => startAdding('spacer')}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 px-2 py-1 -mx-2 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              <svg width="14" height="6" viewBox="0 0 14 6" fill="none">
                <line x1="0" y1="3" x2="5" y2="3" stroke="currentColor" strokeWidth="1"/>
                <line x1="9" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1"/>
                <rect x="5.5" y="0.5" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1"/>
              </svg>
              <span>Add divider</span>
            </button>
            <button
              onClick={() => startAdding('item')}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 px-2 py-1 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              <span className="text-base leading-none">+</span>
              <span>Add item</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            {items.map((item) =>
              item.kind === 'spacer' ? (
                <SpacerRow
                  key={item.id}
                  item={item}
                  onRemove={() => onRemove(item.id)}
                  onEdit={(text) => onEdit(item.id, text)}
                />
              ) : (
                <CheckRow
                  key={item.id}
                  item={item}
                  onToggle={() => onToggle(item.id)}
                  onRemove={() => onRemove(item.id)}
                  onEdit={(text) => onEdit(item.id, text)}
                />
              )
            )}
          </div>

          {adding ? (
            <div className="flex items-center gap-3 py-2 mt-1">
              {adding === 'item' && <div className="w-4 h-4 rounded-[4px] border border-white/10 shrink-0" />}
              {adding === 'spacer' && (
                <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                  <div className="w-full h-px bg-white/20" />
                </div>
              )}
              <input
                ref={addInputRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAdd()
                  if (e.key === 'Escape') { setAdding(null); setNewText('') }
                }}
                onBlur={confirmAdd}
                placeholder={adding === 'spacer' ? 'Section label...' : 'New item...'}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/15 border-b border-white/20 pb-0.5"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-3 pt-2">
              <button
                onClick={() => startAdding('item')}
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/60 hover:bg-white/[0.04] px-2 py-1 -mx-2 rounded-lg transition-all duration-150 cursor-pointer"
              >
                <span className="text-base leading-none">+</span>
                <span>Add item</span>
              </button>
              <button
                onClick={() => startAdding('spacer')}
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/60 hover:bg-white/[0.04] px-2 py-1 rounded-lg transition-all duration-150 cursor-pointer"
              >
                <svg width="14" height="6" viewBox="0 0 14 6" fill="none">
                  <line x1="0" y1="3" x2="5" y2="3" stroke="currentColor" strokeWidth="1"/>
                  <line x1="9" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1"/>
                  <rect x="5.5" y="0.5" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span>Add divider</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
