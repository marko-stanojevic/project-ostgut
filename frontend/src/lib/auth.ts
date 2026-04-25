import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import type { JWT } from 'next-auth/jwt'
import { authConfig } from './auth.config'
import type { Role } from '@/types/next-auth'

const API_URL = process.env.API_URL || 'http://localhost:8080'

/**
 * Refresh the access token at most this many milliseconds before its expiry.
 * Keeps a small buffer so a request issued *just before* the deadline doesn't
 * arrive at the backend with an already-expired token.
 */
const REFRESH_LEEWAY_MS = 60_000

type BackendAuthResponse = {
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
  user: {
    id: string
    email: string
    name?: string | null
    role: Role
  }
}

function applyAuthResponse(token: JWT, data: BackendAuthResponse): JWT {
  token.id = data.user.id
  token.email = data.user.email
  token.name = data.user.name ?? token.name
  token.role = data.user.role
  token.accessToken = data.accessToken
  token.accessTokenExpiresAt = Date.parse(data.accessTokenExpiresAt)
  token.refreshToken = data.refreshToken
  token.refreshTokenExpiresAt = Date.parse(data.refreshTokenExpiresAt)
  delete token.error
  return token
}

async function refreshBackendTokens(refreshToken: string): Promise<BackendAuthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as BackendAuthResponse
  } catch (err) {
    console.error('Failed to refresh backend access token:', err)
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google,
    GitHub,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        })
        if (!res.ok) return null
        const data = (await res.json()) as BackendAuthResponse
        // Stash the backend tokens on the NextAuth user; the jwt callback
        // copies them onto the session token below.
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? null,
          role: data.user.role,
          accessToken: data.accessToken,
          accessTokenExpiresAt: Date.parse(data.accessTokenExpiresAt),
          refreshToken: data.refreshToken,
          refreshTokenExpiresAt: Date.parse(data.refreshTokenExpiresAt),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial credentials sign-in: copy fields stashed in authorize().
      if (user && (user as { accessToken?: string }).accessToken) {
        const u = user as {
          id: string
          accessToken: string
          accessTokenExpiresAt: number
          refreshToken: string
          refreshTokenExpiresAt: number
          role: Role
        }
        token.id = u.id
        token.role = u.role
        token.accessToken = u.accessToken
        token.accessTokenExpiresAt = u.accessTokenExpiresAt
        token.refreshToken = u.refreshToken
        token.refreshTokenExpiresAt = u.refreshTokenExpiresAt
        delete token.error
        return token
      }

      // Initial OAuth sign-in: exchange provider identity for backend tokens.
      if (account && account.provider !== 'credentials') {
        try {
          const res = await fetch(`${API_URL}/auth/oauth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: account.provider,
              provider_id: account.providerAccountId,
              email: token.email,
              name: token.name ?? '',
            }),
            signal: AbortSignal.timeout(10_000),
          })
          if (res.ok) {
            const data = (await res.json()) as BackendAuthResponse
            applyAuthResponse(token, data)
          }
        } catch (err) {
          console.error('Failed to exchange OAuth identity for backend tokens:', err)
        }
        return token
      }

      // Subsequent calls: return as-is while the access token is still fresh.
      const expiresAt = token.accessTokenExpiresAt ?? 0
      if (Date.now() < expiresAt - REFRESH_LEEWAY_MS) {
        return token
      }

      // Access token expired (or about to). Try a refresh.
      if (!token.refreshToken) {
        token.error = 'no_refresh_token'
        return token
      }

      const refreshed = await refreshBackendTokens(token.refreshToken)
      if (!refreshed) {
        token.error = 'refresh_failed'
        // Wipe the refresh token to prevent re-trying every request — the
        // user must sign in again.
        delete token.refreshToken
        delete token.accessToken
        return token
      }
      return applyAuthResponse(token, refreshed)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.error = token.error
      if (session.user) {
        if (token.id) session.user.id = token.id
        session.user.role = (token.role as Role | undefined) ?? 'user'
      }
      return session
    },
  },
  events: {
    async signOut(message) {
      // NextAuth supports two shapes for the signOut event payload:
      //   - JWT strategy: { token }
      //   - DB session:   { session }
      // We use JWT strategy, so destructure defensively.
      const refreshToken =
        'token' in message ? (message.token?.refreshToken as string | undefined) : undefined
      if (!refreshToken) return
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: AbortSignal.timeout(5_000),
          cache: 'no-store',
        })
      } catch (err) {
        console.error('Failed to revoke refresh token on sign-out:', err)
      }
    },
  },
})
