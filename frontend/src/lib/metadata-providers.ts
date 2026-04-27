'use client'

import type { StationStream } from '@/types/player'
import type { NowPlaying } from '@/lib/now-playing'
import { metadataDebugLog } from '@/lib/metadata-observability'
import { isPlaceholderMetadataTitle } from '@/lib/metadata-title'

const NTS_LIVE_API_URL = 'https://www.nts.live/api/v2/live'

export type ClientMetadataStream = Pick<
  StationStream,
  'id' | 'url' | 'resolvedUrl' | 'kind' | 'metadataEnabled' | 'metadataType' | 'metadataUrl' | 'metadataResolver'
>

type SupplementalMetadataProvider = {
  id: string
  matches: (stream: ClientMetadataStream) => boolean
  resolve: (stream: ClientMetadataStream, signal: AbortSignal) => Promise<NowPlaying | null>
  normalize?: (stream: ClientMetadataStream, nowPlaying: NowPlaying) => NowPlaying
}

const supplementalMetadataProviders: SupplementalMetadataProvider[] = [
  {
    id: 'nts-live',
    matches: (stream) => inferNTSChannel(stream) !== null,
    resolve: resolveNTSLiveMetadata,
    normalize: normalizeNTSMetadata,
  },
]

export async function resolveSupplementalMetadata(
  stream: ClientMetadataStream,
  signal: AbortSignal,
): Promise<NowPlaying | null> {
  for (const provider of supplementalMetadataProviders) {
    if (!provider.matches(stream)) {
      continue
    }

    metadataDebugLog('client-provider-attempt', {
      streamId: stream.id,
      provider: provider.id,
      url: stream.resolvedUrl || stream.url || '',
    })

    const result = await provider.resolve(stream, signal)
    if (result?.title) {
      metadataDebugLog('client-provider-success', {
        streamId: stream.id,
        provider: provider.id,
        title: result.title,
      })
      return result
    }
  }

  return null
}

export function normalizeResolvedClientMetadata(
  stream: ClientMetadataStream,
  nowPlaying: NowPlaying,
): NowPlaying {
  let normalized = nowPlaying
  for (const provider of supplementalMetadataProviders) {
    if (!provider.matches(stream) || !provider.normalize) {
      continue
    }
    normalized = provider.normalize(stream, normalized)
  }
  return normalized
}

async function resolveNTSLiveMetadata(
  stream: ClientMetadataStream,
  signal: AbortSignal,
): Promise<NowPlaying | null> {
  const channel = inferNTSChannel(stream)
  if (!channel) {
    return null
  }

  let res: Response
  try {
    res = await fetch(NTS_LIVE_API_URL, { signal })
  } catch (error) {
    metadataDebugLog('client-provider-fetch-failed', {
      provider: 'nts-live',
      url: NTS_LIVE_API_URL,
      error: formatProviderError(error),
    })
    return null
  }

  if (!res.ok) {
    metadataDebugLog('client-provider-bad-status', {
      provider: 'nts-live',
      url: NTS_LIVE_API_URL,
      status: res.status,
    })
    return null
  }

  let payload: {
    results?: Array<{
      channel_name?: string
      now?: {
        broadcast_title?: string
        embeds?: { details?: { name?: string } }
      }
    }>
  }
  try {
    payload = (await res.json()) as typeof payload
  } catch (error) {
    metadataDebugLog('client-provider-parse-failed', {
      provider: 'nts-live',
      url: NTS_LIVE_API_URL,
      error: formatProviderError(error),
    })
    return null
  }

  const current = payload.results?.find((item) => item.channel_name === channel)?.now
  const title = (current?.embeds?.details?.name || current?.broadcast_title || '').trim()
  if (isPlaceholderTitle(title)) {
    metadataDebugLog('client-provider-no-title', {
      provider: 'nts-live',
      url: NTS_LIVE_API_URL,
      channel,
    })
    return null
  }

  return {
    title,
    source: 'nts-live',
    metadataUrl: NTS_LIVE_API_URL,
    supported: true,
    status: 'ok',
    resolver: 'client',
  }
}

function inferNTSChannel(stream: ClientMetadataStream): '1' | '2' | null {
  const candidates = [stream.resolvedUrl || '', stream.url || ''].map((value) => value.trim().toLowerCase())
  for (const candidate of candidates) {
    if (!candidate.includes('nts')) continue
    if (candidate.includes('nts2') || candidate.includes('/stream2')) return '2'
    if (candidate.includes('nts1') || candidate.includes('/stream')) return '1'
  }
  return null
}

function normalizeNTSMetadata(
  stream: ClientMetadataStream,
  nowPlaying: NowPlaying,
): NowPlaying {
  const channel = inferNTSChannel(stream)
  if (!channel) {
    return nowPlaying
  }

  const normalizedTitle = stripNTSBranding(nowPlaying.title, channel)
  if (normalizedTitle === nowPlaying.title) {
    return nowPlaying
  }

  if (isPlaceholderTitle(normalizedTitle)) {
    return nowPlaying
  }

  metadataDebugLog('client-provider-normalized', {
    streamId: stream.id,
    provider: 'nts-live',
    from: nowPlaying.title,
    to: normalizedTitle,
  })

  return {
    ...nowPlaying,
    title: normalizedTitle,
    artist: undefined,
    song: normalizedTitle,
  }
}

function stripNTSBranding(title: string, channel: '1' | '2'): string {
  const brandPrefix = `NTS ${channel} - `
  let normalized = title.trim()
  if (normalized.startsWith(brandPrefix)) {
    normalized = normalized.slice(brandPrefix.length).trim()
  }
  normalized = normalized.replace(/\s+\(R\)$/i, '').trim()
  return normalized
}

function isPlaceholderTitle(raw: string): boolean {
  return isPlaceholderMetadataTitle(raw)
}

function formatProviderError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}