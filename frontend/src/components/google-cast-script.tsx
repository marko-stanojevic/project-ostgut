'use client'

import Script from 'next/script'

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void
  }
}

export function GoogleCastScript() {
  return (
    <Script
      id="google-cast-sdk"
      strategy="afterInteractive"
      src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
    />
  )
}
