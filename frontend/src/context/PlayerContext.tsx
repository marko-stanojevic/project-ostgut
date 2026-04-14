'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

export interface Station {
  id: string
  name: string
  streamUrl: string
  favicon?: string
  genre: string
  country: string
  countryCode: string
  bitrate: number
  codec: string
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface PlayerContextValue {
  station: Station | null
  state: PlayerState
  volume: number
  play: (station: Station) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setVolume: (v: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [station, setStation] = useState<Station | null>(null)
  const [state, setState] = useState<PlayerState>('idle')
  const [volume, setVolumeState] = useState(0.8)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
      audio.pause()
      audio.src = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const play = (s: Station) => {
    const audio = audioRef.current
    if (!audio) return

    // Same station — just resume if paused.
    if (station?.id === s.id && state === 'paused') {
      if (!audio.src) {
        audio.src = s.streamUrl
        audio.load()
      }
      audio.play().catch(() => setState('error'))
      return
    }

    audio.pause()
    audio.src = s.streamUrl
    setState('loading')
    setStation(s)
    audio.load()
    audio.play().catch(() => setState('error'))
  }

  const pause = () => {
    audioRef.current?.pause()
  }

  const resume = () => {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.src && station) {
      audio.src = station.streamUrl
      audio.load()
    }

    audio.play().catch(() => setState('error'))
  }

  const stop = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    setState('idle')
  }

  const setVolume = (v: number) => {
    if (!Number.isFinite(v)) return
    const clamped = Math.max(0, Math.min(1, v))
    setVolumeState(clamped)
    if (audioRef.current) audioRef.current.volume = clamped
  }

  return (
    <PlayerContext.Provider value={{ station, state, volume, play, pause, resume, stop, setVolume }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
