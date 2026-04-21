'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Hls from 'hls.js'
import { useAuth } from '@/context/AuthContext'
import {
  type Station,
  type PlayerState,
  type StationStream,
  clampVolume,
  readPersistedPlayerState,
} from '@/types/player'
import { usePlayerStorage } from '@/hooks/usePlayerStorage'
import { usePlayerSync } from '@/hooks/usePlayerSync'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'

// Re-export Station so existing consumers don't need to change their imports.
export type { Station } from '@/types/player'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface PlayerContextValue {
  station: Station | null
  currentStream: StationStream | null
  state: PlayerState
  volume: number
  queue: Station[]
  queueIndex: number
  play: (station: Station) => void
  setQueue: (stations: Station[], index: number) => void
  playNext: () => void
  playPrev: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  setVolume: (v: number) => void
}

const LAST_SUCCESSFUL_STREAM_KEY = 'player:last-successful-stream:v1'
interface PlaybackCapabilities {
  flac: boolean
  hls: boolean
}
interface PlayableVariant {
  url: string
  kind: string
  codec: string
  mimeType: string
  lossless: boolean
  source?: StationStream
}

function detectPlaybackCapabilities(): PlaybackCapabilities {
  if (typeof window === 'undefined') {
    return { flac: false, hls: false }
  }
  const audio = new Audio()
  const canPlay = (mime: string) => audio.canPlayType(mime) !== ''
  const flac = canPlay('audio/flac') || canPlay('audio/x-flac')
  const hls = Hls.isSupported() || canPlay('application/vnd.apple.mpegurl') || canPlay('application/x-mpegURL')
  return { flac, hls }
}

// Returns the ordered list of playable variants for a station.
// Uses backend-probed stream records when available; falls back to the
// legacy streamUrl with URL-suffix HLS detection for old data.
function getPlayableVariants(s: Station, caps: PlaybackCapabilities): PlayableVariant[] {
  const active = (s.streams ?? []).filter((st: StationStream) => st.isActive)
  if (active.length > 0) {
    const variants: PlayableVariant[] = active
      .sort((a, b) => a.priority - b.priority)
      .map((st) => ({
        url: (st.resolvedUrl || st.url || '').trim(),
        kind: st.kind,
        codec: (st.codec || '').toUpperCase(),
        mimeType: (st.mimeType || '').toLowerCase(),
        lossless: Boolean(st.lossless),
        source: st,
      }))
      .filter((st) => st.url !== '')
      .filter((st) => {
        if (st.kind === 'hls' && !caps.hls) return false
        const flacLike = st.lossless || st.codec.includes('FLAC') || st.mimeType.includes('flac') || st.url.toLowerCase().includes('flac')
        if (flacLike && !caps.flac) return false
        return true
      })
    if (variants.length > 0) {
      return variants
    }
  }
  // Legacy fallback: detect HLS by extension only when no probe data exists.
  const url = s.streamUrl
  const path = url.split('?')[0].toLowerCase()
  const kind = path.endsWith('.m3u8') ? 'hls' : 'direct'
  if (kind === 'hls' && !caps.hls) return []
  if (url.toLowerCase().includes('flac') && !caps.flac) return []
  return [{ url, kind, codec: '', mimeType: '', lossless: url.toLowerCase().includes('flac') }]
}

