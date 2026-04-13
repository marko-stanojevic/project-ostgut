import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — Ostgut',
}

export default function PrivacyPage() {
  const updated = 'April 13, 2025'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-lg font-semibold tracking-tight">Ostgut</Link>
          <nav className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Login</Link>
            <Link href="/auth/signup" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">Sign Up</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

          <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. Who We Are</h2>
              <p>
                Ostgut (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the Ostgut platform. This Privacy Policy explains how we collect, use, and protect your personal data when you use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
              <p>We collect the following categories of data:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Account data</strong> — email address, display name, and (if applicable) GitHub profile information when you sign in with GitHub.</li>
                <li><strong>Usage data</strong> — pages visited, features used, and timestamps of activity, collected to improve the Service.</li>
                <li><strong>Billing data</strong> — subscription status and billing period. Payment details (card numbers, etc.) are handled exclusively by Paddle and are never stored on our servers.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. How We Use Your Data</h2>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>To provide and maintain the Service</li>
                <li>To authenticate your account and keep it secure</li>
                <li>To process your subscription and send billing-related communications</li>
                <li>To send product updates and announcements (you can opt out at any time)</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">4. Payments and Paddle</h2>
              <p>
                We use{' '}
                <a href="https://paddle.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Paddle</a>
                {' '}as our Merchant of Record for all payment processing. When you subscribe, Paddle collects and processes your payment information under their own{' '}
                <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Privacy Policy
                </a>
                . We receive only subscription status and a Paddle customer ID, not your payment card details.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">5. Data Sharing</h2>
              <p>
                We do not sell your personal data. We share data only with:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Paddle</strong> — for billing and tax compliance</li>
                <li><strong>Infrastructure providers</strong> (Microsoft Azure) — to host and operate the Service</li>
                <li><strong>Law enforcement</strong> — when required by law or to protect our legal rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">6. Data Retention</h2>
              <p>
                We retain your account data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">7. Your Rights</h2>
              <p>
                Depending on your location, you may have rights to access, correct, delete, or export your personal data, and to object to or restrict certain processing. To exercise any of these rights, contact us at{' '}
                <a href="mailto:privacy@worksfine.app" className="underline underline-offset-2">privacy@worksfine.app</a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">8. Cookies</h2>
              <p>
                We use strictly necessary cookies for session management and authentication. We do not use tracking or advertising cookies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">9. Security</h2>
              <p>
                We use industry-standard measures to protect your data, including encrypted connections (TLS), encrypted secrets management, and access controls. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes by email or via a notice in the Service. Continued use after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
              <p>
                Questions or requests regarding this Privacy Policy should be sent to{' '}
                <a href="mailto:privacy@worksfine.app" className="underline underline-offset-2">privacy@worksfine.app</a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Ostgut. All rights reserved.</span>
          <nav className="flex gap-4">
            <Link href="/refunds" className="hover:text-foreground transition-colors">Refunds</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
