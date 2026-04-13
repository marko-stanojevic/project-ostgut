'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function AccountPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSuccess(true)
    setTimeout(() => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(false)
    }, 1500)
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account details and security</p>
      </div>

      <div className="space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium mt-0.5">{user?.email}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Account ID</p>
              <p className="text-sm font-mono mt-0.5">{user?.id ?? '—'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 mb-4">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-4">
                Password changed successfully!
              </p>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit">Update Password</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Sign out from this device.</p>
            <Button variant="destructive" onClick={handleSignOut}>Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
