'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { AccountMenu } from '@/components/account-menu'
import { AppSidebar } from '@/components/app-sidebar'
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
      <MagnifyingGlass className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Find your frequency..."
        className="h-10 w-full rounded-full border border-border/60 bg-secondary/40 pl-10 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-background"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {/* Logo occupies exactly the sidebar width so search aligns with content */}
        <div className="flex w-[222px] shrink-0 items-center pl-3 py-3">
          <Link href="/stations" className="text-2xl font-medium tracking-[-0.05em] text-foreground sm:text-3xl">
            bougie.fm
          </Link>
        </div>
        <div className="flex flex-1 items-center gap-4 py-3 pr-6">
          <StationSearch />
          <div className="ml-auto flex items-center gap-3">
            <AccountMenu />
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 pb-24">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
