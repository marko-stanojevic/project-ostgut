'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Sidebar Navigation */}
      <div className="fixed inset-y-0 left-0 w-64 bg-slate-800 border-r border-slate-700">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white">Project Ostgut</h2>
        </div>

        <nav className="mt-8 space-y-2 px-4">
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-slate-200 hover:bg-slate-700 rounded-lg transition"
          >
            Dashboard
          </Link>
          <Link
            href="/profile"
            className="block px-4 py-2 text-slate-200 hover:bg-slate-700 rounded-lg transition"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className="block px-4 py-2 text-slate-200 hover:bg-slate-700 rounded-lg transition"
          >
            Settings
          </Link>
          <Link
            href="/account"
            className="block px-4 py-2 text-slate-200 hover:bg-slate-700 rounded-lg transition"
          >
            Account
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 p-4">
          <div className="mb-4">
            <p className="text-slate-400 text-sm">Signed in as</p>
            <p className="text-white font-semibold truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64">
        <div className="px-8 py-6">
          {children}
        </div>
      </div>
    </div>
  )
}
