'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [apiAccess, setApiAccess] = useState(false)

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-8">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        {/* Notifications */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Notifications</h2>

          <div className="space-y-4">
            <label htmlFor="email-notifications" className="flex items-center cursor-pointer">
              <input
                id="email-notifications"
                name="email-notifications"
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="ml-3 text-slate-300">Email notifications</span>
            </label>

            <label htmlFor="api-access-notifications" className="flex items-center cursor-pointer">
              <input
                id="api-access-notifications"
                name="api-access-notifications"
                type="checkbox"
                checked={apiAccess}
                onChange={(e) => setApiAccess(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="ml-3 text-slate-300">API access notifications</span>
            </label>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Preferences</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="theme" className="block text-sm font-medium text-slate-200 mb-2">
                Theme
              </label>
              <select id="theme" name="theme" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                <option>Dark (Default)</option>
                <option>Light</option>
              </select>
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium text-slate-200 mb-2">
                Language
              </label>
              <select id="language" name="language" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                <option>English</option>
                <option>Spanish</option>
                <option>German</option>
                <option>French</option>
              </select>
            </div>
          </div>
        </div>

        <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition">
          Save Settings
        </button>
      </div>
    </div>
  )
}
