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

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').origin
  } catch {
    return ''
  }
})()

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

/**
 * Build the Content-Security-Policy header for an HTML response.
 *
 * The nonce is generated per-request and threaded into `script-src` so
 * Next.js's hydration-data inline scripts (and our own `<Script>` tags)
 * can execute, while any attacker-injected `<script>` cannot. `'strict-dynamic'`
 * lets the nonced root loader pull additional scripts (Next.js chunks,
 * Google Cast SDK, New Relic agent) without needing to nonce each one.
 *
 * Style-src still allows 'unsafe-inline' because Next.js streams a small
 * inline style for SSR; styles cannot execute code so the risk is
 * exfiltration via attribute selectors only — fix in a follow-up.
 *
 * Static, non-nonced headers (HSTS, X-Frame-Options, COOP, CORP, Permissions-
 * Policy) are still set in `next.config.js` because they don't need to vary
 * per request.
 */
function buildCSP(nonce: string): string {
  const connectSrc = [
    "'self'",
    apiOrigin,
    'https://*.blob.core.windows.net',
    // New Relic browser agent (loader + beacon).
    'https://*.nr-data.net',
    'https://*.newrelic.com',
    'https://js-agent.newrelic.com',
  ].filter(Boolean)

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "media-src 'self' https: blob:",
    // Google Cast SDK loads a hidden iframe to bridge to the receiver app.
    "frame-src 'self' https://www.gstatic.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

function generateNonce(): string {
  // 16 bytes of CSPRNG entropy → 24 base64 chars. Sufficient to make
  // guessing computationally infeasible within the lifetime of a response.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export default function middleware(req: NextRequest) {
  const isAuthenticated = hasSessionToken(req)
  const { pathname } = req.nextUrl

  const locale = getLocaleFromPath(pathname)
  const localePath = `/${locale}`
  const pathWithoutLocale = stripLocale(pathname)

  const isProtected = protectedPrefixes.some((p) => pathWithoutLocale.startsWith(p))
  const isAuthPage = authPaths.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'),
  )

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL(`${localePath}/auth/login`, req.url)
    // Only echo the path back as callbackUrl — never an absolute URL,
    // schema-relative URL, or anything that could redirect off-origin
    // after sign-in. `pathname` is always origin-relative here, but be
    // explicit so a future refactor doesn't reintroduce the open redirect.
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      loginUrl.searchParams.set('callbackUrl', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL(`${localePath}/curated`, req.url))
  }

  // Generate a per-request nonce and stamp it onto BOTH the request headers
  // (so server components can read it via `headers().get('x-nonce')` and
  // forward it to inline `<Script>` tags) and the response CSP (so the
  // browser only executes scripts carrying that nonce).
  const nonce = generateNonce()
  const csp = buildCSP(nonce)

  // `Headers` is mutable; mutating req.headers makes the value visible to
  // server components further down the stack. next-intl reads from req
  // and emits a NextResponse we then decorate with the response CSP.
  req.headers.set('x-nonce', nonce)

  const res = handleI18n(req)
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
