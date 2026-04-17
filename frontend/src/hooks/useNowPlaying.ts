'use client'

import { useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// While metadata is flowing, poll often.
const FAST_MS = 30_000
// After consecutive misses, back off to avoid pointless traffic.
const SLOW_MS = 3 * 60_000
// Switch to slow after this many consecutive fast-poll misses.
const MAX_FAST_MISSES = 3
// Give up entirely after this many consecutive slow-poll misses.
const MAX_SLOW_MISSES = 2

export interface NowPlaying {
  title: string
  artist?: string
  song?: string
  source: string
  supported: boolean
  status: 'ok' | 'unsupported' | 'disabled' | 'error'
  error?: string
}

/**
 * Polls GET /stations/:id/now-playing while the station is active.
 *
 * Polling strategy:
 *   - Fast (30 s) while metadata is being received.
 *   - Backs off to slow (3 min) after MAX_FAST_MISSES consecutive empty responses.
 *   - Stops entirely after MAX_SLOW_MISSES consecutive slow-poll misses.
 *   - Resets on station change.
 *
 * This means a stream that never returns metadata (e.g. KEXP) will generate
 * ~5 requests over ~7.5 minutes then go silent for the rest of the session.
 */
export function useNowPlaying(
  stationId: string | null | undefined,
  active: boolean,
): NowPlaying | null {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear track immediately on station change so stale data never shows.
  useEffect(() => {
    setNowPlaying(null)
  }, [stationId])

  useEffect(() => {
    if (!stationId || !active) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      return
    }

    let cancelled = false
    let fastMisses = 0
    let slowMisses = 0
    let slow = false

    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const schedule = (ms: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => tick(), ms)
    }

    const tick = async () => {
      if (cancelled) return

      try {
        const res = await fetch(`${API}/stations/${stationId}/now-playing`)
        if (cancelled) return

        if (!res.ok) {
          // Server error — keep current cadence and retry.
          schedule(slow ? SLOW_MS : FAST_MS)
          return
        }

        const data: NowPlaying = await res.json()
        if (cancelled) return

        if (data.status === 'disabled') {
          // Admin explicitly disabled metadata polling for this station.
          return
        }

        if (data.title) {
          // Metadata found — reset counters and stay on fast cadence.
          fastMisses = 0
          slowMisses = 0
          slow = false
          setNowPlaying(data)
          schedule(FAST_MS)
          return
        }

        // No metadata this poll.
        if (!slow) {
          fastMisses++
          if (fastMisses >= MAX_FAST_MISSES) {
            slow = true
          }
          schedule(slow ? SLOW_MS : FAST_MS)
        } else {
          slowMisses++
          if (slowMisses < MAX_SLOW_MISSES) {
            schedule(SLOW_MS)
          }
          // slowMisses >= MAX_SLOW_MISSES: stop scheduling — stream doesn't
          // support metadata; no more requests until station changes.
        }
      } catch {
        // Network error — keep current cadence.
        if (!cancelled) schedule(slow ? SLOW_MS : FAST_MS)
      }
    }

    tick() // fire immediately on mount / station change

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [stationId, active])

  return nowPlaying
}
