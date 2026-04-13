'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard,
  Radio,
  Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAdminStatus } from '@/hooks/useAdminStatus'
import { AccountMenu } from '@/components/account-menu'
import { Skeleton } from '@/components/ui/skeleton'

const navItems = [
  { title: 'Overview', href: '/admin', icon: LayoutDashboard },
  { title: 'Stations', href: '/admin/stations', icon: Radio },
  { title: 'Users', href: '/admin/users', icon: Users },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, session } = useAuth()
  const { isAdmin, loading } = useAdminStatus()

  // Guard: redirect non-admins once status is confirmed
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">bouji.fm</Link>
          <AccountMenu />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] gap-6 p-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-border/40 bg-card/20">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <p className="mt-1 truncate text-sm text-white">{user?.email}</p>
          </div>

          <nav className="px-2 pb-2">
            {navItems.map((item) => {
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active
                    ? 'bg-primary/20 text-white'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-white'
                    }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.title}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-border/40 p-3 space-y-2">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              <Radio className="h-3.5 w-3.5" />
              Back to app
            </Link>
          </div>
        </aside>

        <main className="min-w-0 pb-24">
          {children}
        </main>
      </div>
    </div>
  )
}
