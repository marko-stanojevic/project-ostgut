import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/context/AuthContext'
import { PlayerProvider } from '@/context/PlayerContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { PlayerBar } from '@/components/player-bar'
import './globals.css'
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: 'bouji.fm — The Listening Room',
  description: 'Curated internet radio. Premium live stations. No ads.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans dark")} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SessionProvider>
            <AuthProvider>
              <PlayerProvider>
                <TooltipProvider>
                  {children}
                  <PlayerBar />
                </TooltipProvider>
              </PlayerProvider>
            </AuthProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
