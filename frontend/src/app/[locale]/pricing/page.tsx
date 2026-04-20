import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import { SiteHeader } from '@/components/site-header'
import { AuthenticatedHeaderActions, GuestHeaderActions } from '@/components/site-header-actions'
import { SiteFooter } from '@/components/site-footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function PricingPage() {
  const session = await auth()
  const isAuthenticated = !!session?.user
  const t = await getTranslations('pricing')
  const tFooter = await getTranslations('footer')

  const freeFeatures = [
    t('free_feature_1'),
    t('free_feature_2'),
    t('free_feature_3'),
    t('free_feature_4'),
  ]

  const proFeatures = [
    t('pro_feature_1'),
    t('pro_feature_2'),
    t('pro_feature_3'),
    t('pro_feature_4'),
    t('pro_feature_5'),
    t('pro_feature_6'),
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader
        rightSlot={isAuthenticated ? <AuthenticatedHeaderActions /> : <GuestHeaderActions />}
      />

      <main className="flex-1 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground mt-3 text-lg">{t('subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t('free_name')}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">{t('free_price')}</span>
                  <span className="text-muted-foreground ml-1">{t('per_month')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {freeFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant="outline" className="w-full mt-4">{t('free_cta')}</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Pro */}
            <Card className="border-primary/60 shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{t('pro_name')}</CardTitle>
                  <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{t('pro_badge')}</span>
                </div>
                <div className="mt-2">
                  <span className="text-4xl font-bold">{t('pro_price')}</span>
                  <span className="text-muted-foreground ml-1">{t('per_month')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {proFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={isAuthenticated ? '/settings' : '/auth/signup'}>
                  <Button className="w-full mt-4">
                    {isAuthenticated ? t('pro_cta_auth') : t('pro_cta_guest')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            {t.rich('footnote', {
              paddle: (chunks) => (
                <a href="https://paddle.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </main>

      <SiteFooter
        links={[
          { href: '/refunds', label: tFooter('refunds') },
          { href: '/privacy', label: tFooter('privacy_policy') },
          { href: '/terms', label: tFooter('terms_of_service') },
        ]}
      />
    </div>
  )
}
