'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Radio, Mic2, MessageSquare, Settings, User, CreditCard, Shield, Bell, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNavItems = [
  { href: '/stations', icon: Radio, label: 'Stations' },
  { href: '/shows', icon: Mic2, label: 'Shows' },
  { href: '/talks', icon: MessageSquare, label: 'Talks' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

const settingsSections = [
  { section: 'overview', label: 'Account overview', icon: User },
  { section: 'plan', label: 'Available plans', icon: CreditCard },
  { section: 'profile', label: 'Edit profile', icon: User },
  { section: 'security', label: 'Security', icon: Shield },
  { section: 'notifications', label: 'Notifications', icon: Bell },
  { section: 'preferences', label: 'Preferences', icon: Palette },
]

function SettingsSubNav() {
  const searchParams = useSearchParams()
  const activeSection = searchParams.get('section') ?? 'overview'

  return (
    <div className="mt-1 px-2">
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
        Settings
      </p>
      {settingsSections.map(({ section, label, icon: Icon }) => {
        const active = activeSection === section
        return (
          <Link
            key={section}
            href={`/settings?section=${section}`}
            className={cn(
              'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        )
      })}
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const isSettings = pathname.startsWith('/settings')

  return (
    <aside className="flex w-[222px] shrink-0 flex-col bg-background">
      {isSettings ? (
        <Suspense>
          <SettingsSubNav />
        </Suspense>
      ) : (
        <nav className="p-2 pt-6">
          {mainNavItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
      )}
    </aside>
  )
}
