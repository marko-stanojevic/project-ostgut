"use client"

import { CircleNotchIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

/**
 * Spinner — single canonical loading indicator.
 *
 * Always renders an animated Phosphor `CircleNotch`. Use inline next to a
 * label, or as the only child of a button when the action is in flight
 * (in which case the parent should also set `aria-busy`).
 */
export function Spinner({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"span"> & {
  size?: "sm" | "default" | "lg"
}) {
  const sizeClass =
    size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"

  return (
    <span
      role="status"
      aria-hidden="true"
      data-slot="spinner"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      {...props}
    >
      <CircleNotchIcon className={cn("animate-spin", sizeClass)} weight="bold" />
    </span>
  )
}
