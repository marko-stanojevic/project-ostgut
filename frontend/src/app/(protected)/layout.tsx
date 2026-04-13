'use client'

import Link from 'next/link'
import { AccountMenu } from '@/components/account-menu'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">bouji.fm</Link>
          <AccountMenu />
        </div>
      </header>
      <main className="min-h-[calc(100vh-73px)]">
        {/* pb-24 leaves room for the pinned player bar */}
        <div className="mx-auto w-full max-w-[1400px] p-6 pb-24">
          {children}
        </div>
      </main>
    </div>
  )
}
