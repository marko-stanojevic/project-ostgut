'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SubscriptionCard } from '@/components/subscription-card'
import { getPreferredMediaUrl, type MediaAssetResponse } from '@/lib/media'
import { uploadMediaAsset } from '@/lib/media-upload'
import { defaultTheme, themeOptions, type AppTheme } from '@/lib/theme'
import { getUserProfile, updateUserProfile } from '@/lib/user-profile'
import {
  UserIcon,
  CreditCardIcon,
  ShieldIcon,
  BellIcon,
  PaletteIcon,
  CaretRightIcon,
  SignOutIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'

type SettingsSection = 'overview' | 'plan' | 'profile' | 'security' | 'notifications' | 'preferences'

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewSection() {
  const { user } = useAuth()
  const t = useTranslations('settings')

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  const quickLinks = [
    { section: 'profile', label: t('sections.profile'), description: t('overview.profile_description'), icon: UserIcon },
    { section: 'plan', label: t('sections.plan'), description: t('overview.plan_description'), icon: CreditCardIcon },
    { section: 'security', label: t('sections.security'), description: t('overview.security_description'), icon: ShieldIcon },
    { section: 'notifications', label: t('sections.notifications'), description: t('overview.notifications_description'), icon: BellIcon },
    { section: 'preferences', label: t('sections.preferences'), description: t('overview.preferences_description'), icon: PaletteIcon },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-base font-medium text-background">
          {initials}
        </div>
        <div className="min-w-0">
          {user?.name && <p className="truncate font-medium">{user.name}</p>}
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50">
        {quickLinks.map(({ section, label, description, icon: Icon }, i) => (
          <Link
            key={section}
            href={`/settings?section=${section}`}
            className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40 ${i !== quickLinks.length - 1 ? 'border-b border-border/40' : ''}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <CaretRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { user, session, signOut } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const t = useTranslations('settings.profile')

  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState<MediaAssetResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session?.accessToken) return
    let active = true
    getUserProfile(session.accessToken, { cache: 'no-store' })
      .then((data) => {
        if (!active) return
        setDisplayName(data.name ?? '')
        setAvatar(data.avatar ?? null)
      })
      .catch(() => { })
    return () => { active = false }
  }, [session?.accessToken])

  const handleSave = async () => {
    if (!session?.accessToken || !displayName.trim()) return
    setSaving(true)
    try {
      await updateUserProfile(session.accessToken, { name: displayName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // noop
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session?.accessToken) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError(t('avatar_type_error'))
      return
    }
    setAvatarError('')
    setUploadingAvatar(true)
    try {
      const asset = await uploadMediaAsset(session.accessToken, {
        kind: 'avatar',
        contentType: file.type,
        contentLength: file.size,
      }, file)
      setAvatar(asset)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : t('avatar_type_error'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const avatarUrl = getPreferredMediaUrl(avatar)
  const initials = displayName.trim()
    ? displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  return (
    <div className="space-y-6">
      <SectionHeader title={t('title')} description={t('description')} />

      <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-background/40 p-4">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={displayName || user?.email || 'Avatar'} width={72} height={72} className="h-[72px] w-[72px] rounded-full object-cover" unoptimized />
          ) : (
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-foreground text-lg font-medium text-background">{initials}</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('avatar_label')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('avatar_hint')}</p>
            <div className="mt-3 flex items-center gap-3">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                <UploadSimpleIcon className="h-4 w-4" />
                {uploadingAvatar ? t('uploading') : t('upload')}
              </Button>
              {avatarError && <span className="text-xs text-destructive">{avatarError}</span>}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-email">{t('email_label')}</Label>
          <Input id="settings-email" value={user?.email ?? ''} disabled className="bg-muted/40" />
          <p className="text-xs text-muted-foreground">{t('email_hint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">{t('name_label')}</Label>
          <Input id="settings-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('name_placeholder')} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || !displayName.trim()} size="sm">
            {saving ? t('saving') : t('save')}
          </Button>
          {saved && <span className="text-sm text-success">{t('saved')}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('sign_out_label')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('sign_out_description')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => signOut().then(() => router.push('/'))} className="gap-2">
            <SignOutIcon className="h-3.5 w-3.5" />
            {t('sign_out_button')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  const t = useTranslations('settings.security')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (newPassword !== confirmPassword) { setError(t('error_mismatch')); return }
    if (newPassword.length < 8) { setError(t('error_short')); return }
    setSuccess(true)
    setTimeout(() => {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setSuccess(false)
    }, 1500)
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={t('title')} description={t('description')} />
      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        <p className="mb-4 text-sm font-medium">{t('change_password')}</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {success && <p className="mb-3 text-sm text-success">{t('updated')}</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t('current_password')}</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t('new_password')}</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t('confirm_password')}</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <div className="pt-1">
            <Button type="submit" size="sm">{t('update')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  const t = useTranslations('settings.notifications')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [productUpdates, setProductUpdates] = useState(true)

  return (
    <div className="space-y-6">
      <SectionHeader title={t('title')} description={t('description')} />
      <div className="overflow-hidden rounded-xl border border-border/50">
        <ToggleRow id="email-notifications" label={t('email_label')} description={t('email_description')} checked={emailNotifications} onChange={setEmailNotifications} />
        <ToggleRow id="product-updates" label={t('updates_label')} description={t('updates_description')} checked={productUpdates} onChange={setProductUpdates} last />
      </div>
    </div>
  )
}

function ToggleRow({ id, label, description, checked, onChange, last }: {
  id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 bg-card/50 px-4 py-4 ${!last ? 'border-b border-border/40' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ─── Preferences ─────────────────────────────────────────────────────────────

function PreferencesSection() {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('settings.preferences')
  const locale = useLocale()
  const router = useRouter()
  const selectedTheme = (theme ?? defaultTheme) as AppTheme

  const localeOptions = [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'it', label: 'Italiano' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'da', label: 'Dansk' },
  ]

  const handleLocaleChange = (newLocale: string) => {
    router.replace('/settings?section=preferences', { locale: newLocale })
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={t('title')} description={t('description')} />
      <div className="overflow-hidden rounded-xl border border-border/50">
        <div className="flex items-center justify-between gap-4 border-b border-border/40 bg-card/50 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('appearance_label')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('appearance_description')}</p>
          </div>
          <Select value={selectedTheme} onValueChange={(value) => setTheme(value as AppTheme)}>
            <SelectTrigger className="min-w-[9.5rem]" aria-label={t('appearance_label')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themeOptions.map(({ value, labelKey }) => (
                <SelectItem key={value} value={value}>
                  {t(labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 bg-card/50 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('language_label')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('language_description')}</p>
          </div>
          <select
            value={locale}
            onChange={(e) => handleLocaleChange(e.target.value)}
            className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {localeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams()
  const activeSection = (searchParams.get('section') ?? 'overview') as SettingsSection
  const t = useTranslations('settings')

  return (
    <div className="max-w-xl">
      {activeSection === 'overview' && <OverviewSection />}
      {activeSection === 'plan' && (
        <div className="space-y-6">
          <SectionHeader title={t('plan.title')} description={t('plan.description')} />
          <SubscriptionCard />
        </div>
      )}
      {activeSection === 'profile' && <ProfileSection />}
      {activeSection === 'security' && <SecuritySection />}
      {activeSection === 'notifications' && <NotificationsSection />}
      {activeSection === 'preferences' && <PreferencesSection />}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
