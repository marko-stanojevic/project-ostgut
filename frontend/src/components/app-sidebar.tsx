'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { RadioIcon, CompassIcon, MicrophoneIcon, ChatIcon, UserIcon, CreditCardIcon, ShieldIcon, BellIcon, PaletteIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { usePlayer } from '@/context/PlayerContext'

const mainNavItems = [
  { href: '/curated', icon: RadioIcon, label: 'Curated' },
  { href: '/explore', icon: CompassIcon, label: 'Explore' },
  { href: '/shows', icon: MicrophoneIcon, label: 'Shows' },
  { href: '/talks', icon: ChatIcon, label: 'Talks' },
]

const settingsSections = [
  { section: 'overview', label: 'Overview', icon: UserIcon },
  { section: 'plan', label: 'Plan', icon: CreditCardIcon },
  { section: 'profile', label: 'Profile', icon: UserIcon },
  { section: 'security', label: 'Security', icon: ShieldIcon },
  { section: 'notifications', label: 'Notifications', icon: BellIcon },
  { section: 'preferences', label: 'Preferences', icon: PaletteIcon },
]

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 text-[9px] font-semibold uppercase tracking-[0.36em] text-muted-foreground/50">
      {children}
    </p>
  )
}

function SettingsSubNav() {
  const searchParams = useSearchParams()
  const activeSection = searchParams.get('section') ?? 'overview'

  return (
    <div className="px-4 pt-8">
      <SidebarSectionLabel>Settings</SidebarSectionLabel>
      <div className="mt-5">
        {settingsSections.map(({ section, label, icon: Icon }) => {
          const active = activeSection === section
          return (
            <Link
              key={section}
              href={`/settings?section=${section}`}
              className={cn(
                'relative mb-2 flex items-center gap-3.5 rounded-xl px-6 py-4 text-[0.94rem] tracking-[0.01em] transition-colors',
                active
                  ? 'bg-brand/[0.04] font-medium text-foreground before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[2px] before:rounded-full before:bg-[linear-gradient(180deg,rgba(200,116,58,0.55),rgba(200,116,58,1),rgba(200,116,58,0.55))] before:shadow-[0_0_10px_rgba(200,116,58,0.28)]'
                  : 'font-light text-muted-foreground hover:bg-foreground/[0.018] hover:text-foreground'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground/85')} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function NowPlayingIndicator() {
  const { station, state } = usePlayer()
  if (!station || state === 'idle') return null

  return (
    <span className="ml-auto flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/80">
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        state === 'playing' ? 'animate-pulse bg-brand' : 'bg-muted-foreground/40'
      )} />
      <span className={state === 'playing' ? 'text-brand' : ''}>
        {state === 'playing' ? 'Live' : 'Paused'}
      </span>
    </span>
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
          const isCuratedAndPlaying = href === '/curated' && station && state !== 'idle'

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
              {isCuratedAndPlaying && !active && state === 'playing' && (
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
    <aside className="hidden w-[246px] shrink-0 flex-col border-r border-border/40 bg-[linear-gradient(180deg,rgba(248,247,245,0.98),rgba(245,243,239,0.92))] md:flex dark:bg-[linear-gradient(180deg,rgba(12,11,9,0.98),rgba(18,16,14,0.94))]">
      {isSettings ? (
        <Suspense>
          <SettingsSubNav />
        </Suspense>
      ) : (
        <div className="px-4 pt-8">
          <SidebarSectionLabel>Listen</SidebarSectionLabel>
          <div className="mt-5 border-t border-border/35 pt-4">
            <nav>
              {mainNavItems.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch
                    className={cn(
                      'relative mb-2 flex items-center gap-3.5 rounded-xl px-6 py-4 text-[0.94rem] tracking-[0.01em] transition-colors',
                      active
                        ? 'bg-brand/[0.04] text-foreground before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[2px] before:rounded-full before:bg-[linear-gradient(180deg,rgba(200,116,58,0.55),rgba(200,116,58,1),rgba(200,116,58,0.55))] before:shadow-[0_0_10px_rgba(200,116,58,0.28)]'
                        : 'font-light text-muted-foreground hover:bg-foreground/[0.018] hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground/85')} />
                    <span>{label}</span>
                    {href === '/curated' && <NowPlayingIndicator />}
                  </Link>
                )
              })}
            </nav>
            <div className="mt-8 px-5">
              <p className="text-[10px] font-light leading-relaxed tracking-[0.01em] text-muted-foreground/80">
                Curated for trust. Explore for discovery.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
