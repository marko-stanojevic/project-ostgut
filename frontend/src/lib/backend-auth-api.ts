import type { Role } from '@/types/next-auth'
import { optionalString, requireNonEmptyString, requireRecord } from '@/lib/api-contract'

const API_URL = process.env.API_URL || 'http://localhost:8080'
const AUTH_CONTRACT = 'backend auth payload'

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
  const response = requireRecord(payload, 'auth response', AUTH_CONTRACT)
  const user = requireRecord(response.user, 'auth response.user', AUTH_CONTRACT)

  return {
    accessToken: requireNonEmptyString(response.accessToken, 'accessToken', AUTH_CONTRACT),
    accessTokenExpiresAt: requireDateString(response.accessTokenExpiresAt, 'accessTokenExpiresAt'),
    refreshToken: requireNonEmptyString(response.refreshToken, 'refreshToken', AUTH_CONTRACT),
    refreshTokenExpiresAt: requireDateString(response.refreshTokenExpiresAt, 'refreshTokenExpiresAt'),
    user: {
      id: requireNonEmptyString(user.id, 'user.id', AUTH_CONTRACT),
      email: requireNonEmptyString(user.email, 'user.email', AUTH_CONTRACT),
      name: optionalString(user.name, 'user.name', AUTH_CONTRACT),
      role: requireRole(user.role, 'user.role'),
    },
  }
}

function requireDateString(value: unknown, field: string): string {
  const date = requireNonEmptyString(value, field, AUTH_CONTRACT)
  if (!Number.isFinite(Date.parse(date))) {
    throw new Error(`Invalid ${AUTH_CONTRACT}: ${field} must be an ISO date string`)
  }

  return date
}

function requireRole(value: unknown, field: string): Role {
  if (value === 'user' || value === 'editor' || value === 'admin') {
    return value
  }

  throw new Error(`Invalid ${AUTH_CONTRACT}: ${field} must be user, editor, or admin`)
}
