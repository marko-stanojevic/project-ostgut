'use client'

import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckIcon, ArrowLeftIcon } from '@phosphor-icons/react'
import { API_URL } from '@/lib/api'
import { AuthShell } from '@/components/auth/auth-shell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const t = useTranslations('auth.forgot_password')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send reset email')
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell
        title={t('success_title')}
        description={t('success_description', { email })}
        badge="Check Your Inbox"
        mark={<CheckIcon className="h-6 w-6" weight="bold" />}
        footer={
          <Link href="/auth/login" className="font-semibold text-foreground hover:underline">
            {t('back_to_login')}
          </Link>
        }
      >
        <div />
      </AuthShell>
    )
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
            <Label htmlFor="email" className="text-sm text-foreground">{t('email')}</Label>
            <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" className="h-13 rounded-2xl border-foreground/20 bg-transparent px-4 text-base text-foreground placeholder:text-muted-foreground/80" />
          </div>
          <Button type="submit" className="h-14 w-full rounded-full text-base font-semibold" disabled={loading}>
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
