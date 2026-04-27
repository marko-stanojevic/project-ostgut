import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'
import { NewRelicAgent } from '@/components/NewRelicAgent'
import { GoogleCastScript } from '@/components/google-cast-script'
import { WebVitalsReporter } from '@/components/web-vitals-reporter'

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

// PWA / iOS standalone polish.
// `viewport-fit=cover` allows env(safe-area-inset-*) to resolve to non-zero on
// iOS standalone and notched devices; safe-area tokens in globals.css use it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0d' },
  ],
}

export const metadata: Metadata = {
  applicationName: 'OSTGUT',
  appleWebApp: {
    capable: true,
    title: 'OSTGUT',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
}

async function RequestScopedScripts() {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <>
      <NewRelicAgent nonce={nonce} />
      <WebVitalsReporter />
      <GoogleCastScript nonce={nonce} />
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn('font-sans', geistSans.variable, geistMono.variable)}
    >
      <body className="bg-background text-foreground antialiased">
        <Suspense fallback={null}>
          <RequestScopedScripts />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
