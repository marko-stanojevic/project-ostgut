const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const output = process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// Hosts allowed by the CSP `connect-src` and `media-src` directives. The API
// origin (audio metadata, JSON) and any blob storage / CDN that serves
// streams must be reachable. Add new origins explicitly when introducing new
// upstreams; do not relax to `*`.
const apiOrigin = (() => {
  try {
    return new URL(apiUrl).origin
  } catch {
    return ''
  }
})()

const connectSrc = [
  "'self'",
  apiOrigin,
  'https://*.blob.core.windows.net',
  'https://*.newrelic.com',
  'https://*.nr-data.net',
].filter(Boolean)

// Streaming radio is the product. `media-src` must allow arbitrary HTTPS
// origins because the catalog includes thousands of independent broadcasters
// hosted on heterogenous CDNs. Mixed-content / HTTP streams are blocked by
// the upgrade-insecure-requests directive.
const mediaSrc = ["'self'", 'https:', 'blob:']

const csp = [
  "default-src 'self'",
  // Next.js inlines hydration scripts; switch to nonces once we route every
  // <script> through next/script and can wire them through.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(' ')}`,
  `media-src ${mediaSrc.join(' ')}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(output ? { output } : {}),
  outputFileTracingIncludes: {
    '/**': ['./node_modules/@swc/helpers/**'],
  },
  async redirects() {
    return [
      {
        source: '/:locale/account',
        destination: '/:locale/settings',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
}

module.exports = withNextIntl(nextConfig)
