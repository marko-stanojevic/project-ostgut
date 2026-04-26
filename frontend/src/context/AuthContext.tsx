'use client'

import { createContext, useContext, useEffect } from 'react'
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import type { Role } from '@/types/next-auth'

interface AuthContextType {
  user: Session['user'] | null
  session: Session | null
  loading: boolean
  role: Role | null
  isAdmin: boolean
  isEditor: boolean
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const loading = status === 'loading'

  // If the backend refresh token is invalid (revoked or expired), the jwt
  // callback in lib/auth.ts stamps `error` on the session. Force a sign-out
  // so the user lands on the login screen instead of an authenticated UI
  // making 401-ing requests with a dead access token.
  useEffect(() => {
    if (session?.error) {
      nextAuthSignOut({ redirect: false }).catch((err) => {
        console.error('Auto sign-out after refresh failure failed:', err)
      })
    }
  }, [session?.error])

  const signUp = async (email: string, password: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
    const res = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Signup failed')
    }
  }

  const signIn = async (email: string, password: string) => {
    const result = await nextAuthSignIn('credentials', {
      email,
      password,
      redirect: false,
    })
    if (result?.error) {
      throw new Error('Invalid email or password')
    }
  }

  const signOut = async () => {
    await nextAuthSignOut({ redirect: false })
  }

  const role = (session?.user?.role as Role | undefined) ?? null
  const isAdmin = role === 'admin'
  // Editors and admins both access the editor surface (catalog management).
  // Admin-only operations gate themselves separately on isAdmin.
  const isEditor = role === 'editor' || role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session: session ?? null,
        loading,
        role,
        isAdmin,
        isEditor,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
