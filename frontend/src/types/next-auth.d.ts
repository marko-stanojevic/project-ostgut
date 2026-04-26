import { DefaultSession } from 'next-auth'

export type Role = 'user' | 'editor' | 'admin'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    error?: 'refresh_failed' | 'no_refresh_token' | 'oauth_exchange_failed'
    user: {
      id: string
      role: Role
    } & DefaultSession['user']
  }

  interface User {
    accessToken?: string
    accessTokenExpiresAt?: number
    refreshToken?: string
    refreshTokenExpiresAt?: number
    role?: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    accessToken?: string
    /** Unix epoch milliseconds when the access token expires. */
    accessTokenExpiresAt?: number
    refreshToken?: string
    /** Unix epoch milliseconds when the refresh token expires. */
    refreshTokenExpiresAt?: number
    role?: Role
    error?: 'refresh_failed' | 'no_refresh_token' | 'oauth_exchange_failed'
  }
}
