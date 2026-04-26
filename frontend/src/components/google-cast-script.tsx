'use client'

import Script from 'next/script'

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void
  }
}

// nonce is sourced from middleware via headers().get('x-nonce') in the
// server component that renders this. Without it the CSP `script-src
// 'nonce-…' 'strict-dynamic'` policy will reject the loader.
export function GoogleCastScript({ nonce }: { nonce?: string }) {
  return (
    <Script
      id="google-cast-sdk"
      nonce={nonce}
      strategy="afterInteractive"
      src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
    />
  )
}
