import { API_URL } from '@/lib/api'

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

export function getNowPlayingStreamURL(stationID: string, streamID?: string | null) {
  return `${API_URL}/stations/${stationID}/now-playing/stream${buildNowPlayingQuery(streamID)}`
}

export async function fetchServerNowPlaying(stationID: string, streamID: string | null | undefined, init?: RequestInit) {
  const response = await fetch(`${API_URL}/stations/${stationID}/now-playing${buildNowPlayingQuery(streamID)}`, init)
  if (!response.ok) {
    return null
  }

  return { ...((await response.json()) as NowPlaying), resolver: 'server' as const }
}

function buildNowPlayingQuery(streamID: string | null | undefined) {
  if (!streamID) {
    return ''
  }

  const params = new URLSearchParams({ stream_id: streamID })
  return `?${params}`
}
