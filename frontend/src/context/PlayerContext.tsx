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
  clampVolume,
  readPersistedPlayerState,
} from '@/types/player'
import { usePlayerStorage } from '@/hooks/usePlayerStorage'
import { usePlayerSync } from '@/hooks/usePlayerSync'

// Re-export Station so existing consumers don't need to change their imports.
export type { Station } from '@/types/player'

interface PlayerContextValue {
  station: Station | null
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

function isHLS(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  return path.endsWith('.m3u8')
}

// PLS and plain M3U are playlist containers, not audio streams. The audio
// element cannot play them directly. These should be resolved server-side
// before storage; this guard prevents a silent failure if one slips through.
function isPlaylist(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  return path.endsWith('.pls') || (path.endsWith('.m3u') && !path.endsWith('.m3u8'))
}

// Reconnect delays: 3 s → 6 s → 12 s → … capped at 30 s.
const RECONNECT_BASE_MS = 3_000
const RECONNECT_MAX_MS = 30_000
// How long to wait in a stalled/buffering state before forcing a reconnect.
const STALL_TIMEOUT_MS = 8_000

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const initialState = useMemo(() => readPersistedPlayerState(), [])
  const [station, setStation] = useState<Station | null>(initialState?.station ?? null)
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
  // Always points to the latest startStation so stale timer closures still
  // invoke the current implementation.
  const startStationRef = useRef<((s: Station) => void) | null>(null)

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

  // Schedules the next reconnect attempt with exponential backoff.
  const scheduleReconnect = useCallback(() => {
    clearReconnect()
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectCountRef.current,
      RECONNECT_MAX_MS,
    )
    reconnectTimerRef.current = setTimeout(() => {
      const s = stationRef.current
      if (s) startStationRef.current?.(s)
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
      setState('playing')
    })
    audio.addEventListener('pause', () => setState('paused'))
    audio.addEventListener('waiting', () => {
      setState('loading')
      // Start stall watchdog only if one isn't already running.
      if (!stallTimerRef.current) {
        stallTimerRef.current = setTimeout(scheduleReconnect, STALL_TIMEOUT_MS)
      }
    })
    audio.addEventListener('stalled', () => {
      setState('loading')
      if (!stallTimerRef.current) {
        stallTimerRef.current = setTimeout(scheduleReconnect, STALL_TIMEOUT_MS)
      }
    })
    audio.addEventListener('error', () => {
      setState('error')
      scheduleReconnect()
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

  const touchPreferences = () => {
    setPrefsUpdatedAt(new Date().toISOString())
  }

  const detachHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }

  const startStation = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    // Unresolved playlist URLs cannot be played by the audio element.
    if (isPlaylist(s.streamUrl)) {
      setState('error')
      return
    }

    audio.pause()
    detachHls()
    clearReconnect()
    reconnectCountRef.current = 0
    stationRef.current = s
    setState('loading')
    setStation(s)
    touchPreferences()

    if (isHLS(s.streamUrl)) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
        hlsRef.current = hls
        hls.loadSource(s.streamUrl)
        hls.attachMedia(audio)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(() => setState('error'))
        })

        let mediaRecoveryAttempted = false
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          // For MEDIA_ERROR, HLS.js can often recover by reinitialising the
          // codec. Try once before falling back to the reconnect path.
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecoveryAttempted) {
            mediaRecoveryAttempted = true
            hls.recoverMediaError()
            return
          }
          setState('error')
          scheduleReconnect()
        })
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari supports HLS natively.
        audio.src = s.streamUrl
        audio.load()
        audio.play().catch(() => setState('error'))
      } else {
        setState('error')
      }
    } else {
      audio.src = s.streamUrl
      audio.load()
      audio.play().catch(() => setState('error'))
    }
  }

  // Keep the ref pointing at the latest startStation so reconnect timers
  // (which close over the ref) always call the current implementation.
  useEffect(() => {
    startStationRef.current = startStation
  })

  const play = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    // Same station — resume if paused, restart if source is gone.
    if (station?.id === s.id && state === 'paused') {
      if (!audio.src && !hlsRef.current) {
        startStation(s)
        return
      }
      audio.play().catch(() => setState('error'))
      return
    }

    setQueueArr([s])
    setQueueIdx(0)
    startStation(s)
  }

  const setQueue = (stations: Station[], index: number) => {
    if (!stations.length) return
    const i = Math.max(0, Math.min(stations.length - 1, index))
    setQueueArr(stations)
    setQueueIdx(i)
    startStation(stations[i])
  }

  const playNext = () => {
    const nextIdx = queueIndex + 1
    if (nextIdx >= queue.length) return
    setQueueIdx(nextIdx)
    startStation(queue[nextIdx])
  }

  const playPrev = () => {
    const prevIdx = queueIndex - 1
    if (prevIdx < 0) return
    setQueueIdx(prevIdx)
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
      if (s) startStation(s)
      return
    }

    audio.play().catch(() => setState('error'))
  }

  const stop = () => {
    const audio = audioRef.current
    if (!audio) return
    clearReconnect()
    reconnectCountRef.current = 0
    stationRef.current = null
    audio.pause()
    detachHls()
    audio.removeAttribute('src')
    audio.load()
    setState('idle')
    setStation(null)
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
    <PlayerContext.Provider value={{ station, state, volume, queue, queueIndex, play, setQueue, playNext, playPrev, pause, resume, stop, setVolume }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
