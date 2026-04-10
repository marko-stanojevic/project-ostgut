import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { SignJWT } from 'jose'

const getSecret = () => new TextEncoder().encode(process.env.AUTH_SECRET!)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    { ...GitHub({}), issuer: 'https://github.com/login/oauth' },
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const apiUrl = process.env.API_URL || 'http://localhost:8080'
        const res = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        })
        if (!res.ok) return null
        const user = await res.json()
        return { id: user.id, email: user.email, name: user.name ?? null }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && account.provider !== 'credentials') {
        // OAuth sign-in: upsert the user in the backend to get a stable UUID
        const apiUrl = process.env.API_URL || 'http://localhost:8080'
        const res = await fetch(`${apiUrl}/auth/oauth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: account.provider,
            provider_id: account.providerAccountId,
            email: token.email,
            name: token.name ?? '',
          }),
        })
        if (res.ok) {
          const backendUser = await res.json()
          token.id = backendUser.id
          token.email = backendUser.email
        }
      } else if (user) {
        token.id = user.id
        token.email = user.email
      }
      // Create a plain HS256 JWT for the Go backend to validate
      token.accessToken = await new SignJWT({
        sub: token.id as string,
        email: token.email,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(getSecret())
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
})
