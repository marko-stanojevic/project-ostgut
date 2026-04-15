'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { AccountMenu } from '@/components/account-menu'
import { AppSidebar, AppSidebarMobile } from '@/components/app-sidebar'
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'

function ExploreSearchInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when navigating back to /explore with an existing query
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
      const target = pathname === '/explore' ? pathname : '/explore'
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
    <div className="relative w-full max-w-lg sm:max-w-2xl">
      <MagnifyingGlassIcon className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search stations, genres, countries…"
        className="h-12 w-full rounded-full border border-border bg-secondary/60 pl-12 pr-10 text-[18px] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-border focus:bg-background focus:shadow-sm focus:ring-2 focus:ring-ring/20"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const showExploreSearch = pathname === '/explore' || pathname.startsWith('/explore/')

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/50 bg-background/95 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:px-0">
        <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-0 sm:py-0">
          {/* Logo occupies exactly the desktop sidebar width so search aligns with content */}
          <div className="flex items-center justify-between sm:w-[246px] sm:shrink-0 sm:border-r sm:border-border/40 sm:pl-4 sm:py-4">
            <Link href="/curated" className="text-[1.6rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[2rem]">
              bougie.fm
            </Link>
            <div className="sm:hidden">
              <AccountMenu avatarSize={40} />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-4 pb-1 sm:gap-5 sm:py-3.5 sm:pr-5">
            {showExploreSearch ? <ExploreSearch /> : <div className="hidden w-full max-w-lg sm:block sm:max-w-2xl" aria-hidden="true" />}
            <div className="ml-auto hidden items-center gap-3 sm:flex">
              <AccountMenu avatarSize={42} />
            </div>
          </div>
        </div>
      </header>
      <AppSidebarMobile />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
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
    </div>
  )
}
