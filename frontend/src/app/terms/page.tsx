import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — Ostgut',
}

export default function TermsPage() {
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
        <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert prose-sm sm:prose-base">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

          <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Ostgut (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
              <p>
                Ostgut is a software-as-a-service platform. We reserve the right to modify, suspend, or discontinue the Service at any time with reasonable notice.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. Account Registration</h2>
              <p>
                You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your credentials and for all activities that occur under your account.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">4. Subscriptions and Billing</h2>
              <p>
                Paid subscriptions are billed in advance on a monthly or annual basis. Payments are processed by Paddle, our Merchant of Record, who handles all billing, tax compliance, and refunds on our behalf. By subscribing, you also agree to{' '}
                <a href="https://www.paddle.com/legal/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Paddle&apos;s Terms of Service
                </a>
                .
              </p>
              <p className="mt-2">
                You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period. We do not offer prorated refunds for partial periods unless required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">5. Free Trial</h2>
              <p>
                We offer a 14-day free trial for new accounts. No credit card is required to start a trial. At the end of the trial period, you will be moved to the Free plan unless you upgrade.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">6. Acceptable Use</h2>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe the intellectual property rights of others</li>
                <li>Transmit malicious code or interfere with the Service&apos;s infrastructure</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">7. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Ostgut and are protected by applicable intellectual property laws. You retain ownership of any content you submit through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Ostgut shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">9. Termination</h2>
              <p>
                We may terminate or suspend your account immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">10. Changes to Terms</h2>
              <p>
                We reserve the right to update these Terms at any time. We will notify you of significant changes by email or via a notice in the Service. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
              <p>
                If you have questions about these Terms, please contact us at{' '}
                <a href="mailto:legal@worksfine.app" className="underline underline-offset-2">legal@worksfine.app</a>.
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
