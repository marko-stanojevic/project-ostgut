'use client'

const emittedEvents = new Set<string>()

type MetadataTelemetryPayload = {
  stationId?: string | null
  streamId?: string | null
  resolver?: 'server' | 'client'
  result?: 'attempt' | 'success' | 'miss' | 'skip' | 'fallback' | 'cache_hit'
  source?: string
  metadataType?: string
  streamUrl?: string
  error?: string
}

declare global {
  interface Window {
    newrelic?: {
      addPageAction?: (name: string, attributes?: Record<string, unknown>) => void
    }
  }
}

export function isMetadataDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:metadata') === '1'
  } catch {
    return false
  }
}

export function metadataDebugLog(event: string, details?: Record<string, unknown>) {
  if (!isMetadataDebugEnabled()) return
  const timestamp = new Date().toISOString()
  if (details) {
    console.debug(`[metadata-debug] ${timestamp} ${event}`, details)
    return
  }
  console.debug(`[metadata-debug] ${timestamp} ${event}`)
}

export function emitMetadataTelemetry(event: string, payload: MetadataTelemetryPayload) {
  if (typeof window === 'undefined') return

  const dedupeKey = [
    event,
    payload.stationId ?? '',
    payload.streamId ?? '',
    payload.resolver ?? '',
    payload.result ?? '',
    payload.source ?? '',
    payload.metadataType ?? '',
    payload.error ?? '',
  ].join('|')

  if (emittedEvents.has(dedupeKey)) return
  emittedEvents.add(dedupeKey)

  window.newrelic?.addPageAction?.('metadata_resolution', {
    event,
    stationId: payload.stationId ?? '',
    streamId: payload.streamId ?? '',
    resolver: payload.resolver ?? '',
    result: payload.result ?? '',
    source: payload.source ?? '',
    metadataType: payload.metadataType ?? '',
    streamHost: safeHost(payload.streamUrl),
    error: payload.error ?? '',
  })
}

function safeHost(streamUrl?: string): string {
  if (!streamUrl) return ''
  try {
    return new URL(streamUrl).host
  } catch {
    return ''
  }
}
