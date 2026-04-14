'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SubscriptionCard } from '@/components/subscription-card'

type SettingsSection = 'overview' | 'plan' | 'profile' | 'security' | 'notifications' | 'preferences'

function SettingsContent() {
  const { user, session, signOut } = useAuth()
  const searchParams = useSearchParams()
  const activeSection = (searchParams.get('section') ?? 'overview') as SettingsSection

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
      .then((data) => { if (data.name) setDisplayName(data.name) })
      .catch(() => {})
  }, [session?.accessToken])

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
    <div className="max-w-2xl space-y-6">
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
            <label htmlFor="email-notifications" className="flex cursor-pointer items-center gap-3">
              <input id="email-notifications" name="email-notifications" type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="h-4 w-4 rounded border-input" />
              <span className="text-sm">Email notifications</span>
            </label>
            <label htmlFor="product-updates" className="flex cursor-pointer items-center gap-3">
              <input id="product-updates" name="product-updates" type="checkbox" checked={productUpdates} onChange={(e) => setProductUpdates(e.target.checked)} className="h-4 w-4 rounded border-input" />
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
            <Button variant="destructive" onClick={() => signOut()}>Sign out</Button>
          </CardContent>
        </Card>
      )}
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
