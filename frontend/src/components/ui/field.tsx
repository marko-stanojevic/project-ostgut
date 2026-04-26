"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Field — composable form-field primitive.
 *
 * Wires up `id`, `aria-describedby`, and `aria-invalid` so that form
 * controls, descriptions, and errors don't have to thread these props
 * by hand. Designed to wrap a single control (`Input`, `Textarea`,
 * `Select`, `Checkbox`, etc.).
 *
 * Usage:
 *
 *   <Field>
 *     <FieldLabel>Email</FieldLabel>
 *     <Input type="email" />
 *     <FieldDescription>We'll never share this.</FieldDescription>
 *     <FieldError>Required</FieldError>
 *   </Field>
 *
 * The first `<Input|Textarea|Select>` child is enhanced with the field
 * `id` and aria props automatically.
 */

type FieldContextValue = {
  id: string
  describedById: string
  errorId: string
  hasError: boolean
  hasDescription: boolean
  setHasError: (value: boolean) => void
  setHasDescription: (value: boolean) => void
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

function useField() {
  return React.useContext(FieldContext)
}

function Field({
  className,
  id: idProp,
  children,
  ...props
}: React.ComponentProps<"div"> & { id?: string }) {
  const generatedId = React.useId()
  const id = idProp ?? generatedId
  const [hasError, setHasError] = React.useState(false)
  const [hasDescription, setHasDescription] = React.useState(false)

  const value = React.useMemo<FieldContextValue>(
    () => ({
      id,
      describedById: `${id}-description`,
      errorId: `${id}-error`,
      hasError,
      hasDescription,
      setHasError,
      setHasDescription,
    }),
    [id, hasError, hasDescription]
  )

  return (
    <FieldContext.Provider value={value}>
      <div
        data-slot="field"
        data-invalid={hasError ? "" : undefined}
        className={cn("group/field space-y-2", className)}
        {...props}
      >
        {children}
      </div>
    </FieldContext.Provider>
  )
}

function FieldLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Label>) {
  const ctx = useField()
  return (
    <Label
      htmlFor={ctx?.id}
      data-slot="field-label"
      className={cn("text-sm text-foreground", className)}
      {...props}
    >
      {children}
    </Label>
  )
}

function FieldDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  const ctx = useField()
  React.useEffect(() => {
    ctx?.setHasDescription(true)
    return () => ctx?.setHasDescription(false)
  }, [ctx])

  return (
    <p
      id={ctx?.describedById}
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  )
}

function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  const ctx = useField()
  React.useEffect(() => {
    if (children == null || children === false || children === "") {
      ctx?.setHasError(false)
      return
    }
    ctx?.setHasError(true)
    return () => ctx?.setHasError(false)
  }, [ctx, children])

  if (children == null || children === false || children === "") return null

  return (
    <p
      id={ctx?.errorId}
      data-slot="field-error"
      className={cn("text-xs text-destructive", className)}
      role="alert"
      {...props}
    >
      {children}
    </p>
  )
}

/**
 * `useFieldControlProps` — opt-in helper for controls that want to
 * inherit the surrounding `<Field>`'s id and aria wiring without being
 * the first child. Returns props to spread.
 */
function useFieldControlProps() {
  const ctx = useField()
  if (!ctx) return {}
  const describedBy = [
    ctx.hasDescription ? ctx.describedById : null,
    ctx.hasError ? ctx.errorId : null,
  ]
    .filter(Boolean)
    .join(" ")
  return {
    id: ctx.id,
    "aria-invalid": ctx.hasError || undefined,
    "aria-describedby": describedBy || undefined,
  } as const
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  useFieldControlProps,
}
