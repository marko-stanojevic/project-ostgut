'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      await signUp(email, password)
      setSuccess(true)
      setTimeout(() => {
        router.push('/auth/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignup = async (provider: 'github' | 'google') => {
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth signup failed')
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="bg-slate-700 rounded-lg border border-slate-600 p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-3xl font-bold text-white mb-4">Check your email</h1>
          <p className="text-slate-300 mb-4">
            We&apos;ve sent you a confirmation link. Please verify your email to complete signup.
          </p>
          <p className="text-slate-400 text-sm">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-slate-700 rounded-lg border border-slate-600 p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Create Account</h1>

        {error && (
          <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
            <p className="text-xs text-slate-400 mt-1">At least 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-500"></div>
          <span className="text-slate-400 text-sm">Or continue with</span>
          <div className="flex-1 h-px bg-slate-500"></div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleOAuthSignup('github')}
            className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 rounded-lg transition"
          >
            GitHub
          </button>
          <button
            onClick={() => handleOAuthSignup('google')}
            className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 rounded-lg transition"
          >
            Google
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-slate-300 mb-2">Already have an account?</p>
          <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 transition">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  )
}
