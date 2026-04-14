'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { AccountMenu } from '@/components/account-menu'
import { AppSidebar, AppSidebarMobile } from '@/components/app-sidebar'
import { MagnifyingGlass, X } from '@phosphor-icons/react'

function StationSearchInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when navigating back to /stations with an existing query
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
      // Always navigate to /stations so search results are shown there
      const target = pathname === '/stations' ? pathname : '/stations'
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
    router.replace(qs ? `/stations?${qs}` : '/stations', { scroll: false })
  }

  return (
    <div className="relative w-full max-w-lg">
      <MagnifyingGlass className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Find your frequency..."
        className="h-10 w-full rounded-full border border-zinc-300/70 bg-zinc-100/62 pl-10 pr-8 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-400 focus:bg-zinc-100/84"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function StationSearch() {
  return (
    <Suspense>
      <StationSearchInner />
    </Suspense>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const showStationSearch = pathname === '/stations' || pathname.startsWith('/stations/')

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-0">
        <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-0 sm:py-0">
          {/* Logo occupies exactly the desktop sidebar width so search aligns with content */}
          <div className="flex items-center justify-between sm:w-[222px] sm:shrink-0 sm:pl-3 sm:py-3">
            <Link href="/stations" className="text-2xl font-medium tracking-[-0.05em] text-foreground sm:text-3xl">
              bougie.fm
            </Link>
            <div className="sm:hidden">
              <AccountMenu />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3 pb-1 sm:gap-4 sm:py-3 sm:pr-6">
            {showStationSearch ? <StationSearch /> : <div className="hidden w-full max-w-lg sm:block" aria-hidden="true" />}
            <div className="ml-auto hidden items-center gap-3 sm:flex">
              <AccountMenu />
            </div>
          </div>
        </div>
      </header>
      <AppSidebarMobile />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-3 pb-24 sm:p-4 sm:pb-24 lg:p-6 lg:pb-24">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