function getPreferredVariantURL(stationID: string | undefined): string {
  if (!stationID || typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(LAST_SUCCESSFUL_STREAM_KEY)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed?.[stationID]
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function rememberPreferredVariant(stationID: string | undefined, streamURL: string | undefined) {
  if (!stationID || !streamURL || typeof window === 'undefined') return
  const trimmed = streamURL.trim()
  if (!trimmed) return
  try {
    const raw = window.localStorage.getItem(LAST_SUCCESSFUL_STREAM_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    parsed[stationID] = trimmed
    window.localStorage.setItem(LAST_SUCCESSFUL_STREAM_KEY, JSON.stringify(parsed))
  } catch {
    // Ignore storage errors; playback should not fail because persistence did.
  }
}

// Reconnect delays: 3 s → 6 s → 12 s → … capped at 30 s.
const RECONNECT_BASE_MS = 3_000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_JITTER_MS = 800
// How long to wait in a stalled/buffering state before forcing a reconnect.
const STALL_TIMEOUT_MS = 8_000

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const playbackCaps = useMemo(() => detectPlaybackCapabilities(), [])
  const initialState = useMemo(() => readPersistedPlayerState(), [])
  const [station, setStation] = useState<Station | null>(initialState?.station ?? null)
  const [currentStream, setCurrentStream] = useState<StationStream | null>(null)
  const [state, setState] = useState<PlayerState>('idle')
  const [volume, setVolumeState] = useState(initialState?.volume ?? 0.8)
  const [prefsUpdatedAt, setPrefsUpdatedAt] = useState(initialState?.updatedAt ?? new Date().toISOString())
  const [queue, setQueueArr] = useState<Station[]>([])
  const [queueIndex, setQueueIdx] = useState(-1)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  // Reconnect machinery — refs only so timers never trigger re-renders.
  const stationRef = useRef<Station | null>(initialState?.station ?? null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectCountRef = useRef(0)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Which stream variant we're currently trying (index into getPlayableVariants).
  const streamVariantRef = useRef(0)
  const streamVariantURLRef = useRef('')
  // Always points to the latest startStation / tryNextVariant so stale timer
  // closures still invoke the current implementation.
  const startStationRef = useRef<((s: Station) => void) | null>(null)
  const tryNextVariantRef = useRef<(() => void) | null>(null)

  // Stable — only touches refs, safe to call from stale closures.
  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  // Schedules the next reconnect attempt with exponential backoff, resetting
  // to variant 0 so the full failover sequence runs again after a cool-down.
  const scheduleReconnect = useCallback(() => {
    clearReconnect()
    const baseDelay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectCountRef.current,
      RECONNECT_MAX_MS,
    )
    const jitter = Math.floor(Math.random() * (RECONNECT_JITTER_MS + 1))
    const delay = baseDelay + jitter
    reconnectTimerRef.current = setTimeout(() => {
      const s = stationRef.current
      if (s) {
        streamVariantRef.current = 0
        startStationRef.current?.(s)
      }
    }, delay)
    reconnectCountRef.current++
  }, [clearReconnect])

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = volume

    audio.addEventListener('playing', () => {
      // Successful (re)connect — reset backoff counters and timers.
      clearReconnect()
      reconnectCountRef.current = 0
      streamVariantRef.current = 0
      rememberPreferredVariant(stationRef.current?.id, streamVariantURLRef.current)
      setState('playing')
    })
    audio.addEventListener('pause', () => setState('paused'))
    audio.addEventListener('waiting', () => {
      setState('loading')
      // Start stall watchdog only if one isn't already running.
      if (!stallTimerRef.current) {
        stallTimerRef.current = setTimeout(() => {
          stallTimerRef.current = null
          tryNextVariantRef.current?.()
        }, STALL_TIMEOUT_MS)
      }
    })
    audio.addEventListener('stalled', () => {
      setState('loading')
      if (!stallTimerRef.current) {
        stallTimerRef.current = setTimeout(() => {
          stallTimerRef.current = null
          tryNextVariantRef.current?.()
        }, STALL_TIMEOUT_MS)
      }
    })
    audio.addEventListener('error', () => {
      setState('error')
      // Fatal source error: try next variant before falling back to backoff.
      tryNextVariantRef.current?.()
    })

    audioRef.current = audio

    return () => {
      clearReconnect()
      hlsRef.current?.destroy()
      hlsRef.current = null
      audio.pause()
      audio.src = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPreferenceUpdate = useCallback(
    (update: { volume: number; station: Station | null; updatedAt: string }) => {
      stationRef.current = update.station
      setVolumeState(update.volume)
      if (audioRef.current) audioRef.current.volume = update.volume
      setStation(update.station)
      setPrefsUpdatedAt(update.updatedAt)
      setQueueArr(update.station ? [update.station] : [])
      setQueueIdx(update.station ? 0 : -1)
      setState((prev) =>
        prev !== 'playing' && prev !== 'loading'
          ? update.station ? 'paused' : 'idle'
          : prev,
      )
    },
    [],
  )

  usePlayerStorage({
    volume,
    station,
    updatedAt: prefsUpdatedAt,
    onExternalUpdate: applyPreferenceUpdate,
  })

  usePlayerSync({
    volume,
    station,
    updatedAt: prefsUpdatedAt,
    accessToken: session?.accessToken,
    onRemoteUpdate: applyPreferenceUpdate,
  })

  // Older local/remote preference payloads may only contain legacy station
  // fields without stream variants. Hydrate the current station from API so
  // player UI can display codec/bit-depth/sample-rate/channels reliably.
  useEffect(() => {
    if (!station?.id) return
    if ((station.streams?.length ?? 0) > 0) return

    const controller = new AbortController()
    fetch(`${API}/stations/${station.id}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as ApiStation
      })
      .then((data) => {
        if (!data) return
        const full = toStation(data)
        setStation((prev) => {
          if (!prev || prev.id !== full.id) return prev
          return {
            ...prev,
            ...full,
            // Preserve runtime/user state from the current in-memory station.
            streamUrl: prev.streamUrl || full.streamUrl,
            logo: prev.logo || full.logo,
            genres: prev.genres?.length ? prev.genres : full.genres,
            country: prev.country || full.country,
            city: prev.city || full.city,
            countryCode: prev.countryCode || full.countryCode,
          }
        })
      })
      .catch(() => {
        // Keep current station snapshot when detail fetch fails.
      })

    return () => controller.abort()
  }, [station?.id, station?.streams])

  const touchPreferences = () => {
    setPrefsUpdatedAt(new Date().toISOString())
  }

  const detachHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }

  // Starts playback using whichever variant streamVariantRef.current points at.
  // Callers that want to start fresh (new station, explicit play) should reset
  // streamVariantRef.current = 0 before calling.
  const startStation = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    const variants = getPlayableVariants(s, playbackCaps)
    if (variants.length === 0) {
      setCurrentStream(null)
      setState('error')
      scheduleReconnect()
      return
    }
    let idx = streamVariantRef.current
    if (idx <= 0) {
      const preferred = getPreferredVariantURL(s.id)
      if (preferred) {
        const preferredIndex = variants.findIndex((v) => v.url === preferred)
        if (preferredIndex >= 0) {
          idx = preferredIndex
        }
      }
    }
    idx = Math.min(Math.max(0, idx), Math.max(0, variants.length - 1))
    const variant = variants[idx]
    streamVariantRef.current = idx
    setCurrentStream(variant.source ?? null)

    audio.pause()
    detachHls()
    clearReconnect()
    stationRef.current = s
    setState('loading')
    setStation(s)
    touchPreferences()

    const { url, kind } = variant
    streamVariantURLRef.current = url

    if (kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
        hlsRef.current = hls
        hls.loadSource(url)
        hls.attachMedia(audio)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(() => {
            setState('error')
            tryNextVariantRef.current?.()
          })
        })

        let mediaRecoveryAttempted = false
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          // For MEDIA_ERROR, HLS.js can often recover by reinitialising the
          // codec. Try once before falling back to the failover path.
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecoveryAttempted) {
            mediaRecoveryAttempted = true
            hls.recoverMediaError()
            return
          }
          setState('error')
          tryNextVariantRef.current?.()
        })
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari supports HLS natively.
        audio.src = url
        audio.load()
        audio.play().catch(() => {
          setState('error')
          tryNextVariantRef.current?.()
        })
      } else {
        setState('error')
        tryNextVariantRef.current?.()
      }
    } else {
      audio.src = url
      audio.load()
      audio.play().catch(() => {
        setState('error')
        tryNextVariantRef.current?.()
      })
    }
  }

  // Tries the next stream variant for the current station. If all variants have
  // been exhausted, resets and schedules a backoff reconnect instead.
  const tryNextVariant = () => {
    const s = stationRef.current
    if (!s) return
    const count = getPlayableVariants(s, playbackCaps).length
    if (streamVariantRef.current + 1 < count) {
      streamVariantRef.current++
      startStationRef.current?.(s)
    } else {
      streamVariantRef.current = 0
      scheduleReconnect()
    }
  }

  // Keep refs pointing at the latest implementations so timer closures are
  // always current without needing to re-register event listeners.
  useEffect(() => {
    startStationRef.current = startStation
    tryNextVariantRef.current = tryNextVariant
  })

  const play = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    // Same station — resume if paused, restart if source is gone.
    if (station?.id === s.id && state === 'paused') {
      if (!audio.src && !hlsRef.current) {
        streamVariantRef.current = 0
        startStation(s)
        return
      }
      audio.play().catch(() => setState('error'))
      return
    }

    streamVariantRef.current = 0
    setQueueArr([s])
    setQueueIdx(0)
    startStation(s)
  }

  const setQueue = (stations: Station[], index: number) => {
    if (!stations.length) return
    const i = Math.max(0, Math.min(stations.length - 1, index))
    setQueueArr(stations)
    setQueueIdx(i)
    streamVariantRef.current = 0
    startStation(stations[i])
  }

  const playNext = () => {
    const nextIdx = queueIndex + 1
    if (nextIdx >= queue.length) return
    setQueueIdx(nextIdx)
    streamVariantRef.current = 0
    startStation(queue[nextIdx])
  }

  const playPrev = () => {
    const prevIdx = queueIndex - 1
    if (prevIdx < 0) return
    setQueueIdx(prevIdx)
    streamVariantRef.current = 0
    startStation(queue[prevIdx])
  }

  const pause = () => {
    clearReconnect()
    audioRef.current?.pause()
  }

  const resume = () => {
    const audio = audioRef.current
    if (!audio) return

    // Restart from scratch when in error state or when the source has been
    // cleared (e.g. after stop() followed by opening the player again).
    const s = stationRef.current ?? station
    if (state === 'error' || (!audio.src && !hlsRef.current)) {
      if (s) {
        streamVariantRef.current = 0
        startStation(s)
      }
      return
    }

    audio.play().catch(() => setState('error'))
  }

  const stop = () => {
    const audio = audioRef.current
    if (!audio) return
    clearReconnect()
    reconnectCountRef.current = 0
    streamVariantRef.current = 0
    stationRef.current = null
    audio.pause()
    detachHls()
    audio.removeAttribute('src')
    audio.load()
    setState('idle')
    setStation(null)
    setCurrentStream(null)
    touchPreferences()
    setQueueArr([])
    setQueueIdx(-1)
  }

  const setVolume = (v: number) => {
    const clamped = clampVolume(v)
    setVolumeState(clamped)
    touchPreferences()
    if (audioRef.current) audioRef.current.volume = clamped
  }

  return (
    <PlayerContext.Provider value={{ station, currentStream, state, volume, queue, queueIndex, play, setQueue, playNext, playPrev, pause, resume, stop, setVolume }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
