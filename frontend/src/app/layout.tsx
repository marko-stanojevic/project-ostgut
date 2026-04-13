import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/context/AuthContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import './globals.css'
import { IBM_Plex_Sans_JP } from "next/font/google";
import { cn } from "@/lib/utils";

const ibmPlexSansJP = IBM_Plex_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Project Ostgut',
  description: 'SaaS Starter',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", ibmPlexSansJP.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionProvider>
            <AuthProvider>
              <TooltipProvider>
                {children}
              </TooltipProvider>
            </AuthProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
