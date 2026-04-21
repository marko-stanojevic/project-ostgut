'use client'

import { Suspense, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        {error && (
          <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">{t('new_password')}</Label>
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
