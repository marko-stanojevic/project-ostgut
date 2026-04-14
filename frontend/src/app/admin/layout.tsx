'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SquaresFourIcon, RadioIcon, UsersIcon, ArrowLeftIcon } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useAdminStatus } from '@/hooks/useAdminStatus'
import { AccountMenu } from '@/components/account-menu'
import { SiteHeader } from '@/components/site-header'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const navItems = [
  { title: 'Overview', href: '/admin', icon: SquaresFourIcon },
  { title: 'Stations', href: '/admin/stations', icon: RadioIcon },
  { title: 'Users', href: '/admin/users', icon: UsersIcon },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, session } = useAuth()
  const { isAdmin, loading } = useAdminStatus()

  useEffect(() => {
    if (!loading && isAdmin === false) {
      router.replace('/')
    }
  }, [loading, isAdmin, router])

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <SiteHeader rightSlot={<AccountMenu />} />

      <div className="flex flex-1 overflow-hidden">
        {/* Admin sidebar */}
        <aside className="flex w-[222px] shrink-0 flex-col bg-background">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <p className="mt-0.5 truncate text-xs text-foreground/70">{user?.email}</p>
          </div>

          <nav className="flex-1 px-2">
            {navItems.map((item) => {
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.title}
                </Link>
              )
            })}
          </nav>

          <div className="p-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Back to app
            </Link>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 pb-24">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
