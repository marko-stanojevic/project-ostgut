'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { RadioIcon, MicrophoneIcon, ChatIcon, UserIcon, CreditCardIcon, ShieldIcon, BellIcon, PaletteIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { usePlayer } from '@/context/PlayerContext'

const mainNavItems = [
  { href: '/stations', icon: RadioIcon, label: 'Stations' },
  { href: '/shows', icon: MicrophoneIcon, label: 'Shows' },
  { href: '/talks', icon: ChatIcon, label: 'Talks' },
]

const settingsSections = [
  { section: 'overview', label: 'Account overview', icon: UserIcon },
  { section: 'plan', label: 'Available plans', icon: CreditCardIcon },
  { section: 'profile', label: 'Edit profile', icon: UserIcon },
  { section: 'security', label: 'Security', icon: ShieldIcon },
  { section: 'notifications', label: 'Notifications', icon: BellIcon },
  { section: 'preferences', label: 'Preferences', icon: PaletteIcon },
]

function SettingsSubNav() {
  const searchParams = useSearchParams()
  const activeSection = searchParams.get('section') ?? 'overview'

  return (
    <div className="mt-4 px-2">
      {settingsSections.map(({ section, label, icon: Icon }) => {
        const active = activeSection === section
        return (
          <Link
            key={section}
            href={`/settings?section=${section}`}
            className={cn(
              'mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary/8 font-medium text-foreground'
                : 'font-light text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
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

function NowPlayingDot() {
  const { station, state } = usePlayer()
  if (!station || state === 'idle') return null
  return (
    <span className={cn(
      'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
      state === 'playing' ? 'animate-pulse bg-brand' : 'bg-muted-foreground/40'
    )} />
  )
}

export function AppSidebarMobile() {
  const pathname = usePathname()
  const { station, state } = usePlayer()

  return (
    <nav className="border-b border-border/50 bg-background md:hidden">
      <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5">
        {mainNavItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isStationsAndPlaying = href === '/stations' && station && state !== 'idle'

          return (
            <Link
              key={href}
              href={href}
              prefetch
              className={cn(
                'relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-brand" />
              )}
              {isStationsAndPlaying && !active && state === 'playing' && (
                <span className="h-1 w-1 animate-pulse rounded-full bg-brand" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const isSettings = pathname.startsWith('/settings')

  return (
    <aside className="hidden w-[222px] shrink-0 flex-col border-r border-border/40 bg-background md:flex">
      {isSettings ? (
        <Suspense>
          <SettingsSubNav />
        </Suspense>
      ) : (
        <nav className="p-2 pt-5">
          {mainNavItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={cn(
                  'mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-secondary font-medium text-foreground'
                    : 'font-light text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {href === '/stations' && <NowPlayingDot />}
              </Link>
            )
          })}
        </nav>
      )}
    </aside>
  )
}
