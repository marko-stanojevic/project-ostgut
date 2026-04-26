import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useFieldControlProps } from "@/components/ui/field"

const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-control font-light tracking-tight transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-control-disabled disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
  {
    variants: {
      inputSize: {
        default: "h-8 px-2.5 py-1 text-base md:text-sm",
        md: "h-9 px-3 py-1.5 text-base md:text-sm",
        lg: "h-10 px-3.5 py-2 text-base md:text-sm",
        xl: "h-12 px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      inputSize: "default",
    },
  }
)

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>

function Input({ className, type, inputSize, ...props }: InputProps) {
  const fieldProps = useFieldControlProps()
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      {...fieldProps}
      className={cn(inputVariants({ inputSize }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
