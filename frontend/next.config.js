const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const output = process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// Static security headers. Content-Security-Policy is set per-request from
// `src/middleware.ts` so it can include a fresh nonce; the rest of the
// hardening suite has no per-request component and lives here.
const securityHeaders = [
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
  typedRoutes: true,
  cacheComponents: true,
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
