'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { emitMetadataTelemetry, metadataDebugLog } from '@/lib/metadata-observability'
import { HLS_ID3_EVENT, type HlsNowPlayingDetail } from '@/lib/hls-id3'
import { fetchClientNowPlaying } from '@/lib/now-playing-client'
import type { StationStream } from '@/types/player'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const CLIENT_POLL_MS = 30_000

export interface NowPlaying {
  title: string
  artist?: string
  song?: string
  source: string
  metadataUrl?: string
  supported: boolean
  status: 'ok' | 'unsupported' | 'disabled' | 'error'
  error?: string
  resolver?: 'none' | 'server' | 'client'
}

export function useNowPlaying(
  stationId: string | null | undefined,
  streamId: string | null | undefined,
  stream: StationStream | null,
  active: boolean,
): { nowPlaying: NowPlaying | null; settled: boolean } {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [settled, setSettled] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const streamObjectID = stream?.id || ''
  const streamRawURL = stream?.url || ''
  const streamURL = stream?.resolvedUrl || stream?.url || ''
  const streamMetadataType = stream?.metadataType || ''
  const streamKind = stream?.kind || ''
  const streamMetadataEnabled = Boolean(stream?.metadataEnabled)
  const streamMetadataResolver = stream?.metadataResolver
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
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      return
    }

    let cancelled = false
    let currentController: AbortController | null = null

    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!streamMetadataEnabled || streamMetadataResolver === 'none') {
      setNowPlaying(null)
      setSettled(true)
      return () => {
        cancelled = true
        clearTimer()
      }
    }

      if (streamMetadataResolver === 'client' && streamSnapshot) {
      if (streamKind === 'hls') {
        const onID3 = (event: Event) => {
          const detail = (event as CustomEvent<HlsNowPlayingDetail>).detail
          if (!detail || detail.streamUrl !== streamURL) {
            return
          }
          setNowPlaying({
            title: detail.title,
            artist: detail.artist,
            song: detail.song,
            source: detail.source,
            supported: true,
            status: 'ok',
            resolver: 'client',
          })
          setSettled(true)
          emitMetadataTelemetry('metadata_client_success', {
            stationId,
            streamId,
            resolver: 'client',
            result: 'success',
            source: detail.source,
            metadataType: streamMetadataType || 'auto',
            streamUrl: streamURL,
          })
        }

        setSettled(true)
        window.addEventListener(HLS_ID3_EVENT, onID3 as EventListener)
        return () => {
          cancelled = true
          window.removeEventListener(HLS_ID3_EVENT, onID3 as EventListener)
          clearTimer()
        }
      }

      const tickClient = async () => {
        if (cancelled) return

        const controller = new AbortController()
        currentController = controller
        try {
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
            setNowPlaying(clientData)
            emitMetadataTelemetry('metadata_client_success', {
              stationId,
              streamId,
              resolver: 'client',
              result: 'success',
              source: clientData.source,
              metadataType: streamSnapshot.metadataType || 'auto',
              streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
            })
          } else {
            setNowPlaying(null)
            emitMetadataTelemetry('metadata_client_miss', {
              stationId,
              streamId,
              resolver: 'client',
              result: 'miss',
              metadataType: streamSnapshot.metadataType || 'auto',
              streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
            })
          }
          setSettled(true)
        } catch (error) {
          if ((error as { name?: string }).name !== 'AbortError' && !cancelled) {
            setNowPlaying(null)
            setSettled(true)
            emitMetadataTelemetry('metadata_client_miss', {
              stationId,
              streamId,
              resolver: 'client',
              result: 'miss',
              metadataType: streamSnapshot.metadataType || 'auto',
              streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
              error: formatError(error),
            })
          }
        } finally {
          if (!cancelled) {
            clearTimer()
            timerRef.current = setTimeout(tickClient, CLIENT_POLL_MS)
          }
        }
      }

      tickClient()

      return () => {
        cancelled = true
        clearTimer()
        currentController?.abort()
      }
    }

    const params = new URLSearchParams()
    if (streamId) {
      params.set('stream_id', streamId)
    }
    const query = params.toString()
    const sseURL = `${API}/stations/${stationId}/now-playing/stream${query ? `?${query}` : ''}`

    if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
      metadataDebugLog('resolver-server-subscribe', { stationId, streamId, url: sseURL })
      eventSourceRef.current = new EventSource(sseURL)
      eventSourceRef.current.onmessage = (event) => {
        if (cancelled) return
        const data = { ...(JSON.parse(event.data) as NowPlaying), resolver: 'server' as const }
        setNowPlaying(data.status === 'ok' && data.title ? data : null)
        setSettled(true)
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
      }
      eventSourceRef.current.onerror = () => {
        if (!cancelled) {
          setSettled(true)
        }
      }
      return () => {
        cancelled = true
        clearTimer()
        eventSourceRef.current?.close()
        eventSourceRef.current = null
      }
    }

    const tickServer = async () => {
      if (cancelled) return

      const controller = new AbortController()
      currentController = controller
      try {
        const url = `${API}/stations/${stationId}/now-playing${query ? `?${query}` : ''}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          setNowPlaying(null)
          setSettled(true)
          return
        }
        const data = { ...((await res.json()) as NowPlaying), resolver: 'server' as const }
        if (!cancelled) {
          setNowPlaying(data.status === 'ok' && data.title ? data : null)
          setSettled(true)
        }
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError' && !cancelled) {
          setNowPlaying(null)
          setSettled(true)
        }
      } finally {
        if (!cancelled) {
          clearTimer()
          timerRef.current = setTimeout(tickServer, CLIENT_POLL_MS)
        }
      }
    }

    tickServer()

    return () => {
      cancelled = true
      clearTimer()
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      currentController?.abort()
    }
  }, [
    stationId,
    streamId,
    streamURL,
    streamKind,
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
