'use client'

import { useEffect, useRef, useState } from 'react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AdminSearchContext, useAdminSearch } from './admin-search-context'
import { useTranslations } from 'next-intl'
import { SquaresFourIcon, RadioIcon, UsersIcon, ArrowLeftIcon } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { AccountMenu } from '@/components/account-menu'
import { SearchInput } from '@/components/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ─── Nav components ───────────────────────────────────────────────────────────

function AdminTopNav() {
  const pathname = usePathname()
  const t = useTranslations('admin')

  const navItems = [
    { title: t('nav_overview'), href: '/admin' },
    { title: t('nav_stations'), href: '/admin/stations' },
    { title: t('nav_users'), href: '/admin/users' },
  ]

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      {navItems.map((item) => {
        const active = item.href === '/admin'
          ? pathname === '/admin'
          : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex items-center rounded-lg px-3.5 py-2 text-sm transition-colors',
              active
                ? 'font-medium text-foreground'
                : 'font-light text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{item.title}</span>
            {active && (
              <span className="ui-nav-underline absolute bottom-0 left-2 right-2 h-[2px] rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function AdminTopNavMobile() {
  const pathname = usePathname()
  const t = useTranslations('admin')

  const navItems = [
    { title: t('nav_overview'), href: '/admin', icon: SquaresFourIcon },
    { title: t('nav_stations'), href: '/admin/stations', icon: RadioIcon },
    { title: t('nav_users'), href: '/admin/users', icon: UsersIcon },
  ]

  return (
    <nav className="border-b border-border/50 bg-background md:hidden">
      <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5">
        {navItems.map(({ title, href, icon: Icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {title}
              {active && (
                <span className="ui-nav-underline absolute bottom-0 left-2 right-2 h-[2px] rounded-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ─── Search input ─────────────────────────────────────────────────────────────

function AdminSearchInput({ className }: { className?: string }) {
  const pathname = usePathname()
  const t = useTranslations('admin')
  const { query, setQuery } = useAdminSearch()

  const [value, setValue] = useState(query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local input when context resets (e.g. tab change or route change)
  useEffect(() => { setValue(query) }, [query])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const isStations = pathname.startsWith('/admin/stations')
  const isUsers = pathname.startsWith('/admin/users')

  if (!isStations && !isUsers) return null

  const placeholder = isStations ? t('search_stations') : t('search_users')

  const handleChange = (q: string) => {
    setValue(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(q.trim()), 200)
  }

  const clear = () => {
    setValue('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery('')
  }

  return (
    <SearchInput
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onClear={clear}
      className={className}
    />
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { session, loading, isAdmin } = useAuth()
  const tNav = useTranslations('nav')

  const [query, setQuery] = useState('')

  // Clear search when navigating between admin sections
  useEffect(() => { setQuery('') }, [pathname])

  const showSearch = pathname.startsWith('/admin/stations') || pathname.startsWith('/admin/users')

  useEffect(() => {
    if (!loading && session && !isAdmin) {
      router.replace('/')
    }
  }, [loading, session, isAdmin, router])

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <AdminSearchContext.Provider value={{ query, setQuery }}>
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-10 md:px-5 md:py-0">
            <div className="flex items-center justify-between md:shrink-0">
              <Link href="/admin" className="text-[1.6rem] font-semibold tracking-[-0.04em] text-foreground md:py-3.5">
                OSTGUT
              </Link>
              <div className="md:hidden">
                <AccountMenu avatarSize={40} />
              </div>
            </div>
            <AdminTopNav />
            <div className="hidden md:flex w-52">
              <AdminSearchInput />
            </div>
            <div className="hidden items-center gap-3 md:ml-auto md:flex">
              <Link
                href="/curated"
                className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-light text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                {tNav('back_to_app')}
              </Link>
              <AccountMenu avatarSize={42} />
            </div>
          </div>
        </header>
        <AdminTopNavMobile />
        {showSearch && (
          <div className="border-b border-border/50 bg-background px-3 py-2 md:hidden">
            <AdminSearchInput />
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full max-w-[1600px] p-3 pb-24 sm:p-4 sm:pb-24 lg:p-6 lg:pb-24">
            {children}
          </div>
        </main>
      </div>
    </AdminSearchContext.Provider>
  )
}
