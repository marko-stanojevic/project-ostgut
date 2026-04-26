"use client"

import * as React from "react"
import { X as XIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useFieldControlProps } from "@/components/ui/field"

type TagInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  /**
   * Maximum number of tags. Further input is ignored when reached.
   */
  max?: number
  /**
   * Lower-case all tags before commit. Defaults to `false`.
   */
  lowercase?: boolean
}

const SEPARATOR = /[,\n\t]/

/**
 * TagInput — chip-style input for tag fields.
 *
 * Keyboard:
 *   - Comma, Enter, or Tab: commit the current draft as a tag
 *   - Backspace on empty input: remove the last tag
 *
 * Paste: any pasted text is split on commas/newlines/tabs and committed
 * as multiple tags in one operation.
 *
 * The component is uncontrolled-friendly: `value` is the canonical list of
 * tags, the draft (current text) is kept in local state and never leaks
 * into `onChange` until commit.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  disabled,
  max,
  lowercase = false,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const fieldProps = useFieldControlProps()

  const normalize = React.useCallback(
    (t: string) => {
      const trimmed = t.trim()
      return lowercase ? trimmed.toLowerCase() : trimmed
    },
    [lowercase]
  )

  const commit = React.useCallback(
    (raw: string) => {
      const parts = raw
        .split(SEPARATOR)
        .map(normalize)
        .filter(Boolean)
      if (parts.length === 0) return
      const seen = new Set(value.map((v) => v.toLowerCase()))
      const additions: string[] = []
      for (const p of parts) {
        const key = p.toLowerCase()
        if (seen.has(key)) continue
        if (max != null && value.length + additions.length >= max) break
        seen.add(key)
        additions.push(p)
      }
      if (additions.length === 0) return
      onChange([...value, ...additions])
    },
    [value, onChange, max, normalize]
  )

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault()
        commit(draft)
        setDraft("")
      }
      return
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault()
      remove(value.length - 1)
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text")
    if (!SEPARATOR.test(text)) return
    e.preventDefault()
    commit(draft + text)
    setDraft("")
  }

  const onBlur = () => {
    if (draft.trim()) {
      commit(draft)
      setDraft("")
    }
  }

  return (
    <div
      data-slot="tag-input"
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-control px-2 py-1.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-destructive/20",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      aria-invalid={fieldProps["aria-invalid"]}
    >
      {value.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              remove(index)
            }}
            className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
            aria-label={`Remove ${tag}`}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        placeholder={value.length === 0 ? placeholder : undefined}
        disabled={disabled}
        id={fieldProps.id}
        aria-describedby={fieldProps["aria-describedby"]}
        className={cn(
          "min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground",
          inputClassName
        )}
      />
    </div>
  )
}

/**
 * Helper — convert a CSV string from a JSON payload to the array form
 * `TagInput` expects.
 */
export function parseTagCSV(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Helper — convert the array back to a CSV string for submission.
 */
export function formatTagCSV(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(", ")
}
