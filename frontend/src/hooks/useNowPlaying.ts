'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { emitMetadataTelemetry, metadataDebugLog } from '@/lib/metadata-observability'
import { fetchClientNowPlaying } from '@/lib/now-playing-client'
import type { StationStream } from '@/types/player'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

// While metadata is flowing, poll often.
const FAST_MS = 30_000
// After consecutive misses, back off to avoid pointless traffic.
const SLOW_MS = 3 * 60_000
// Switch to slow after this many consecutive fast-poll misses.
const MAX_FAST_MISSES = 3
const MAX_CLIENT_MISSES = 2
// After repeated misses, keep a very low-frequency heartbeat to recover when
// metadata becomes available later in the session.
const MAX_SLOW_MISSES = 2
const IDLE_MS = 10 * 60_000

export interface NowPlaying {
  title: string
  artist?: string
  song?: string
  source: string
  metadataUrl?: string
  supported: boolean
  status: 'ok' | 'unsupported' | 'disabled' | 'error'
  error?: string
  resolver?: 'server' | 'client'
}

/**
 * Polls GET /stations/:id/now-playing while the station is active.
 *
 * Polling strategy:
 *   - Fast (30 s) while metadata is being received.
 *   - Backs off to slow (3 min) after MAX_FAST_MISSES consecutive empty responses.
 *   - Moves to idle heartbeat (10 min) after MAX_SLOW_MISSES slow misses.
 *   - Resets on station change.
 *
 * This means a stream that never returns metadata (e.g. KEXP) will generate
 * ~5 requests over ~7.5 minutes then continue on low-frequency heartbeats.
 */
