import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import type { JWT } from 'next-auth/jwt'
import { createHmac } from 'node:crypto'
import { authConfig } from './auth.config'
import type { Role } from '@/types/next-auth'
import {
  exchangeOAuthIdentity,
  loginWithPassword,
  refreshBackendTokens,
  revokeBackendRefreshToken,
  type BackendAuthResponse,
} from '@/lib/backend-auth-api'

/**
 * HMAC secret shared with the backend's OAUTH_SHARED_SECRET. The OAuth
 * exchange endpoint (`POST /auth/oauth`) is otherwise unauthenticated; the
 * signature proves the call originated from this Next.js process and not an
 * arbitrary HTTP client. Falls back to AUTH_SECRET in dev so the loop stays
 * frictionless; production sets OAUTH_SHARED_SECRET explicitly.
 */
const OAUTH_SHARED_SECRET = process.env.OAUTH_SHARED_SECRET || process.env.AUTH_SECRET || ''

/**
 * Refresh the access token at most this many milliseconds before its expiry.
 * Keeps a small buffer so a request issued *just before* the deadline doesn't
 * arrive at the backend with an already-expired token.
 */
const REFRESH_LEEWAY_MS = 60_000

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
        const data = await loginWithPassword(String(credentials.email ?? ''), String(credentials.password ?? ''))
        if (!data) return null
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
    async jwt({ token, user, account, profile }) {
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
          // Did the provider assert this email is verified? Google exposes
          // `email_verified` directly on the OIDC profile; GitHub's primary
          // email returned by the OAuth API is always verified, but the
          // `next-auth` GitHub provider only returns it on the profile when
          // it is confirmed. Anything else: treat as unverified and let the
          // backend reject the handshake.
          const oidcProfile = (profile ?? {}) as { email_verified?: boolean }
          const emailVerified =
            oidcProfile.email_verified === true || account.provider === 'github'

          const timestamp = Math.floor(Date.now() / 1000)
          const canonical = [
            account.provider,
            account.providerAccountId,
            token.email ?? '',
            String(emailVerified),
            String(timestamp),
          ].join('|')
          const signature = OAUTH_SHARED_SECRET
            ? createHmac('sha256', OAUTH_SHARED_SECRET).update(canonical).digest('hex')
            : ''

          const data = await exchangeOAuthIdentity({
            provider: account.provider,
            provider_id: account.providerAccountId,
            email: token.email,
            email_verified: emailVerified,
            name: token.name ?? '',
            timestamp,
            signature,
          })
          if (data) {
            applyAuthResponse(token, data)
          } else {
            token.error = 'oauth_exchange_failed'
          }
        } catch (err) {
          console.error('Failed to exchange OAuth identity for backend tokens:', err)
          token.error = 'oauth_exchange_failed'
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

      let refreshed: BackendAuthResponse | null = null
      try {
        refreshed = await refreshBackendTokens(token.refreshToken)
      } catch (err) {
        console.error('Failed to refresh backend access token:', err)
      }
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
        await revokeBackendRefreshToken(refreshToken)
      } catch (err) {
        console.error('Failed to revoke refresh token on sign-out:', err)
      }
    },
  },
})
