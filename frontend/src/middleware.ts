import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth(function middleware(req) {
  const isAuthenticated = !!req.auth?.user?.email
  const { pathname } = req.nextUrl

  const protectedPrefixes = [
    '/curated',
    '/explore',
    '/profile',
    '/stations',
    '/account',
    '/shows',
    '/talks',
    '/settings',
    '/dashboard',
  ]
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password']

  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
  const isAuthRoute = authRoutes.includes(pathname)

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/auth/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/', req.url))
  }
})

export const config = {
  matcher: [
    '/curated/:path*',
    '/explore/:path*',
    '/profile/:path*',
    '/stations/:path*',
    '/account/:path*',
    '/shows/:path*',
    '/talks/:path*',
    '/settings/:path*',
    '/dashboard/:path*',
    '/auth/login',
    '/auth/signup',
    '/auth/forgot-password',
    '/auth/reset-password',
  ],
}
