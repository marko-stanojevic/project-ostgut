'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'

const CACHE_TTL_MS = 5 * 60 * 1000

let cachedToken: string | null = null
let cachedIsAdmin: boolean | null = null
let cachedAt = 0
let inflightRequest: Promise<boolean> | null = null

/**
 * Returns whether the current user has admin privileges.
 * Fetched from the backend on mount and cached for the session lifetime.
 */
export function useAdminStatus() {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (force = false) => {
    if (!accessToken) {
      cachedToken = null
      cachedIsAdmin = null
      cachedAt = 0
      setIsAdmin(false)
      setLoading(false)
      return
    }

    const now = Date.now()
    const cacheValid =
      !force &&
      cachedToken === accessToken &&
      cachedIsAdmin !== null &&
      now - cachedAt < CACHE_TTL_MS

    if (cacheValid) {
      setIsAdmin(cachedIsAdmin)
      setLoading(false)
      return
    }

    if (inflightRequest && cachedToken === accessToken) {
      try {
        const result = await inflightRequest
        setIsAdmin(result)
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
      cachedToken = accessToken
      inflightRequest = fetch(`${apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }).then(async (response) => {
        if (!response.ok) return false
        const data = await response.json()
        return !!data.is_admin
      })

      const nextIsAdmin = await inflightRequest
      cachedIsAdmin = nextIsAdmin
      cachedAt = Date.now()
      setIsAdmin(nextIsAdmin)
    } catch {
      cachedIsAdmin = false
      cachedAt = Date.now()
      setIsAdmin(false)
    } finally {
      inflightRequest = null
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    setLoading(true)
    void refresh()

    // Keep admin status in sync eventually without frequent background traffic.
    const interval = window.setInterval(() => {
      void refresh(true)
    }, CACHE_TTL_MS)

    const onFocus = () => {
      void refresh(true)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return { isAdmin, loading }
}
