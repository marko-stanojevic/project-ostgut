'use client'

import type { NowPlaying } from '@/hooks/useNowPlaying'
import {
  normalizeResolvedClientMetadata,
  resolveSupplementalMetadata,
  type ClientMetadataStream,
} from '@/lib/metadata-providers'
import { metadataDebugLog } from '@/lib/metadata-observability'
import { isPlaceholderMetadataTitle } from '@/lib/metadata-title'

const CLIENT_TIMEOUT_MS = 4000
const CACHE_TTL_OK_MS = 30_000
const CACHE_TTL_MISS_MS = 3 * 60_000
const MAX_METAINT = 65536

type CacheEntry = {
  value: NowPlaying | null
  expiresAt: number
}

type BufferedReader = {
  reader: ReadableStreamDefaultReader<Uint8Array>
  leftover: Uint8Array
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<NowPlaying | null>>()

declare global {
  interface Window {
    __ostgutMetadataDebug?: {
      clearCache: () => void
      cacheSize: () => number
    }
  }
}

if (typeof window !== 'undefined') {
  window.__ostgutMetadataDebug = {
    clearCache: () => {
      cache.clear()
      inFlight.clear()
    },
    cacheSize: () => cache.size,
  }
}

export async function fetchClientNowPlaying(
  stream: ClientMetadataStream,
  outerSignal?: AbortSignal,
): Promise<NowPlaying | null> {
  if (!stream.metadataEnabled) {
    metadataDebugLog('client-skip-disabled', { streamId: stream.id })
    return null
  }
  if (stream.metadataResolver !== 'client') {
    metadataDebugLog('client-skip-not-client-resolver', { streamId: stream.id, resolver: stream.metadataResolver ?? '' })
    return null
  }

  const streamURL = (stream.resolvedUrl || stream.url || '').trim()
  if (!streamURL) {
    metadataDebugLog('client-skip-no-url', { streamId: stream.id })
    return null
  }

  const cacheKey = `${streamURL}|${stream.metadataType || 'auto'}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    metadataDebugLog('client-cache-hit', {
      streamId: stream.id,
      cacheKey,
      status: cached.value?.status ?? 'miss',
      source: cached.value?.source ?? '',
    })
    return cached.value
  }

  const existing = inFlight.get(cacheKey)
  if (existing) {
    metadataDebugLog('client-join-inflight', { streamId: stream.id, cacheKey })
    return existing
  }

  metadataDebugLog('client-start', {
    streamId: stream.id,
    cacheKey,
    url: streamURL,
    metadataType: stream.metadataType || 'auto',
    kind: stream.kind,
  })

  const task = resolveClientNowPlaying(stream, outerSignal)
    .then((value) => {
      cache.set(cacheKey, {
        value,
        expiresAt: Date.now() + (value?.status === 'ok' ? CACHE_TTL_OK_MS : CACHE_TTL_MISS_MS),
      })
      metadataDebugLog('client-finish', {
        streamId: stream.id,
        cacheKey,
        result: value ? 'resolved' : 'no-result',
        source: value?.source ?? '',
        resolver: value?.resolver ?? '',
        title: value?.title ?? '',
      })
      return value
    })
    .finally(() => {
      inFlight.delete(cacheKey)
    })

  inFlight.set(cacheKey, task)
  return task
}

async function resolveClientNowPlaying(
  stream: ClientMetadataStream,
  outerSignal?: AbortSignal,
): Promise<NowPlaying | null> {
  const controller = new AbortController()
  const timeoutID = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  const signal = anySignal([controller.signal, outerSignal])

  try {
    const streamURL = (stream.resolvedUrl || stream.url || '').trim()
    if (!streamURL) return null

    const configuredType = (stream.metadataType || 'auto').trim().toLowerCase()
    const hintedMetadataURL = (stream.metadataUrl || '').trim()
    if (hintedMetadataURL) {
      metadataDebugLog('client-try-hinted', {
        streamId: stream.id,
        streamURL,
        metadataUrl: hintedMetadataURL,
      })
      const hinted = await resolveHinted(streamURL, hintedMetadataURL, signal)
      if (hinted?.title) return normalizeResolvedClientMetadata(stream, hinted)
    }

    if (configuredType && configuredType !== 'auto') {
      metadataDebugLog('client-try-configured', {
        streamId: stream.id,
        url: streamURL,
        metadataType: configuredType,
      })
      const configured = await resolveConfigured(streamURL, configuredType, signal)
      return configured ? normalizeResolvedClientMetadata(stream, configured) : null
    }

    if (stream.kind !== 'hls') {
      metadataDebugLog('client-try-icy', { streamId: stream.id, url: streamURL })
      const icy = await fetchICY(streamURL, signal)
      if (icy?.title) return normalizeResolvedClientMetadata(stream, icy)
    }

    metadataDebugLog('client-try-icecast', { streamId: stream.id, url: streamURL })
    const icecast = await fetchIcecastJSON(streamURL, signal)
    if (icecast?.title) return normalizeResolvedClientMetadata(stream, icecast)

    metadataDebugLog('client-try-shoutcast', { streamId: stream.id, url: streamURL })
    const shoutcast = await fetchShoutcast(streamURL, signal)
    if (shoutcast?.title) return normalizeResolvedClientMetadata(stream, shoutcast)

    const supplemental = await resolveSupplementalMetadata(stream, signal)
    if (supplemental?.title) return normalizeResolvedClientMetadata(stream, supplemental)

    metadataDebugLog('client-no-metadata', { streamId: stream.id, url: streamURL })
    return null
  } catch (error) {
    metadataDebugLog('client-error', {
      streamId: stream.id,
      url: stream.resolvedUrl || stream.url || '',
      error: formatError(error),
    })
    return null
  } finally {
    window.clearTimeout(timeoutID)
  }
}

async function resolveHinted(
  streamURL: string,
  metadataURL: string,
  signal: AbortSignal,
): Promise<NowPlaying | null> {
  const hintedType = inferMetadataTypeFromURL(metadataURL)
  switch (hintedType) {
    case 'icecast':
      return await fetchIcecastJSON(streamURL, signal, metadataURL)
    case 'shoutcast-currentsong':
      return await fetchShoutcastCurrentSong(metadataURL, signal)
    case 'shoutcast-7html':
      return await fetchShoutcast7HTML(metadataURL, signal)
    case 'icy':
    default:
      return await fetchICY(metadataURL, signal)
  }
}

async function resolveConfigured(
  streamURL: string,
  metadataType: string,
  signal: AbortSignal,
): Promise<NowPlaying | null> {
  switch (metadataType) {
    case 'icy':
      return await fetchICY(streamURL, signal)
    case 'icecast':
      return await fetchIcecastJSON(streamURL, signal)
    case 'shoutcast':
      return await fetchShoutcast(streamURL, signal)
    default:
      return null
  }
}

async function fetchICY(streamURL: string, signal: AbortSignal): Promise<NowPlaying | null> {
  let res: Response
  try {
    res = await fetch(streamURL, {
      headers: {
        'Icy-Metadata': '1',
      },
      signal,
    })
  } catch (error) {
    metadataDebugLog('client-icy-fetch-failed', {
      url: streamURL,
      error: formatError(error),
    })
    return null
  }
  const metaintValue = res.headers.get('Icy-Metaint')
  if (!metaintValue) {
    metadataDebugLog('client-icy-missing-metaint', { url: streamURL })
    return null
  }

  const metaint = Number.parseInt(metaintValue, 10)
  if (!Number.isFinite(metaint) || metaint <= 0 || metaint > MAX_METAINT || !res.body) {
    metadataDebugLog('client-icy-invalid-metaint', { url: streamURL, metaint: metaintValue })
    return null
  }

  const reader = res.body.getReader()
  const bufferedReader: BufferedReader = { reader, leftover: new Uint8Array(0) }
  try {
    await readExactly(bufferedReader, metaint, signal)
    const lengthByte = await readExactly(bufferedReader, 1, signal)
    const metaLength = (lengthByte[0] ?? 0) * 16
    if (metaLength <= 0) return null

    const metaBlock = await readExactly(bufferedReader, metaLength, signal)
    const raw = new TextDecoder().decode(metaBlock).replace(/\0+$/, '')
    const title = extractICYField(raw, 'StreamTitle')
    if (isPlaceholderTitle(title)) {
      metadataDebugLog('client-icy-no-title', { url: streamURL, raw })
      return null
    }
    metadataDebugLog('client-icy-success', { url: streamURL, title })
    return buildNowPlaying(title, 'icy', 'client', streamURL)
  } catch (error) {
    metadataDebugLog('client-icy-read-failed', {
      url: streamURL,
      error: formatError(error),
    })
    return null
  } finally {
    reader.releaseLock()
  }
}
async function fetchIcecastJSON(streamURL: string, signal: AbortSignal, hintedURL?: string): Promise<NowPlaying | null> {
  const url = new URL(streamURL)
  const statusURL = hintedURL || `${url.protocol}//${url.host}/status-json.xsl`
  let res: Response
  try {
    res = await fetch(statusURL, { signal })
  } catch (error) {
    metadataDebugLog('client-icecast-fetch-failed', {
      url: statusURL,
      error: formatError(error),
    })
    return null
  }
  if (!res.ok) {
    metadataDebugLog('client-icecast-bad-status', { url: statusURL, status: res.status })
    return null
  }

  let payload: {
    icestats?: {
      source?: { title?: string; listenurl?: string; mount?: string } | Array<{ title?: string; listenurl?: string; mount?: string }>
    }
  }
  try {
    payload = (await res.json()) as typeof payload
  } catch (error) {
    metadataDebugLog('client-icecast-parse-failed', {
      url: statusURL,
      error: formatError(error),
    })
    return null
  }
  const rawSource = payload.icestats?.source
  const sources = Array.isArray(rawSource) ? rawSource : rawSource ? [rawSource] : []
  if (sources.length === 0) return null

  const streamPath = url.pathname.toLowerCase()
  const best =
    sources.find((source) => {
      const mount = (source.mount || source.listenurl || '').toLowerCase()
      return mount.endsWith(streamPath)
    }) || sources[0]

  if (!best?.title || isPlaceholderTitle(best.title)) {
    metadataDebugLog('client-icecast-no-title', { url: statusURL })
    return null
  }
  metadataDebugLog('client-icecast-success', { url: statusURL, title: best.title })
  return buildNowPlaying(best.title, 'icecast', 'client', statusURL)
}

async function fetchShoutcast(streamURL: string, signal: AbortSignal): Promise<NowPlaying | null> {
  const url = new URL(streamURL)
  const base = `${url.protocol}//${url.host}`

  const currentSong = await fetchShoutcastCurrentSong(`${base}/currentsong`, signal)
  if (currentSong?.title) return currentSong
  return await fetchShoutcast7HTML(`${base}/7.html`, signal)
}

async function fetchShoutcastCurrentSong(endpoint: string, signal: AbortSignal): Promise<NowPlaying | null> {
  try {
    const currentSongRes = await fetch(endpoint, { signal })
    if (currentSongRes.ok) {
      const title = (await currentSongRes.text()).trim()
      if (!isPlaceholderTitle(title)) {
        metadataDebugLog('client-shoutcast-currentsong-success', { url: endpoint, title })
        return buildNowPlaying(title, 'shoutcast', 'client', endpoint)
      }
      metadataDebugLog('client-shoutcast-currentsong-no-title', { url: endpoint })
    } else {
      metadataDebugLog('client-shoutcast-currentsong-bad-status', {
        url: endpoint,
        status: currentSongRes.status,
      })
    }
  } catch (error) {
    metadataDebugLog('client-shoutcast-currentsong-failed', {
      url: endpoint,
      error: formatError(error),
    })
  }
  return null
}

async function fetchShoutcast7HTML(endpoint: string, signal: AbortSignal): Promise<NowPlaying | null> {
  let htmlRes: Response
  try {
    htmlRes = await fetch(endpoint, { signal })
  } catch (error) {
    metadataDebugLog('client-shoutcast-7html-failed', {
      url: endpoint,
      error: formatError(error),
    })
    return null
  }
  if (!htmlRes.ok) {
    metadataDebugLog('client-shoutcast-7html-bad-status', { url: endpoint, status: htmlRes.status })
    return null
  }
  const html = await htmlRes.text()
  const text = html.replace(/<[^>]+>/g, '').trim()
  const parts = text.split(',', 7)
  if (parts.length < 7) {
    metadataDebugLog('client-shoutcast-7html-bad-format', { url: endpoint, text })
    return null
  }
  if (!parts.slice(0, 6).every(isShoutcastNumericField)) {
    metadataDebugLog('client-shoutcast-7html-invalid-fields', { url: endpoint, text })
    return null
  }
  const title = parts[6]?.trim()
  if (isPlaceholderTitle(title)) {
    metadataDebugLog('client-shoutcast-7html-no-title', { url: endpoint, text })
    return null
  }
  metadataDebugLog('client-shoutcast-7html-success', { url: endpoint, title })
  return buildNowPlaying(title, 'shoutcast', 'client', endpoint)
}

function buildNowPlaying(
  title: string,
  source: string,
  resolver: 'client',
  metadataUrl?: string,
): NowPlaying {
  const [artist, song] = splitArtistTitle(title)
  return {
    title,
    artist,
    song,
    source,
    metadataUrl,
    supported: true,
    status: 'ok',
    resolver,
  }
}

function inferMetadataTypeFromURL(metadataURL: string): 'icy' | 'icecast' | 'shoutcast-currentsong' | 'shoutcast-7html' {
  const normalized = metadataURL.trim().toLowerCase()
  if (normalized.endsWith('/status-json.xsl')) return 'icecast'
  if (normalized.endsWith('/currentsong')) return 'shoutcast-currentsong'
  if (normalized.endsWith('/7.html')) return 'shoutcast-7html'
  return 'icy'
}

function splitArtistTitle(title: string): [string | undefined, string | undefined] {
  const normalized = title.trim()
  if (!normalized) return [undefined, undefined]
  const separators = [' - ', ' – ', ' — ']
  for (const separator of separators) {
    const index = normalized.indexOf(separator)
    if (index > 0 && index < normalized.length - separator.length) {
      return [normalized.slice(0, index).trim() || undefined, normalized.slice(index + separator.length).trim() || undefined]
    }
  }
  return [undefined, normalized]
}

function extractICYField(meta: string, key: string): string {
  const match = meta.match(new RegExp(`${key}='([^']*)'`))
  return match?.[1]?.trim() ?? ''
}

async function readExactly(
  bufferedReader: BufferedReader,
  bytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let received = 0

  if (bufferedReader.leftover.byteLength > 0) {
    const take = Math.min(bytes, bufferedReader.leftover.byteLength)
    chunks.push(bufferedReader.leftover.slice(0, take))
    received += take
    bufferedReader.leftover =
      take < bufferedReader.leftover.byteLength
        ? bufferedReader.leftover.slice(take)
        : new Uint8Array(0)
  }

  while (received < bytes) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const { value, done } = await bufferedReader.reader.read()
    if (done || !value) throw new Error('stream ended early')

    const remaining = bytes - received
    if (value.byteLength <= remaining) {
      chunks.push(value)
      received += value.byteLength
      continue
    }

    chunks.push(value.slice(0, remaining))
    received += remaining
    bufferedReader.leftover = value.slice(remaining)
  }

  const result = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  for (const signal of signals) {
    if (!signal) continue
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return controller.signal
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

function isPlaceholderTitle(raw: string): boolean {
  return isPlaceholderMetadataTitle(raw)
}

function isShoutcastNumericField(value: string): boolean {
  return /^\d+$/.test(value.trim())
}
