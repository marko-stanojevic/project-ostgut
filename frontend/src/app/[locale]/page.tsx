'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTranslations } from 'next-intl'
import { SiteHeader } from '@/components/site-header'
import { GuestHeaderActions } from '@/components/site-header-actions'
import { SiteFooter } from '@/components/site-footer'
import { RadioIcon } from '@phosphor-icons/react'

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations('home')
  const tFooter = useTranslations('footer')

  useEffect(() => {
    if (!loading && user) {
      router.replace('/curated')
    }
  }, [loading, user, router])

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse">
          <RadioIcon className="h-7 w-7 text-muted-foreground/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader rightSlot={<GuestHeaderActions signUpLabel={t('header_signup')} />} />

      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-28 text-center">
        {/* Warm ambient glow */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--hero-glow-primary)] blur-[120px]" />
          <div className="absolute right-[-10%] top-[-5%] h-72 w-72 rounded-full bg-[var(--hero-glow-secondary)] blur-[80px]" />
          <div className="absolute bottom-[5%] left-[-5%] h-52 w-52 rounded-full bg-[var(--hero-glow-tertiary)] blur-[60px]" />
        </div>

        <div className="relative z-10 max-w-2xl space-y-8">
          {/* Badge */}
          <div className="ui-editorial-badge inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
            <span className="ui-nav-live-dot h-1.5 w-1.5 animate-pulse rounded-full" />
            <span className="text-[11px] font-medium uppercase tracking-[0.2em]">
              {t('badge')}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-foreground sm:text-6xl lg:text-7xl">
            {t('heading_line1')}<br />{t('heading_line2')}
          </h1>

          {/* Subheading */}
          <p className="mx-auto max-w-md text-base font-light leading-relaxed text-muted-foreground sm:text-lg">
            {t('subheading')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/auth/signup"
              className="rounded-full bg-foreground px-7 py-3 text-sm font-medium tracking-tight text-background transition-opacity hover:opacity-85"
            >
              {t('cta_primary')}
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-border px-7 py-3 text-sm font-medium tracking-tight text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
            >
              {t('cta_secondary')}
            </Link>
          </div>

          {/* Social proof */}
          <p className="text-[11px] font-light uppercase tracking-[0.24em] text-muted-foreground/60">
            {t('social_proof')}
          </p>
        </div>
      </main>

      <SiteFooter links={[
        { href: '/privacy', label: tFooter('privacy') },
        { href: '/terms', label: tFooter('terms') },
      ]} />
    </div>
  )
}
