'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { AccountMenu } from '@/components/account-menu'
import { MobileTabBar } from '@/components/shell/mobile-tab-bar'
import { GoogleCastScript } from '@/components/google-cast-script'
import { SearchInput } from '@/components/search-input'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

function getSearchTarget(pathname: string) {
  return pathname === '/explore' || pathname === '/curated' ? pathname : '/explore'
}

function ExploreSearchInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('search')
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  const handleChange = (q: string) => {
    setValue(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const qs = params.toString()
      const target = getSearchTarget(pathname)
      router.push(qs ? `${target}?${qs}` : target, { scroll: false })
    }, 200)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const clear = () => {
    setValue('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    const qs = params.toString()
    const target = getSearchTarget(pathname)
    router.replace(qs ? `${target}?${qs}` : target, { scroll: false })
  }

  return (
    <SearchInput
      value={value}
      onChange={handleChange}
      onClear={clear}
      placeholder={t('placeholder')}
    />
  )
}

function ExploreSearch() {
  return (
    <Suspense>
      <ExploreSearchInner />
    </Suspense>
  )
}

function TopNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  const items = [
    { href: '/curated', label: t('curated') },
    { href: '/explore', label: t('explore') },
    { href: '/shows', label: t('shows') },
    { href: '/talks', label: t('talks') },
  ]

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
              'relative flex items-center rounded-lg px-3.5 py-2 text-sm transition-colors',
              active
                ? 'font-medium text-foreground'
                : 'font-light text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{label}</span>
            {active && (
              <span className="ui-nav-underline absolute bottom-0 left-2 right-2 h-[2px] rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const tNav = useTranslations('nav')
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/')

  return (
    <>
      <GoogleCastScript />
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-10 md:px-5 md:py-0">
            <div className="flex items-center justify-between md:shrink-0">
              <Link href="/curated" className="text-[1.6rem] font-semibold tracking-[-0.04em] text-foreground md:py-3.5">
                OSTGUT
              </Link>
              <div className="md:hidden">
                <AccountMenu avatarSize={40} />
              </div>
            </div>
            <TopNav />
            <div className="flex min-w-0 flex-1 items-center pb-1 md:pb-0 md:py-2.5">
              {isSettings ? (
                <div className="hidden md:flex min-w-0 flex-1 justify-end">
                  <Link
                    href="/curated"
                    className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-light text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    {tNav('back_to_app')}
                  </Link>
                </div>
              ) : (
                <ExploreSearch />
              )}
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <AccountMenu avatarSize={42} />
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-55 bg-[image:var(--app-shell-overlay-1)] bg-[length:132%_132%,124%_124%] motion-safe:animate-[bg-fade-drift-alt_48s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-90 bg-[image:var(--app-shell-overlay-2)] bg-[length:118%_118%,112%_112%] motion-safe:animate-[bg-fade-drift_30s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
          />
          <div className="relative p-3 pb-[calc(8.5rem+var(--safe-bottom))] sm:p-4 sm:pb-24 lg:p-6 lg:pb-24">
            {children}
          </div>
        </main>
        <MobileTabBar />
      </div>
    </>
  )
}
