import Link from 'next/link'
import { auth } from '@/lib/auth'
import { AccountMenu } from '@/components/account-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const features = {
  free: [
    'Access to curated free stations',
    'Standard stream quality',
    'Search by genre, country, and language',
    '14-day free trial of Pro',
  ],
  pro: [
    'Full premium station catalog',
    'Staff Picks and editorial highlights',
    'Higher quality and more reliable streams',
    'Priority curation updates',
    'Early access to new listening features',
    'Faster support response',
  ],
}

export default async function PricingPage() {
  const session = await auth()
  const isAuthenticated = !!session?.user

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation */}
      <header className="border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">bouji.fm</Link>
          <nav className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/pricing" className="hidden rounded-full border border-border/50 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-muted/40 sm:block">
                  Upgrade
                </Link>
                <AccountMenu />
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

      <main className="flex-1 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
            <p className="text-muted-foreground mt-3 text-lg">Start free, upgrade for the full Listening Room experience.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Free</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-muted-foreground ml-1">/ month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {features.free.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant="outline" className="w-full mt-4">Get started free</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card className="border-primary/60 shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Pro</CardTitle>
                  <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Popular</span>
                </div>
                <div className="mt-2">
                  <span className="text-4xl font-bold">$3.99</span>
                  <span className="text-muted-foreground ml-1">/ month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {features.pro.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={isAuthenticated ? '/settings' : '/auth/signup'}>
                  <Button className="w-full mt-4">
                    {isAuthenticated ? 'Upgrade to Pro' : 'Start 14-day free trial'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            All plans include a 14-day free trial. No credit card required to start.
            Payments are processed securely by{' '}
            <a href="https://paddle.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              Paddle
            </a>
            .
          </p>
        </div>
      </main>

      <footer className="border-t border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} bouji.fm. All rights reserved.</span>
          <nav className="flex gap-4">
            <Link href="/refunds" className="hover:text-foreground transition-colors">Refunds</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
