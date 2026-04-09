'use client'

import { useAuth } from '@/context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-8">Welcome back</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm mb-2">Account Status</p>
          <p className="text-2xl font-bold text-white">Active</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm mb-2">Email</p>
          <p className="text-lg font-semibold text-white truncate">{user?.email}</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm mb-2">Member Since</p>
          <p className="text-lg font-semibold text-white">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Quick Links</h2>
        <ul className="space-y-2 text-slate-300">
          <li>• <a href="/profile" className="text-blue-400 hover:text-blue-300">Edit your profile</a></li>
          <li>• <a href="/settings" className="text-blue-400 hover:text-blue-300">Manage settings</a></li>
          <li>• <a href="/account" className="text-blue-400 hover:text-blue-300">Account settings</a></li>
        </ul>
      </div>
    </div>
  )
}
