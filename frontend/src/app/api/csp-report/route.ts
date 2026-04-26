import { NextRequest, NextResponse } from 'next/server'

// CSP violation reports land here. The browser POSTs either a legacy
// `application/csp-report` body (Reports API draft) or the newer
// `application/reports+json` array-of-reports shape. We log whichever
// arrives and rely on the platform log aggregator to alert on volume.
//
// This endpoint intentionally never throws — a 400 from the report sink
// becomes its own browser-side warning loop, drowning out the real signal.
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    if (text) {
      // Cap length so a hostile origin can't flood logs with megabyte bodies.
      const payload = text.length > 4096 ? `${text.slice(0, 4096)}…[truncated]` : text
      // Single-line JSON keeps it greppable in container log tails.
      console.warn(
        JSON.stringify({
          msg: 'csp_violation',
          ua: req.headers.get('user-agent') ?? '',
          ct: req.headers.get('content-type') ?? '',
          body: payload,
        }),
      )
    }
  } catch {
    // Swallow — see comment above.
  }
  return new NextResponse(null, { status: 204 })
}
