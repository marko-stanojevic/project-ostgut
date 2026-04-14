'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SubscriptionCard } from '@/components/subscription-card'
import {
  UserIcon,
  CreditCardIcon,
  ShieldIcon,
  BellIcon,
  PaletteIcon,
  CaretRightIcon,
  SignOutIcon,
  SunIcon,
  MoonIcon,
} from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

type SettingsSection = 'overview' | 'plan' | 'profile' | 'security' | 'notifications' | 'preferences'

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewSection() {
  const { user } = useAuth()

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  const quickLinks = [
    { section: 'profile', label: 'Profile', description: 'Display name', icon: UserIcon },
    { section: 'plan', label: 'Plan', description: 'Subscription & billing', icon: CreditCardIcon },
    { section: 'security', label: 'Security', description: 'Password', icon: ShieldIcon },
    { section: 'notifications', label: 'Notifications', description: 'Email preferences', icon: BellIcon },
    { section: 'preferences', label: 'Preferences', description: 'Language & appearance', icon: PaletteIcon },
  ]

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-base font-medium text-background">
          {initials}
        </div>
        <div className="min-w-0">
          {user?.name && <p className="truncate font-medium">{user.name}</p>}
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {/* Quick nav */}
      <div className="overflow-hidden rounded-xl border border-border/50">
        {quickLinks.map(({ section, label, description, icon: Icon }, i) => (
          <Link
            key={section}
            href={`/settings?section=${section}`}
            className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40 ${
              i !== quickLinks.length - 1 ? 'border-b border-border/40' : ''
            }`}
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

  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session?.accessToken) return
    fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((data) => { if (data.name) setDisplayName(data.name) })
      .catch(() => {})
  }, [session?.accessToken])

  const handleSave = async () => {
    if (!session?.accessToken || !displayName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ name: displayName.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // noop
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Profile" description="Your public identity on bougie.fm." />

      <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-email">Email</Label>
          <Input id="settings-email" value={user?.email ?? ''} disabled className="bg-muted/40" />
          <p className="text-xs text-muted-foreground">Your email cannot be changed.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Display name</Label>
          <Input
            id="settings-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || !displayName.trim()} size="sm">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && <span className="text-sm text-green-500">Saved</span>}
        </div>
      </div>

      {/* Sign out — belongs here, not in a "danger zone" */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Sign out from this device.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut().then(() => router.push('/'))}
            className="gap-2"
          >
            <SignOutIcon className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setSuccess(true)
    setTimeout(() => {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setSuccess(false)
    }, 1500)
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Security" description="Manage your password and account access." />

      <div className="rounded-xl border border-border/50 bg-card/50 p-5">
        <p className="mb-4 text-sm font-medium">Change password</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {success && <p className="mb-3 text-sm text-green-500">Password updated</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <div className="pt-1">
            <Button type="submit" size="sm">Update password</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [productUpdates, setProductUpdates] = useState(true)

  return (
    <div className="space-y-6">
      <SectionHeader title="Notifications" description="Choose what you hear from us." />

      <div className="overflow-hidden rounded-xl border border-border/50">
        <ToggleRow
          id="email-notifications"
          label="Email notifications"
          description="Receive important account and activity emails."
          checked={emailNotifications}
          onChange={setEmailNotifications}
        />
        <ToggleRow
          id="product-updates"
          label="Product updates"
          description="New features, improvements, and announcements."
          checked={productUpdates}
          onChange={setProductUpdates}
          last
        />
      </div>
    </div>
  )
}

function ToggleRow({ id, label, description, checked, onChange, last }: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  last?: boolean
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
  const { resolvedTheme, setTheme } = useTheme()
  const [language, setLanguage] = useState('English')
  const isDark = resolvedTheme === 'dark'

  return (
    <div className="space-y-6">
      <SectionHeader title="Preferences" description="Personalise your experience." />

      <div className="overflow-hidden rounded-xl border border-border/50">
        {/* Appearance */}
        <div className="flex items-center justify-between gap-4 border-b border-border/40 bg-card/50 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Appearance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Switch between light and dark mode.</p>
          </div>
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium transition-colors hover:bg-secondary/80"
          >
            {isDark
              ? <><SunIcon className="h-3.5 w-3.5" />Light</>
              : <><MoonIcon className="h-3.5 w-3.5" />Dark</>
            }
          </button>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between gap-4 bg-card/50 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Language</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose your preferred language.</p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option>English</option>
            <option>Spanish</option>
            <option>German</option>
            <option>French</option>
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

  return (
    <div className="max-w-xl">
      {activeSection === 'overview' && <OverviewSection />}
      {activeSection === 'plan' && (
        <div className="space-y-6">
          <SectionHeader title="Plan" description="Manage your subscription and billing." />
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
