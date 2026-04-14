import Link from 'next/link'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { AuthenticatedHeaderActions, GuestHeaderActions } from '@/components/site-header-actions'
import { SiteFooter } from '@/components/site-footer'

export const metadata = {
  title: 'Refund Policy — bougie.fm',
}

export default async function RefundsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Refund Policy</h1>
          <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

          <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
            <section>
              <h2 className="text-lg font-semibold mb-2">1. Merchant of Record</h2>
              <p>
                All payments for bougie.fm subscriptions are processed by{' '}
                <a href="https://paddle.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Paddle</a>,
                our Merchant of Record. Paddle handles billing, invoicing, tax compliance, and refund processing on our behalf. If you have a billing question or need a receipt, you can also contact Paddle directly at{' '}
                <a href="https://www.paddle.com/support" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">paddle.com/support</a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. Free Trial</h2>
              <p>
                All new accounts receive a 14-day free trial. No credit card is required to start. We encourage you to evaluate the Service fully during this period before subscribing. No refunds are issued for the trial period itself, as no charge is made.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. Cancellations</h2>
              <p>
                You may cancel your subscription at any time from your Account page. Cancellation takes effect at the end of the current billing period — you retain access to Pro features until that date. We do not charge cancellation fees.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">4. Refund Eligibility</h2>
              <p>
                We offer refunds in the following situations:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>
                  <strong>Within 7 days of initial purchase</strong> — if you subscribed and find the Service does not meet your needs, contact us within 7 days of your first charge for a full refund.
                </li>
                <li>
                  <strong>Billing errors</strong> — if you were charged incorrectly (e.g. duplicate charge, wrong amount), we will issue a full refund for the erroneous amount.
                </li>
                <li>
                  <strong>Extended service outages</strong> — if the Service experiences a verified outage exceeding 72 consecutive hours in a billing period, you may request a prorated credit or refund for that period.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">5. Non-Refundable Situations</h2>
              <p>Refunds are not issued in the following cases:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Subscription renewals — we send a reminder email before each renewal. If you did not cancel before renewal, the charge is not refundable unless covered by Section 4.</li>
                <li>Partial months — unused days within a billing period are not refunded upon cancellation.</li>
                <li>Account termination due to a violation of our <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">6. How to Request a Refund</h2>
              <p>
                Email us at{' '}
                <a href="mailto:billing@worksfine.app" className="underline underline-offset-2">billing@worksfine.app</a>{' '}
                with the subject line <em>&quot;Refund Request&quot;</em> and include:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>The email address associated with your account</li>
                <li>The date of the charge</li>
                <li>The reason for your request</li>
              </ul>
              <p className="mt-2">
                We aim to respond within 2 business days. Approved refunds are processed through Paddle and typically appear on your statement within 5–10 business days depending on your bank.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">7. Consumer Rights</h2>
              <p>
                If you are located in the European Union or United Kingdom, you may have a statutory right of withdrawal within 14 days of purchase under consumer protection law. Please contact us at{' '}
                <a href="mailto:billing@worksfine.app" className="underline underline-offset-2">billing@worksfine.app</a>{' '}
                to exercise this right. Note that this right may not apply if you have already made substantial use of the Service during that period.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">8. Changes to This Policy</h2>
              <p>
                We may update this Refund Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the Service after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">9. Contact</h2>
              <p>
                For billing and refund inquiries:{' '}
                <a href="mailto:billing@worksfine.app" className="underline underline-offset-2">billing@worksfine.app</a>
              </p>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter
        links={[
          { href: '/pricing', label: 'Pricing' },
          { href: '/privacy', label: 'Privacy Policy' },
          { href: '/terms', label: 'Terms of Service' },
        ]}
      />
    </div>
  )
}
