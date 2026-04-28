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
 * can execute, while any attacker-injected `<script>` cannot.
 *
 * We intentionally avoid `'strict-dynamic'` here because prerendered pages emit
 * static framework chunk tags at build time without per-request nonces. With
 * `'strict-dynamic'`, modern browsers ignore host allowlists like `'self'`,
 * which blocks those Next.js chunk scripts on otherwise-valid prerendered pages.
 * Instead, keep an explicit allowlist for the small set of trusted script
 * origins we actually use.
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
    // Client-resolved metadata fetches read CORS-capable radio stream hosts.
    'https:',
    // New Relic browser agent (loader + beacon).
    'https://*.nr-data.net',
    'https://*.newrelic.com',
    'https://js-agent.newrelic.com',
  ].filter(Boolean)
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // Next.js emits a tiny inline runtime-timing bootstrap in prerendered HTML.
    // Allow only that exact script body instead of broad inline execution.
    "'sha256-C9/xixy512Y4fp7xTu377DO0r1bL13cI45EIwSYf8Is='",
    process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : '',
    // Trusted third-party script origins used by the app.
    'https://js-agent.newrelic.com',
    'https://www.gstatic.com',
  ].filter(Boolean)

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
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
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
    // Violation reports — both legacy `report-uri` (broad browser support)
    // and the modern Reports API (`report-to` + Reporting-Endpoints header
    // set below). Browsers prefer report-to when both are present.
    'report-uri /api/csp-report',
    "report-to csp-endpoint",
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

function getOverrideKeys(responseHeaders: Headers): string[] {
  return (
    responseHeaders
      .get('x-middleware-override-headers')
      ?.split(',')
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean) ?? []
  )
}

function forwardRequestOverrides(response: NextResponse, overrides: Map<string, string>) {
  const keys = [...overrides.keys()]

  for (const key of keys) {
    response.headers.set(`x-middleware-request-${key}`, overrides.get(key) ?? '')
  }
  response.headers.set('x-middleware-override-headers', keys.join(','))
}

export function proxy(req: NextRequest) {
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

  // Generate a per-request nonce and forward it using Next's middleware
  // request-header override protocol so server components can read it via
  // `headers().get('x-nonce')` without mutating the incoming request object.
  const nonce = generateNonce()
  const csp = buildCSP(nonce)

  const res = handleI18n(req)
  const requestOverrides = new Map<string, string>()
  for (const key of getOverrideKeys(res.headers)) {
    const value = res.headers.get(`x-middleware-request-${key}`)
    if (value !== null) requestOverrides.set(key, value)
  }
  // Next.js reads the CSP from the request during render to decide which
  // nonce to stamp onto its own framework/hydration scripts.
  requestOverrides.set('content-security-policy', csp)
  requestOverrides.set('x-nonce', nonce)
  forwardRequestOverrides(res, requestOverrides)

  res.headers.set('Content-Security-Policy', csp)
  // Reporting-Endpoints declares the named group referenced by `report-to`
  // in the CSP above. Same path the legacy `report-uri` posts to.
  res.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"')
  return res
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|api/).*)'],
}
