'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'

/**
 * Returns whether the current user has admin privileges.
 * Fetched from the backend on mount and cached for the session lifetime.
 */
export function useAdminStatus() {
  const { session } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session?.accessToken) {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
      const response = await fetch(`${apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
      })

      if (!response.ok) {
        setIsAdmin(false)
        return
      }

      const data = await response.json()
      setIsAdmin(!!data.is_admin)
    } catch {
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    setLoading(true)
    void refresh()

    // Keep admin status in sync when roles are changed while the app is open.
    const interval = window.setInterval(() => {
      void refresh()
    }, 30000)

    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return { isAdmin, loading }
}
