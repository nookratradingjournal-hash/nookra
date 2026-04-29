import { useState, useRef } from 'react'
import { clsx } from 'clsx'

interface TagSelectProps {
  options: string[]
  value: string
  onChange: (v: string) => void
  onAddOption: (v: string) => void
  onRemoveOption?: (v: string) => void
  placeholder?: string
}

export function TagSelect({ options, value, onChange, onAddOption, onRemoveOption, placeholder = 'custom...' }: TagSelectProps) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const confirm = () => {
    const v = input.trim()
    if (v) {
      if (!options.includes(v)) onAddOption(v)
      onChange(v)
    }
    setInput('')
    setAdding(false)
  }

  const startAdding = () => {
    setAdding(true)
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <div
          key={o}
          className={clsx(
            'group/opt inline-flex items-center rounded-full text-xs font-medium border transition-all duration-150',
            value === o
              ? 'bg-white/10 border-white/20 text-white hover:bg-white/[0.13] hover:border-white/20'
              : 'border-white/[0.07] text-white/30 hover:border-white/15 hover:text-white/60 hover:bg-white/[0.04]'
          )}
        >
          <button
            type="button"
            onClick={() => onChange(o)}
            className={clsx(
              'flex items-center h-6 cursor-pointer leading-none',
              onRemoveOption ? 'pl-2.5 pr-1.5' : 'px-2.5'
            )}
          >
            {o}
          </button>
          {onRemoveOption && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemoveOption(o) }}
              className="close-hover mr-1 w-4 h-4 flex items-center justify-center rounded-full opacity-0 group-hover/opt:opacity-100 text-white/30 shrink-0"
              tabIndex={-1}
            >
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <path d="M1 1L6 6M6 1L1 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm() }
            if (e.key === 'Escape') { setAdding(false); setInput('') }
          }}
          onBlur={confirm}
          placeholder={placeholder}
          className="px-2.5 py-1 rounded-full text-xs bg-white/[0.05] border border-white/20 text-white outline-none w-28 placeholder-white/20"
        />
      ) : (
        <button
          type="button"
          onClick={startAdding}
          className="px-2.5 py-1 rounded-full text-xs border border-dashed border-white/[0.07] text-white/20 hover:border-white/15 hover:text-white/40 hover:bg-white/[0.04] hover:-translate-y-[2px] active:translate-y-0 transition-all duration-150 cursor-pointer"
        >
          + custom
        </button>
      )}
    </div>
  )
}