export function useNowPlaying(
  stationId: string | null | undefined,
  streamId: string | null | undefined,
  stream: StationStream | null,
  active: boolean,
): { nowPlaying: NowPlaying | null; settled: boolean } {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [settled, setSettled] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamObjectID = stream?.id || ''
  const streamRawURL = stream?.url || ''
  const streamURL = stream?.resolvedUrl || stream?.url || ''
  const streamMetadataType = stream?.metadataType || ''
  const streamKind = stream?.kind || ''
  const streamMetadataEnabled = Boolean(stream?.metadataEnabled)
  const streamMetadataResolver = stream?.metadataResolver || ''
  const streamSnapshot = useMemo(
    () =>
      streamObjectID && streamId
        ? {
            id: streamObjectID,
            url: streamRawURL,
            resolvedUrl: streamURL,
            kind: streamKind,
            metadataEnabled: streamMetadataEnabled,
            metadataType: streamMetadataType,
            metadataUrl: stream?.metadataUrl || '',
            metadataResolver: streamMetadataResolver,
          }
        : null,
    [streamObjectID, streamRawURL, streamURL, streamKind, streamId, streamMetadataEnabled, streamMetadataType, stream?.metadataUrl, streamMetadataResolver],
  )

  // Clear track immediately on station change so stale data never shows.
  useEffect(() => {
    setNowPlaying(null)
    setSettled(false)
  }, [stationId, streamId, streamURL])

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
    let clientMisses = 0
    let degradeClientToServer = false
    let currentController: AbortController | null = null

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

      const controller = new AbortController()
      currentController = controller
      try {
        if (!streamMetadataEnabled) {
          setNowPlaying(null)
          setSettled(true)
          return
        }

        const effectiveResolver = degradeClientToServer
          ? 'server'
          : (streamMetadataResolver || 'server')

        if (effectiveResolver === 'client' && streamSnapshot) {
          metadataDebugLog('resolver-client-attempt', {
            stationId,
            streamId,
            url: streamSnapshot.resolvedUrl || streamSnapshot.url,
            metadataType: streamSnapshot.metadataType || 'auto',
          })
          emitMetadataTelemetry('metadata_client_attempt', {
            stationId,
            streamId,
            resolver: 'client',
            result: 'attempt',
            metadataType: streamSnapshot.metadataType || 'auto',
            streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
          })
          const clientData = await fetchClientNowPlaying(streamSnapshot, controller.signal)
          if (cancelled) return

          if (clientData?.status === 'ok' && clientData.title) {
            metadataDebugLog('resolver-client-win', {
              stationId,
              streamId,
              source: clientData.source,
              title: clientData.title,
            })
            emitMetadataTelemetry('metadata_client_success', {
              stationId,
              streamId,
              resolver: 'client',
              result: 'success',
              source: clientData.source,
              metadataType: streamSnapshot.metadataType || 'auto',
              streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
            })
            fastMisses = 0
            slowMisses = 0
            slow = false
            setNowPlaying(clientData)
            setSettled(true)
            schedule(FAST_MS)
            return
          }

          clientMisses += 1
          metadataDebugLog('resolver-client-miss', {
            stationId,
            streamId,
            url: streamSnapshot.resolvedUrl || streamSnapshot.url,
            misses: clientMisses,
          })
          emitMetadataTelemetry('metadata_client_miss', {
            stationId,
            streamId,
            resolver: 'client',
            result: 'miss',
            metadataType: streamSnapshot.metadataType || 'auto',
            streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
          })
          if (clientMisses < MAX_CLIENT_MISSES) {
            setNowPlaying(null)
            setSettled(true)
            schedule(FAST_MS)
            return
          }

          degradeClientToServer = true
          metadataDebugLog('resolver-client-downgraded', {
            stationId,
            streamId,
            url: streamSnapshot.resolvedUrl || streamSnapshot.url,
            misses: clientMisses,
          })
          emitMetadataTelemetry('metadata_client_degraded_to_server', {
            stationId,
            streamId,
            resolver: 'client',
            result: 'fallback',
            metadataType: streamSnapshot.metadataType || 'auto',
            streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
          })
        }

        if (effectiveResolver !== 'server') {
          setNowPlaying(null)
          setSettled(true)
          schedule(FAST_MS)
          return
        }

        const params = new URLSearchParams()
        if (streamId) {
          params.set('stream_id', streamId)
        }
        const query = params.toString()
        const url = `${API}/stations/${stationId}/now-playing${query ? `?${query}` : ''}`
        metadataDebugLog('resolver-server-attempt', { stationId, streamId, url })
        emitMetadataTelemetry('metadata_server_fallback', {
          stationId,
          streamId,
          resolver: 'server',
          result: 'fallback',
          metadataType: streamMetadataType || 'auto',
          streamUrl: streamURL,
        })
        const res = await fetch(url, { signal: controller.signal })
        if (cancelled) return

        if (!res.ok) {
          // Server error — keep current cadence and retry.
          metadataDebugLog('resolver-server-bad-status', { stationId, streamId, status: res.status, url })
          emitMetadataTelemetry('metadata_server_error', {
            stationId,
            streamId,
            resolver: 'server',
            result: 'miss',
            metadataType: streamMetadataType || 'auto',
            streamUrl: streamURL,
            error: `http_${res.status}`,
          })
          setNowPlaying(null)
          setSettled(true)
          schedule(slow ? SLOW_MS : FAST_MS)
          return
        }

        const data = { ...((await res.json()) as NowPlaying), resolver: 'server' as const }
        if (cancelled) return
        metadataDebugLog('resolver-server-result', {
          stationId,
          streamId,
          status: data.status,
          source: data.source,
          resolver: data.resolver,
          title: data.title,
        })
        emitMetadataTelemetry('metadata_server_result', {
          stationId,
          streamId,
          resolver: 'server',
          result: data.status === 'ok' && data.title ? 'success' : 'miss',
          source: data.source,
          metadataType: streamMetadataType || 'auto',
          streamUrl: streamURL,
          error: data.error,
        })

        if (data.status === 'disabled') {
          // Admin explicitly disabled metadata polling for this station.
          setNowPlaying(null)
          setSettled(true)
          return
        }

        if (data.status === 'ok' && data.title) {
          // Metadata found — reset counters and stay on fast cadence.
          fastMisses = 0
          slowMisses = 0
          slow = false
          setNowPlaying(data)
          setSettled(true)
          schedule(FAST_MS)
          return
        }

        // No metadata this poll.
        setNowPlaying(null)
        setSettled(true)
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
          } else {
            schedule(IDLE_MS)
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        // Network error — keep current cadence.
        if (!cancelled) {
          metadataDebugLog('resolver-server-fetch-failed', {
            stationId,
            streamId,
            error: formatError(err),
          })
          emitMetadataTelemetry('metadata_server_error', {
            stationId,
            streamId,
            resolver: 'server',
            result: 'miss',
            metadataType: streamMetadataType || 'auto',
            streamUrl: streamURL,
            error: formatError(err),
          })
          setNowPlaying(null)
          setSettled(true)
          schedule(slow ? SLOW_MS : FAST_MS)
        }
      }
    }

    tick() // fire immediately on mount / station change

    return () => {
      cancelled = true
      clearTimer()
      currentController?.abort()
    }
  }, [
    stationId,
    streamId,
    streamURL,
    streamMetadataType,
    streamMetadataEnabled,
    streamMetadataResolver,
    streamSnapshot,
    active,
  ])

  return { nowPlaying, settled }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}
