import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/context/AuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { PlayerBar } from '@/components/player-bar'
import { PhosphorProvider } from '@/components/phosphor-provider'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import '../globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'bougie.fm — The Listening Room',
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
    <div
      lang={locale}
      className={cn('font-sans bg-background text-foreground', geistSans.variable, geistMono.variable)}
      data-scroll-behavior="smooth"
    >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <SessionProvider>
              <AuthProvider>
                <PlayerProvider>
                  <TooltipProvider>
                    <PhosphorProvider>
                      {children}
                      <PlayerBar />
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
