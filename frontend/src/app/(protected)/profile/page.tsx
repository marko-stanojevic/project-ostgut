'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function ProfilePage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSave = async () => {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-8">Profile</h1>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-2xl">
        {saveSuccess && (
          <div className="bg-green-500 bg-opacity-20 border border-green-500 text-green-200 px-4 py-3 rounded-lg mb-6">
            Profile updated successfully!
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Email
          </label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
          />
          <p className="text-xs text-slate-500 mt-1">Email cannot be changed here</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            placeholder="Your name"
          />
        </div>

        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
        >
          Save Changes
        </button>
      </div>
    </div>
  )
}
