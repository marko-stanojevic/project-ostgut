import { API_URL } from '@/lib/api'
import { optionalString, requireBoolean, requireDateString, requireRecord, requireString } from '@/lib/api-contract'

const NOW_PLAYING_CONTRACT = 'now-playing payload'

export interface NowPlaying {
  title: string
  artist?: string
  song?: string
  source: string
  metadataUrl?: string
  supported: boolean
  status: 'ok' | 'unsupported' | 'disabled' | 'error'
  errorCode?: string
  error?: string
  fetchedAt?: string
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

  return parseServerNowPlaying(await response.json())
}

export function parseServerNowPlaying(payload: unknown): NowPlaying {
  const response = requireRecord(payload, 'now-playing response', NOW_PLAYING_CONTRACT)

  return {
    title: requireString(response.title, 'title', NOW_PLAYING_CONTRACT),
    artist: optionalString(response.artist, 'artist', NOW_PLAYING_CONTRACT),
    song: optionalString(response.song, 'song', NOW_PLAYING_CONTRACT),
    source: requireString(response.source, 'source', NOW_PLAYING_CONTRACT),
    metadataUrl: optionalString(response.metadata_url, 'metadata_url', NOW_PLAYING_CONTRACT),
    supported: requireBoolean(response.supported, 'supported', NOW_PLAYING_CONTRACT),
    status: requireNowPlayingStatus(response.status, 'status'),
    errorCode: optionalString(response.error_code, 'error_code', NOW_PLAYING_CONTRACT),
    error: optionalString(response.error, 'error', NOW_PLAYING_CONTRACT),
    fetchedAt: requireDateString(response.fetched_at, 'fetched_at', NOW_PLAYING_CONTRACT),
    resolver: 'server',
  }
}

function buildNowPlayingQuery(streamID: string | null | undefined) {
  if (!streamID) {
    return ''
  }

  const params = new URLSearchParams({ stream_id: streamID })
  return `?${params}`
}

function requireNowPlayingStatus(value: unknown, field: string): NowPlaying['status'] {
  if (value === 'ok' || value === 'unsupported' || value === 'disabled' || value === 'error') {
    return value
  }

  throw new Error(`Invalid ${NOW_PLAYING_CONTRACT}: ${field} must be ok, unsupported, disabled, or error`)
}

