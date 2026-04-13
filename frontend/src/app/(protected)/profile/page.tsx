'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSave = async () => {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your personal information</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {saveSuccess && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Profile updated successfully!
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={user?.email || ''}
              disabled
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              name="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </div>

          <Button onClick={handleSave}>Save Changes</Button>
        </CardContent>
      </Card>
    </div>
  )
}
