'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function Home() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Navigation */}
      <nav className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-white">Project Ostgut</div>
          <div className="space-x-4">
            {user ? (
              <>
                <Link href="/dashboard" className="text-slate-300 hover:text-white transition">
                  Dashboard
                </Link>
                <Link href="/account" className="text-slate-300 hover:text-white transition">
                  Account
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-slate-300 hover:text-white transition">
                  Login
                </Link>
                <Link
                  href="/auth/signup"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-white mb-6">
          Build your SaaS faster
        </h1>
        <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
          A complete full-stack starter with Next.js frontend, Go backend, Auth.js authentication, and enterprise-ready infrastructure.
        </p>

        {!user && (
          <div className="space-x-4">
            <Link
              href="/auth/signup"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              Get Started Free
            </Link>
            <Link
              href="/auth/login"
              className="inline-block border-2 border-slate-400 text-white px-8 py-3 rounded-lg hover:border-white transition font-semibold"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-700 p-6 rounded-lg border border-slate-600">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold text-white mb-2">Next.js Frontend</h3>
            <p className="text-slate-300">
              Modern React with TypeScript, Tailwind CSS, and App Router for optimal performance.
            </p>
          </div>

          <div className="bg-slate-700 p-6 rounded-lg border border-slate-600">
            <div className="text-4xl mb-4">🔐</div>
            <h3 className="text-xl font-semibold text-white mb-2">Secure Auth</h3>
            <p className="text-slate-300">
              Auth.js authentication with email, password, and OAuth providers (GitHub, Google) built-in.
            </p>
          </div>

          <div className="bg-slate-700 p-6 rounded-lg border border-slate-600">
            <div className="text-4xl mb-4">⚙️</div>
            <h3 className="text-xl font-semibold text-white mb-2">Go Backend</h3>
            <p className="text-slate-300">
              High-performance REST API with JWT validation and automatic scaling.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-700 mt-20">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-slate-400">
          <p>&copy; 2024 Project Ostgut. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
