'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const router = useRouter()
  const { signIn: credentialsSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await credentialsSignIn(email, password)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    try {
      await signIn(provider, { callbackUrl: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth login failed')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-slate-700 rounded-lg border border-slate-600 p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Sign In</h1>

        {error && (
          <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-200 mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-500"></div>
          <span className="text-slate-400 text-sm">Or continue with</span>
          <div className="flex-1 h-px bg-slate-500"></div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleOAuthLogin('google')}
            className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 rounded-lg transition"
          >
            Google
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-slate-300 mb-2">Don&apos;t have an account?</p>
          <Link href="/auth/signup" className="text-blue-400 hover:text-blue-300 transition">
            Sign up here
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link href="/auth/forgot-password" className="text-slate-400 hover:text-slate-300 text-sm transition">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  )
}
