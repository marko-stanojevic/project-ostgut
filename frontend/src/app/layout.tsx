import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/context/AuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { PlayerBar } from '@/components/player-bar'
import { PhosphorProvider } from '@/components/phosphor-provider'
import './globals.css'
import { cn } from "@/lib/utils";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", geistSans.variable, geistMono.variable)} suppressHydrationWarning>
      <body className="bg-background text-foreground">
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
      </body>
    </html>
  )
}
