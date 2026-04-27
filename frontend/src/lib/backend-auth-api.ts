import type { Role } from '@/types/next-auth'

const API_URL = process.env.API_URL || 'http://localhost:8080'

type BackendAuthUser = {
  id: string
  email: string
  name?: string | null
  role: Role
}

export type BackendAuthResponse = {
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
  user: BackendAuthUser
}

export type BackendOAuthPayload = {
  provider: string
  provider_id: string
  email?: string | null
  email_verified: boolean
  name: string
  timestamp: number
  signature: string
}

export async function loginWithPassword(email: string, password: string) {
  return postBackendAuth('/auth/login', { email, password })
}

export async function refreshBackendTokens(refreshToken: string) {
  return postBackendAuth('/auth/refresh', { refreshToken }, { cache: 'no-store' })
}

export async function exchangeOAuthIdentity(payload: BackendOAuthPayload) {
  return postBackendAuth('/auth/oauth', payload)
}

export async function revokeBackendRefreshToken(refreshToken: string) {
  await postBackendAuthRequest('/auth/logout', { refreshToken }, { cache: 'no-store', timeoutMs: 5_000 })
}

async function postBackendAuth(path: string, body: unknown, options: { cache?: RequestCache; timeoutMs?: number } = {}) {
  const response = await postBackendAuthRequest(path, body, options)
  if (!response.ok) {
    return null
  }

  return parseBackendAuthResponse(await response.json())
}

function postBackendAuthRequest(path: string, body: unknown, options: { cache?: RequestCache; timeoutMs?: number } = {}) {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    cache: options.cache,
  })
}

function parseBackendAuthResponse(payload: unknown): BackendAuthResponse {
  const response = requireRecord(payload, 'auth response')
  const user = requireRecord(response.user, 'auth response.user')

  return {
    accessToken: requireString(response.accessToken, 'accessToken'),
    accessTokenExpiresAt: requireDateString(response.accessTokenExpiresAt, 'accessTokenExpiresAt'),
    refreshToken: requireString(response.refreshToken, 'refreshToken'),
    refreshTokenExpiresAt: requireDateString(response.refreshTokenExpiresAt, 'refreshTokenExpiresAt'),
    user: {
      id: requireString(user.id, 'user.id'),
      email: requireString(user.email, 'user.email'),
      name: optionalString(user.name, 'user.name'),
      role: requireRole(user.role, 'user.role'),
    },
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid backend auth payload: ${field} must be an object`)
  }

  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid backend auth payload: ${field} must be a non-empty string`)
  }

  return value
}

function optionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }

  return requireString(value, field)
}

function requireDateString(value: unknown, field: string): string {
  const date = requireString(value, field)
  if (!Number.isFinite(Date.parse(date))) {
    throw new Error(`Invalid backend auth payload: ${field} must be an ISO date string`)
  }

  return date
}

function requireRole(value: unknown, field: string): Role {
  if (value === 'user' || value === 'editor' || value === 'admin') {
    return value
  }

  throw new Error(`Invalid backend auth payload: ${field} must be user, editor, or admin`)
}
