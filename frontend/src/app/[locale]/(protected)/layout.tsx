'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { AccountMenu } from '@/components/account-menu'
import { AppSidebarMobile } from '@/components/app-sidebar'
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

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
      const target = pathname === '/explore' || pathname === '/curated' ? pathname : '/explore'
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
    router.replace(qs ? `/explore?${qs}` : '/explore', { scroll: false })
  }

  return (
    <div className="relative w-full max-w-lg">
      <MagnifyingGlassIcon className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('placeholder')}
        className="h-10 w-full rounded-full border border-border bg-secondary/60 pl-11 pr-10 text-[15px] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-border focus:bg-background focus:shadow-sm focus:ring-2 focus:ring-ring/20"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
          aria-label={t('clear_aria')}
        >
          <XIcon className="h-4.5 w-4.5" />
        </button>
      )}
    </div>
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
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-brand" />
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
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-10 md:px-5 md:py-0">
          <div className="flex items-center justify-between md:shrink-0">
            <Link href="/curated" className="text-[1.6rem] font-semibold tracking-[-0.04em] text-foreground md:py-3.5">
              bougie.fm
            </Link>
            <div className="md:hidden">
              <AccountMenu avatarSize={40} />
            </div>
          </div>
          <TopNav />
          <div className="flex min-w-0 flex-1 items-center pb-1 md:pb-0 md:py-2.5">
            <ExploreSearch />
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <AccountMenu avatarSize={42} />
          </div>
        </div>
      </header>
      <AppSidebarMobile />
      <main className="relative flex-1 overflow-y-auto">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-55 bg-[radial-gradient(52%_42%_at_6%_92%,color-mix(in_oklab,var(--brand)_12%,transparent)_0%,transparent_74%),radial-gradient(48%_38%_at_92%_86%,color-mix(in_oklab,var(--foreground)_7%,transparent)_0%,transparent_76%)] bg-[length:132%_132%,124%_124%] motion-safe:animate-[bg-fade-drift-alt_48s_ease-in-out_infinite_alternate] motion-reduce:animate-none dark:bg-[radial-gradient(52%_42%_at_6%_92%,color-mix(in_oklab,var(--brand)_16%,transparent)_0%,transparent_76%),radial-gradient(48%_38%_at_92%_86%,color-mix(in_oklab,var(--foreground)_10%,transparent)_0%,transparent_78%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90 bg-[radial-gradient(70%_55%_at_16%_10%,color-mix(in_oklab,var(--brand)_16%,transparent)_0%,transparent_68%),radial-gradient(60%_45%_at_85%_2%,color-mix(in_oklab,var(--foreground)_8%,transparent)_0%,transparent_72%)] bg-[length:118%_118%,112%_112%] motion-safe:animate-[bg-fade-drift_30s_ease-in-out_infinite_alternate] motion-reduce:animate-none dark:bg-[radial-gradient(70%_55%_at_16%_10%,color-mix(in_oklab,var(--brand)_20%,transparent)_0%,transparent_70%),radial-gradient(60%_45%_at_85%_2%,color-mix(in_oklab,var(--foreground)_14%,transparent)_0%,transparent_76%)]"
        />
        <div className="relative p-3 pb-24 sm:p-4 sm:pb-24 lg:p-6 lg:pb-24">
          {children}
        </div>
      </main>
    </div>
  )
}
