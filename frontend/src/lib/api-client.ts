import { supabase } from './supabase'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

async function apiRequest<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`

  // Get current session to extract JWT token
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers = new Headers({
    'Content-Type': 'application/json',
    ...options?.headers,
  })

  // Add JWT token to Authorization header if available
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      errorData.error || errorData.message || `API error: ${response.statusText}`
    )
  }

  return response.json()
}

export const apiClient = {
  health: {
    check: () => apiRequest('/health'),
  },
  auth: {
    verify: (token: string) =>
      apiRequest('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  },
  users: {
    getProfile: () => apiRequest('/users/me'),
    updateProfile: (data: any) =>
      apiRequest('/users/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
}

