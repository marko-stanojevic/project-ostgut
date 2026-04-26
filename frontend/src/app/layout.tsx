import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cn } from '@/lib/utils'
import { NewRelicAgent } from '@/components/NewRelicAgent'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('font-sans', geistSans.variable, geistMono.variable)}
    >
      <body className="bg-background text-foreground antialiased">
        <NewRelicAgent />
        {children}
      </body>
    </html>
  )
}
