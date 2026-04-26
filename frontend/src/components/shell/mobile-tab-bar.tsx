'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { RadioIcon, CompassIcon, MicrophoneIcon, ChatIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * Bottom tab bar — primary navigation on compact (mobile) form factor.
 *
 * Hidden on `md+` where the top header carries the same tabs. Sits above the
 * iOS home indicator via `--safe-bottom`. The mobile mini-player floats just
 * above this bar; both share the `pb-safe-bottom` strategy so content padding
 * lines up.
 */
export function MobileTabBar() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  const items = [
    { href: '/curated', icon: RadioIcon, label: t('curated') },
    { href: '/explore', icon: CompassIcon, label: t('explore') },
    { href: '/shows', icon: MicrophoneIcon, label: t('shows') },
    { href: '/talks', icon: ChatIcon, label: t('talks') },
  ]

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 pb-[var(--safe-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide transition-colors',
                  active
                    ? 'font-medium text-foreground'
                    : 'font-light text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" weight={active ? 'fill' : 'regular'} />
                <span>{label}</span>
                {active && (
                  <span className="ui-nav-underline absolute top-0 left-1/4 right-1/4 h-[2px] rounded-full" />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
