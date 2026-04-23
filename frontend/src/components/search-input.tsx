'use client'

import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder: string
  className?: string
}

export function SearchInput({ value, onChange, onClear, placeholder, className }: SearchInputProps) {
  return (
    <div className={cn('relative w-full max-w-lg', className)}>
      <MagnifyingGlassIcon className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-border bg-secondary/60 pl-11 pr-10 text-[15px] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-border focus:bg-background focus:shadow-sm focus:ring-2 focus:ring-ring/20"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <XIcon className="h-4.5 w-4.5" />
        </button>
      )}
    </div>
  )
}
