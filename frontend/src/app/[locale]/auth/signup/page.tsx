'use client'

import { useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/context/AuthContext'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { CheckIcon } from '@phosphor-icons/react'
import { AuthShell } from '@/components/auth/auth-shell'
import { OAuthButton } from '@/components/auth/oauth-button'

export default function SignupPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const t = useTranslations('auth.signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('error_mismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('error_short'))
      return
    }

    setLoading(true)
    try {
      await signUp(email, password)
      setSuccess(true)
      setTimeout(() => router.push('/auth/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignup = async (provider: 'github' | 'google') => {
    try {
      await signIn(provider, { callbackUrl: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth signup failed')
    }
  }

  if (success) {
    return (
      <AuthShell
        title={t('success_title')}
        description={t('success_subtitle')}
        badge="Welcome In"
        mark={<CheckIcon className="h-6 w-6" weight="bold" />}
      >
        <div />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('title')}
      description={t('subtitle')}
      badge="The Listening Room"
      footer={
        <>
          {t('has_account')}{' '}
          <Link href="/auth/login" className="font-semibold text-foreground hover:underline">{t('sign_in')}</Link>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[20rem] space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="space-y-3">
          <OAuthButton provider="github" label={t('github')} onClick={() => handleOAuthSignup('github')} />
          <OAuthButton provider="google" label={t('google')} onClick={() => handleOAuthSignup('google')} />
        </div>

        <div className="flex items-center gap-4">
          <Separator className="flex-1 bg-foreground/15" />
          <span className="text-sm font-medium text-foreground/70">{t('or')}</span>
          <Separator className="flex-1 bg-foreground/15" />
        </div>

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
            <FieldLabel>{t('password')}</FieldLabel>
            <Input
              name="password"
              type="password"
              inputSize="xl"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
            <FieldDescription>{t('password_hint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t('confirm_password')}</FieldLabel>
            <Input
              name="confirm-password"
              type="password"
              inputSize="xl"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="xl" className="w-full" loading={loading}>
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
