'use client'

import { useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { AuthShell } from '@/components/auth/auth-shell'
import { OAuthButton } from '@/components/auth/oauth-button'

function getOAuthErrorMessage(error: string | null, t: ReturnType<typeof useTranslations<'auth.login'>>) {
  switch (error) {
    case 'OAuthAccountNotLinked':
      return t('oauth_account_not_linked')
    case 'AccessDenied':
      return t('oauth_access_denied')
    case 'CallbackRouteError':
    case 'Configuration':
    case 'Default':
    case 'Verification':
      return t('oauth_failed')
    default:
      return ''
  }
}

function normalizeCallbackForLocaleRouter(callbackUrl: string): string {
  if (!callbackUrl) return '/'

  let value = callbackUrl

  if (callbackUrl.startsWith('http://') || callbackUrl.startsWith('https://')) {
    try {
      const url = new URL(callbackUrl)
      value = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return '/'
    }
  }

  if (!value.startsWith('/')) return '/'

  const localePattern = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`)
  const normalized = value.replace(localePattern, '')
  return normalized || '/'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth.login')
  const callbackUrl = searchParams.get('callbackUrl') || searchParams.get('redirect') || '/'
  const normalizedCallbackUrl = normalizeCallbackForLocaleRouter(callbackUrl)
  const { signIn: credentialsSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(() => getOAuthErrorMessage(searchParams.get('error'), t))
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await credentialsSignIn(email, password)
      router.push(normalizedCallbackUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    try {
      await signIn(provider, { callbackUrl: normalizedCallbackUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth login failed')
    }
  }

  return (
    <AuthShell
      title={t('title')}
      description={t('subtitle')}
      badge="The Listening Room"
      footer={
        <>
          {t('no_account')}{' '}
          <Link href="/auth/signup" className="font-semibold text-foreground hover:underline">
            {t('sign_up')}
          </Link>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[20rem] space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel>{t('email')}</FieldLabel>
            <Input
              name="email"
              type="email"
              inputSize="xl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>{t('password')}</FieldLabel>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('forgot_password')}
              </Link>
            </div>
            <Input
              name="password"
              type="password"
              inputSize="xl"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="xl" className="w-full" loading={loading}>
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>

        <div className="flex items-center gap-4">
          <Separator className="flex-1 bg-foreground/15" />
          <span className="text-sm font-medium text-foreground/70">{t('or')}</span>
          <Separator className="flex-1 bg-foreground/15" />
        </div>

        <div className="space-y-3">
          <OAuthButton provider="github" label={t('github')} onClick={() => handleOAuthLogin('github')} />
          <OAuthButton provider="google" label={t('google')} onClick={() => handleOAuthLogin('google')} />
        </div>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
