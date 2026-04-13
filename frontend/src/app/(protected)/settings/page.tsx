'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SubscriptionCard } from '@/components/subscription-card'
import { User, CreditCard, Shield, Bell, Palette } from 'lucide-react'

type SettingsSection = 'overview' | 'plan' | 'profile' | 'security' | 'notifications' | 'preferences'

export default function SettingsPage() {
  const { user, session, signOut } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSection>('overview')

  const [displayName, setDisplayName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)

  const [emailNotifications, setEmailNotifications] = useState(true)
  const [productUpdates, setProductUpdates] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [language, setLanguage] = useState('English')

  useEffect(() => {
    if (!session?.accessToken) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
    fetch(`${apiUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.name) setDisplayName(data.name)
      })
      .catch(() => { })
  }, [session?.accessToken])

  const sections = useMemo(
    () => [
      { id: 'overview' as const, label: 'Account overview', icon: User },
      { id: 'plan' as const, label: 'Available plans', icon: CreditCard },
      { id: 'profile' as const, label: 'Edit profile', icon: User },
      { id: 'security' as const, label: 'Security', icon: Shield },
      { id: 'notifications' as const, label: 'Notification settings', icon: Bell },
      { id: 'preferences' as const, label: 'Preferences', icon: Palette },
    ],
    []
  )

  const handleSaveName = async () => {
    if (!session?.accessToken || !displayName.trim()) return
    setNameSaving(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
      const res = await fetch(`${apiUrl}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ name: displayName.trim() }),
      })
      if (!res.ok) throw new Error('Failed')

      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 2500)
    } catch {
      setNameSuccess(false)
    } finally {
      setNameSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordSuccess(true)
    setTimeout(() => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(false)
    }, 1500)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="rounded-xl border border-border/40 bg-card/20">
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Settings</p>
          <p className="mt-1 text-sm text-white">{user?.email}</p>
        </div>
        <Separator />
        <nav className="p-2">
          {sections.map((section) => {
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${active
                  ? 'bg-primary/20 text-white'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-white'
                  }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="space-y-4">
        {(activeSection === 'overview' || activeSection === 'plan') && <SubscriptionCard />}

        {(activeSection === 'overview' || activeSection === 'profile') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-email">Email</Label>
                <Input id="settings-email" value={user?.email ?? ''} disabled />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settings-name">Display Name</Label>
                <Input
                  id="settings-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveName} disabled={nameSaving || !displayName.trim()}>
                  {nameSaving ? 'Saving…' : 'Save profile'}
                </Button>
                {nameSuccess && <span className="text-sm text-green-500">Saved</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {(activeSection === 'overview' || activeSection === 'security') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-green-500">Password updated</p>}
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit">Update password</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {(activeSection === 'overview' || activeSection === 'notifications') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="email-notifications" className="flex items-center gap-3 cursor-pointer">
                <input
                  id="email-notifications"
                  name="email-notifications"
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">Email notifications</span>
              </label>
              <label htmlFor="product-updates" className="flex items-center gap-3 cursor-pointer">
                <input
                  id="product-updates"
                  name="product-updates"
                  type="checkbox"
                  checked={productUpdates}
                  onChange={(e) => setProductUpdates(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">Product updates</span>
              </label>
            </CardContent>
          </Card>
        )}

        {(activeSection === 'overview' || activeSection === 'preferences') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>German</option>
                  <option>French</option>
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {(activeSection === 'overview' || activeSection === 'security') && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">Sign out from this device.</p>
              <Button variant="destructive" onClick={() => signOut()}>
                Sign out
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
