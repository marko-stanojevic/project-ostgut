import Link from 'next/link'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { AuthenticatedHeaderActions, GuestHeaderActions } from '@/components/site-header-actions'
import { SiteFooter } from '@/components/site-footer'

export const metadata = {
  title: 'Privacy Policy — bouji.fm',
}

export default async function PrivacyPage() {
  const session = await auth()
  const isAuthenticated = !!session?.user
  const updated = 'April 13, 2025'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader
        rightSlot={isAuthenticated ? <AuthenticatedHeaderActions /> : <GuestHeaderActions />}
      />

      <main className="flex-1 py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

          <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. Who We Are</h2>
              <p>
                bouji.fm (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the bouji.fm platform. This Privacy Policy explains how we collect, use, and protect your personal data when you use our Service.
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

      <SiteFooter
        links={[
          { href: '/refunds', label: 'Refunds' },
          { href: '/terms', label: 'Terms of Service' },
          { href: '/pricing', label: 'Pricing' },
        ]}
      />
    </div>
  )
}
