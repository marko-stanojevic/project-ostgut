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

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = volume

    audio.addEventListener('playing', () => setState('playing'))
    audio.addEventListener('pause', () => setState('paused'))
    audio.addEventListener('waiting', () => setState('loading'))
    audio.addEventListener('error', () => setState('error'))
    audio.addEventListener('stalled', () => setState('loading'))

    audioRef.current = audio

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      audio.pause()
      audio.src = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPreferenceUpdate = useCallback(
    (update: { volume: number; station: Station | null; updatedAt: string }) => {
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

    audio.pause()
    detachHls()
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
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setState('error')
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

  const play = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    // Same station — just resume if paused.
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
    audioRef.current?.pause()
  }

  const resume = () => {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.src && !hlsRef.current && station) {
      startStation(station)
      return
    }

    audio.play().catch(() => setState('error'))
  }

  const stop = () => {
    const audio = audioRef.current
    if (!audio) return
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
