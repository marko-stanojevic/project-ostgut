const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const output = process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined

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
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  },
}

module.exports = withNextIntl(nextConfig)
