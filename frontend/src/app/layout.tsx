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
