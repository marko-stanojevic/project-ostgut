import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/context/AuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { GlobalPlayerSurface } from '@/components/global-player-surface'
import { PhosphorProvider } from '@/components/phosphor-provider'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { defaultTheme, themeOptions } from '@/lib/theme'
import '../globals.css'

export const metadata: Metadata = {
  title: 'OSTGUT — The Listening Room',
  description: 'Curated internet radio. Premium live stations. No ads.',
}

type Params = Promise<{ locale: string }>

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <div lang={locale} data-scroll-behavior="smooth">
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider attribute="data-theme" defaultTheme={defaultTheme} enableSystem={false} themes={themeOptions.map(({ value }) => value)}>
          <SessionProvider>
            <AuthProvider>
              <PlayerProvider>
                <TooltipProvider>
                  <PhosphorProvider>
                    {children}
                    <GlobalPlayerSurface />
                  </PhosphorProvider>
                </TooltipProvider>
              </PlayerProvider>
            </AuthProvider>
          </SessionProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </div>
  )
}
