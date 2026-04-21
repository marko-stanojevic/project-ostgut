'use client'

import { useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/context/AuthContext'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CheckIcon } from '@phosphor-icons/react'
import { AuthShell } from '@/components/auth/auth-shell'

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
        {error && (
          <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <Button variant="outline" className="relative h-14 w-full rounded-full border-foreground/20 bg-transparent px-6 text-base text-foreground hover:bg-foreground/6" onClick={() => handleOAuthSignup('github')}>
                <svg className="absolute left-5 top-1/2 h-[2.1rem] w-[2.1rem] -translate-y-1/2 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span className="block w-full text-center">{t('github')}</span>
              </Button>
              <Button variant="outline" className="relative h-14 w-full rounded-full border-foreground/20 bg-transparent px-6 text-base text-foreground hover:bg-foreground/6" onClick={() => handleOAuthSignup('google')}>
                <svg className="absolute left-5 top-1/2 h-[2.1rem] w-[2.1rem] -translate-y-1/2 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="block w-full text-center">{t('google')}</span>
              </Button>
        </div>

        <div className="flex items-center gap-4">
          <Separator className="flex-1 bg-foreground/15" />
          <span className="text-sm font-medium text-foreground/70">{t('or')}</span>
          <Separator className="flex-1 bg-foreground/15" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm text-foreground">{t('email')}</Label>
            <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" className="h-13 rounded-2xl border-foreground/20 bg-transparent px-4 text-base text-foreground placeholder:text-muted-foreground/80" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">{t('password')}</Label>
            <Input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" className="h-13 rounded-2xl border-foreground/20 bg-transparent px-4 text-base text-foreground placeholder:text-muted-foreground/80" />
            <p className="text-xs text-muted-foreground">{t('password_hint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm text-foreground">{t('confirm_password')}</Label>
            <Input id="confirm-password" name="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" className="h-13 rounded-2xl border-foreground/20 bg-transparent px-4 text-base text-foreground placeholder:text-muted-foreground/80" />
          </div>
          <Button type="submit" className="h-14 w-full rounded-full text-base font-semibold" disabled={loading}>
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
