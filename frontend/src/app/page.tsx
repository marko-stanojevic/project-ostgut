'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { SiteHeader } from '@/components/site-header'
import { GuestHeaderActions } from '@/components/site-header-actions'
import { SiteFooter } from '@/components/site-footer'
import { Radio } from '@phosphor-icons/react'

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/stations')
    }
  }, [loading, user, router])

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse">
          <Radio className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader rightSlot={<GuestHeaderActions signUpLabel="Sign Up Free" />} />

      <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 opacity-45">
          <div className="absolute right-[-8%] top-0 h-96 w-96 rounded-full bg-primary/18 blur-3xl" />
          <div className="absolute bottom-[8%] left-[-5%] h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-7">
          <div className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-sm">
            <Radio className="mr-2 h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em]">Premium Curated Radio</span>
          </div>

          <h1 className="text-6xl font-medium leading-[0.92] tracking-[-0.06em] text-foreground sm:text-7xl lg:text-[5.5rem]">
            The Listening Room
          </h1>
          <p className="mx-auto max-w-xl text-lg font-light leading-relaxed text-muted-foreground sm:text-xl">
            Discover the world&apos;s finest live radio. Premium stations, carefully curated. No clutter. No noise. Just music.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/signup"
            className="rounded-full bg-primary px-8 py-3 text-sm font-medium tracking-tight text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start Listening Free
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-border/70 bg-background/60 px-8 py-3 text-sm font-medium tracking-tight text-foreground transition-colors hover:bg-secondary/60"
          >
            See Plans
          </Link>
        </div>

        <p className="mt-2 text-xs font-light uppercase tracking-[0.22em] text-muted-foreground">
          Thousands of stations · Live radio · Premium experience
        </p>
      </main>

      <SiteFooter links={[{ href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }]} />
    </div>
  )
}
