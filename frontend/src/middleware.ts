import createIntlMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const handleI18n = createIntlMiddleware(routing)

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

const authPaths = [
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
]

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

function getLocaleFromPath(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) return locale
  }
  return routing.defaultLocale
}

function hasSessionToken(req: NextRequest): boolean {
  return req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token')
}

export default function middleware(req: NextRequest) {
  const isAuthenticated = hasSessionToken(req)
  const { pathname } = req.nextUrl

  const locale = getLocaleFromPath(pathname)
  const localePath = `/${locale}`
  const pathWithoutLocale = stripLocale(pathname)

  const isProtected = protectedPrefixes.some((p) => pathWithoutLocale.startsWith(p))
  const isAuthPage = authPaths.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'))

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL(`${localePath}/auth/login`, req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL(`${localePath}/curated`, req.url))
  }

  return handleI18n(req)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
