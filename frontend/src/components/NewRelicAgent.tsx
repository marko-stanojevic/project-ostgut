"use client"

import Script from "next/script"

const accountId = process.env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID
const applicationId = process.env.NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID
const licenseKey = process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY
const trustKey = process.env.NEXT_PUBLIC_NEW_RELIC_TRUST_KEY
const agentId = process.env.NEXT_PUBLIC_NEW_RELIC_AGENT_ID

// nonce is sourced from middleware via headers().get('x-nonce') in the
// server component that renders this. CSP requires every <script> tag to
// carry the per-request nonce, otherwise the browser refuses to execute it.
export function NewRelicAgent({ nonce }: { nonce?: string }) {
  if (!accountId || !applicationId || !licenseKey || !trustKey || !agentId) {
    console.warn("[NR] browser agent disabled — one or more env vars missing")
    return null
  }

  const config =
    `window.NREUM||(NREUM={});` +
    `NREUM.init=${JSON.stringify({ distributed_tracing: { enabled: true }, privacy: { cookies_enabled: true }, ajax: { deny_list: ["bam.eu01.nr-data.net"] } })};` +
    `NREUM.info=${JSON.stringify({ beacon: "bam.eu01.nr-data.net", errorBeacon: "bam.eu01.nr-data.net", licenseKey, applicationID: applicationId, sa: 1 })};` +
    `NREUM.loader_config=${JSON.stringify({ accountID: accountId, trustKey, agentID: agentId, licenseKey, applicationID: applicationId })};` +
    `console.log("[NR] config injected", { accountId: "${accountId}", applicationId: "${applicationId}" });`

  return (
    <>
      <Script
        id="nr-init"
        nonce={nonce}
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: config }}
      />
      <Script
        id="nr-agent"
        nonce={nonce}
        strategy="afterInteractive"
        src="https://js-agent.newrelic.com/nr-loader-spa-current.min.js"
        onLoad={() => console.log("[NR] browser agent loaded")}
        onError={() => console.error("[NR] browser agent failed to load — check network tab for the CDN script")}
      />
    </>
  )
}
