import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  WarningCircleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-border/60 bg-muted/40 text-foreground",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive [&_svg]:text-destructive",
        success:
          "border-admin-success-border bg-admin-success-surface text-admin-success-text [&_svg]:text-admin-success-text",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const iconForVariant = {
  info: InfoIcon,
  destructive: WarningCircleIcon,
  success: CheckCircleIcon,
} as const

/**
 * Alert — surface for inline errors, confirmations, and notices in forms
 * and panels. Replaces the hand-rolled
 * `rounded-2xl border border-destructive/25 bg-destructive/10 …` pattern
 * that lived in every auth page.
 */
function Alert({
  className,
  variant = "info",
  children,
  showIcon = true,
  role,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> &
  VariantProps<typeof alertVariants> & {
    showIcon?: boolean
    role?: "alert" | "status"
  }) {
  const Icon = iconForVariant[variant ?? "info"]
  const resolvedRole = role ?? (variant === "destructive" ? "alert" : "status")

  return (
    <div
      data-slot="alert"
      role={resolvedRole}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {showIcon ? (
        <Icon
          className="mt-[2px] h-4 w-4 shrink-0"
          weight={variant === "info" ? "regular" : "fill"}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-medium leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed opacity-90", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
