'use client'

import type { ReactNode } from 'react'
import { RadioIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type AuthShellProps = {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  badge?: ReactNode
  mark?: ReactNode
  panelClassName?: string
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  badge,
  mark,
  panelClassName,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 -z-10 opacity-50">
        <div className="absolute left-[-12%] top-[10%] h-72 w-72 rounded-full bg-[var(--auth-glow-primary)] blur-3xl" />
        <div className="absolute right-[-10%] top-[18%] h-80 w-80 rounded-full bg-[var(--auth-glow-secondary)] blur-3xl" />
        <div className="absolute bottom-[-6%] left-[18%] h-64 w-64 rounded-full bg-[var(--auth-glow-tertiary)] blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
        <div className={cn(
          'w-full rounded-[2rem] border border-border/50 bg-card/80 px-6 py-8 shadow-xl backdrop-blur-xl sm:px-8',
          panelClassName
        )}>
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-foreground/15 bg-foreground text-background shadow-[0_10px_32px_rgba(12,12,12,0.16)]">
              {mark ?? <RadioIcon className="h-6 w-6" weight="fill" />}
            </div>
          </div>

          <div className="mt-6 space-y-2 text-center">
            {badge ? (
              <div className="flex justify-center">
                <div className="ui-editorial-badge rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em]">
                  {badge}
                </div>
              </div>
            ) : null}
            <h1 className="text-4xl font-medium tracking-[-0.04em] text-foreground sm:text-5xl">{title}</h1>
            {description ? (
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
                {description}
              </p>
            ) : null}
          </div>

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-6 border-t border-border/40 pt-5 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
