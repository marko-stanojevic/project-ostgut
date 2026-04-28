'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  claimClientMetadataLease,
  getClientMetadataLeaseStorageKey,
  getClientMetadataSnapshotStorageKey,
  publishClientMetadataSnapshot,
  readClientMetadataSnapshot,
  releaseClientMetadataLease,
} from '@/lib/client-metadata-coordination'
import { emitMetadataTelemetry, metadataDebugLog } from '@/lib/metadata-observability'
import { HLS_ID3_EVENT, type HlsNowPlayingDetail } from '@/lib/hls-id3'
import { fetchClientNowPlaying } from '@/lib/now-playing-client'
import { fetchServerNowPlaying, getNowPlayingStreamURL, parseServerNowPlaying, type NowPlaying } from '@/lib/now-playing'
import type { StationStream } from '@/types/player'

const CLIENT_POLL_MS = 30_000
const CLIENT_FOLLOWER_RETRY_MS = 5_000

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
  const streamMetadataMode = stream?.metadataMode || 'auto'
  const streamMetadataErrorCode = stream?.metadataErrorCode || ''
  const streamMetadataDelivery = stream?.metadataPlan?.delivery || metadataDeliveryFromResolver(stream?.metadataResolver, streamKind)
  const streamMetadataResolver = stream?.metadataPlan?.resolver || stream?.metadataResolver
  const usesClientMetadataDelivery = streamMetadataDelivery === 'client-poll' || streamMetadataDelivery === 'hls-id3'
  const streamSupportsServerSnapshot = Boolean(stream?.metadataPlan?.supportsServerSnapshot && streamMetadataDelivery === 'sse')
  const streamLeaseKey = streamId ? getClientMetadataLeaseStorageKey(streamId) : ''
  const streamSharedSnapshotKey = streamId ? getClientMetadataSnapshotStorageKey(streamId) : ''
  const streamSnapshot = useMemo(
    () =>
      streamObjectID && streamId
        ? {
            id: streamObjectID,
            url: streamRawURL,
            resolvedUrl: streamURL,
            kind: streamKind,
            metadataMode: streamMetadataMode,
            metadataType: streamMetadataType,
            metadataUrl: stream?.metadataUrl || '',
            metadataResolver: streamMetadataDelivery === 'client-poll' || streamMetadataDelivery === 'hls-id3' ? 'client' : streamMetadataResolver,
          }
        : null,
    [streamObjectID, streamRawURL, streamURL, streamKind, streamId, streamMetadataMode, streamMetadataType, stream?.metadataUrl, streamMetadataResolver, streamMetadataDelivery],
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
    let storageListener: ((event: StorageEvent) => void) | null = null
    let clientLeader = false

    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const clearStorageListener = () => {
      if (storageListener) {
        window.removeEventListener('storage', storageListener)
        storageListener = null
      }
    }

    const updateFromSharedSnapshot = () => {
      if (!streamId) {
        return
      }

      const shared = readClientMetadataSnapshot(streamId)
      if (shared === undefined) {
        return
      }

      setNowPlaying(shared)
      setSettled(true)
    }

    const publishSharedSnapshot = (value: NowPlaying | null) => {
      if (!streamId) {
        return
      }

      publishClientMetadataSnapshot(streamId, value)
    }

    const hydrateFromServerSnapshot = async () => {
      if (!streamSupportsServerSnapshot) {
        return false
      }

      try {
        const data = await fetchServerNowPlaying(stationId, streamId, currentController ? { signal: currentController.signal } : undefined)
        if (!cancelled && data?.status === 'ok' && data.title) {
          setNowPlaying(data)
          publishSharedSnapshot(data)
          emitMetadataTelemetry('metadata_server_result', {
            stationId,
            streamId,
            resolver: 'server',
            result: 'success',
            source: data.source,
            metadataType: streamMetadataType || 'auto',
            streamUrl: streamURL,
          })
          return true
        }
      } catch {
        // Best-effort fallback only.
      }

      return false
    }

    const startFollowerMode = () => {
      clearTimer()
      currentController?.abort()
      currentController = null
      clientLeader = false
      updateFromSharedSnapshot()
      setSettled(true)
      clearStorageListener()

      const retryLeadership = () => {
        if (cancelled || !streamId || !streamSnapshot) {
          return
        }

        if (claimClientMetadataLease(streamId)) {
          clientLeader = true
          clearStorageListener()
          tickClient()
          return
        }

        clearTimer()
        timerRef.current = setTimeout(retryLeadership, CLIENT_FOLLOWER_RETRY_MS)
      }

      storageListener = (event: StorageEvent) => {
        if (event.key === streamSharedSnapshotKey) {
          updateFromSharedSnapshot()
          return
        }

        if (event.key === streamLeaseKey) {
          clearTimer()
          timerRef.current = setTimeout(retryLeadership, 0)
        }
      }

      window.addEventListener('storage', storageListener)
      retryLeadership()
    }

    if (streamMetadataMode === 'off' || (streamMetadataErrorCode === 'no_metadata' && !usesClientMetadataDelivery) || streamMetadataResolver === 'none' || streamMetadataDelivery === 'none') {
      setNowPlaying(null)
      setSettled(true)
      return () => {
        cancelled = true
        clearTimer()
        clearStorageListener()
      }
    }

    const tickClient = async () => {
      if (cancelled || !streamSnapshot || !streamId) return
      if (!claimClientMetadataLease(streamId)) {
        startFollowerMode()
        return
      }

      clientLeader = true
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
          publishSharedSnapshot(clientData)
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
          const hydrated = await hydrateFromServerSnapshot()
          if (!hydrated) {
            setNowPlaying(null)
            publishSharedSnapshot(null)
            emitMetadataTelemetry('metadata_client_miss', {
              stationId,
              streamId,
              resolver: 'client',
              result: 'miss',
              metadataType: streamSnapshot.metadataType || 'auto',
              streamUrl: streamSnapshot.resolvedUrl || streamSnapshot.url,
            })
          }
        }
        setSettled(true)
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError' && !cancelled) {
          const hydrated = await hydrateFromServerSnapshot()
          if (!hydrated) {
            setNowPlaying(null)
            publishSharedSnapshot(null)
          }
          setSettled(true)
          if (!hydrated) {
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
        }
      } finally {
        if (!cancelled) {
          clearTimer()
          timerRef.current = setTimeout(tickClient, CLIENT_POLL_MS)
        }
      }
    }

    if ((streamMetadataDelivery === 'client-poll' || streamMetadataDelivery === 'hls-id3') && streamSnapshot) {
      const activeStreamId = streamId
      if (!activeStreamId) {
        setNowPlaying(null)
        setSettled(true)
        return () => {
          cancelled = true
          clearTimer()
          clearStorageListener()
        }
      }

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
          clearStorageListener()
        }
      }

      if (claimClientMetadataLease(activeStreamId)) {
        clientLeader = true
        tickClient()
      } else {
        startFollowerMode()
      }

      return () => {
        cancelled = true
        clearTimer()
        clearStorageListener()
        if (clientLeader) {
          releaseClientMetadataLease(activeStreamId)
        }
        currentController?.abort()
      }
    }

    if (streamMetadataDelivery !== 'sse') {
      setNowPlaying(null)
      setSettled(true)
      return () => {
        cancelled = true
        clearTimer()
        clearStorageListener()
      }
    }

    const sseURL = getNowPlayingStreamURL(stationId, streamId)

    if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
      metadataDebugLog('resolver-server-subscribe', { stationId, streamId, url: sseURL })
      eventSourceRef.current = new EventSource(sseURL)
      eventSourceRef.current.onmessage = (event) => {
        if (cancelled) return
        try {
          const data = parseServerNowPlaying(JSON.parse(event.data))
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
        } catch (error) {
          setNowPlaying(null)
          setSettled(true)
          emitMetadataTelemetry('metadata_server_result', {
            stationId,
            streamId,
            resolver: 'server',
            result: 'miss',
            metadataType: streamMetadataType || 'auto',
            streamUrl: streamURL,
            error: formatError(error),
          })
        }
      }
      eventSourceRef.current.onerror = () => {
        if (!cancelled) {
          setSettled(true)
        }
      }
      return () => {
        cancelled = true
        clearTimer()
        clearStorageListener()
        eventSourceRef.current?.close()
        eventSourceRef.current = null
      }
    }

    const tickServer = async () => {
      if (cancelled) return

      const controller = new AbortController()
      currentController = controller
      try {
        const data = await fetchServerNowPlaying(stationId, streamId, { signal: controller.signal })
        if (!cancelled) {
          setNowPlaying(data?.status === 'ok' && data.title ? data : null)
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
      clearStorageListener()
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
    streamMetadataMode,
    streamMetadataErrorCode,
    streamMetadataResolver,
    streamMetadataDelivery,
    usesClientMetadataDelivery,
    streamSupportsServerSnapshot,
    streamLeaseKey,
    streamSharedSnapshotKey,
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

function metadataDeliveryFromResolver(
  resolver: StationStream['metadataResolver'],
  kind: string,
): NonNullable<StationStream['metadataPlan']>['delivery'] {
  if (resolver === 'none' || resolver === 'unknown' || !resolver) return 'none'
  if (resolver === 'client') return kind === 'hls' ? 'hls-id3' : 'client-poll'
  return 'sse'
}
