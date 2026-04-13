'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [apiAccess, setApiAccess] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your preferences</p>
      </div>

      <div className="space-y-4 max-w-2xl">
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
            <label htmlFor="api-access-notifications" className="flex items-center gap-3 cursor-pointer">
              <input
                id="api-access-notifications"
                name="api-access-notifications"
                type="checkbox"
                checked={apiAccess}
                onChange={(e) => setApiAccess(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">API access notifications</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <select
                id="language"
                name="language"
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

        <Button>Save Settings</Button>
      </div>
    </div>
  )
}
