'use client'

import { Suspense, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { ArrowLeftIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { AuthShell } from '@/components/auth/auth-shell'
import { API_URL } from '@/lib/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const t = useTranslations('auth.reset_password')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <AuthShell
        title={t('invalid_title')}
        description={t('invalid_description')}
        badge="Reset Link"
        mark={<WarningCircleIcon className="h-6 w-6" weight="fill" />}
      >
        <div className="text-center text-sm text-muted-foreground">
          <Link href="/auth/forgot-password" className="font-semibold text-foreground hover:underline">
            {t('title')}
          </Link>
        </div>
      </AuthShell>
    )
  }

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
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to reset password')
      }
      router.push('/auth/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('title')}
      description={t('description')}
      badge="Password Reset"
      footer={
        <Link href="/auth/login" className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline">
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {t('back_to_login')}
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-[20rem] space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel>{t('new_password')}</FieldLabel>
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
