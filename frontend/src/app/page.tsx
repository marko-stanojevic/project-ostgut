'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function Home() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <span className="text-lg font-semibold tracking-tight">Ostgut</span>
          <nav className="flex items-center gap-3">
            {user ? (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
                <Link href="/account" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Account</Link>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Login</Link>
                <Link href="/auth/signup" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">Sign Up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 gap-6">
        <h1 className="text-5xl font-bold tracking-tight max-w-2xl">
          Build your SaaS faster
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl">
          A complete full-stack starter with Next.js, Go, Auth.js authentication, and enterprise-ready infrastructure.
        </p>

        {!user && (
          <div className="flex gap-3 mt-2">
            <Link href="/auth/signup" className="font-medium bg-primary text-primary-foreground px-6 py-2.5 rounded-md hover:opacity-90 transition-opacity">
              Get Started Free
            </Link>
            <Link href="/auth/login" className="font-medium border border-border px-6 py-2.5 rounded-md hover:bg-muted transition-colors">
              Sign In
            </Link>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Ostgut. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
