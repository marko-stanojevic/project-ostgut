'use client'

import { useEffect, useMemo } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { useNowPlaying } from '@/hooks/useNowPlaying'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  SpeakerXIcon,
  RadioIcon,
  CircleNotchIcon,
  ArrowsInIcon,
} from '@phosphor-icons/react'

function WaveformBars() {
  return (
    <span className="flex h-4 items-end gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-[3px] origin-bottom rounded-full bg-brand"
          style={{
            height: '100%',
            animation: 'wave-bar 0.9s ease-in-out infinite',
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
    </span>
  )
}

interface FullScreenPlayerProps {
  onClose: () => void
}

export function FullScreenPlayer({ onClose }: FullScreenPlayerProps) {
  const { station, currentStream, state, volume, queue, queueIndex, pause, resume, playNext, playPrev, setVolume } = usePlayer()

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1

  const nowPlaying = useNowPlaying(station?.id, currentStream?.id, isPlaying || isLoading)

  const displayStream = useMemo(() => {
    if (currentStream) return currentStream
    if (!station?.streams || station.streams.length === 0) return null
    const active = station.streams.filter((st) => st.isActive)
    if (active.length > 0) return [...active].sort((a, b) => a.priority - b.priority)[0]
    return [...station.streams].sort((a, b) => a.priority - b.priority)[0]
  }, [station, currentStream])

  const bitrateKbps = displayStream ? (displayStream.bitrate ?? 0) : (station?.bitrate || 0)
  const isLosslessLike = Boolean(displayStream?.lossless || (displayStream?.codec || '').toUpperCase().includes('FLAC'))
  const codecLabel = displayStream?.codec ? displayStream.codec.toUpperCase() : null

  // Enter browser fullscreen and exit when the overlay closes
  useEffect(() => {
    if (document.fullscreenElement) return
    document.documentElement.requestFullscreen().catch(() => {/* denied or unsupported */})
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // Sync overlay close when user exits fullscreen via browser controls / Escape
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) onClose() }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [onClose])

  const locationLine = [station?.city, station?.country].filter(Boolean).join(', ')
  const genreLine = (station?.genres ?? []).join(', ')

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950">
      {/* Blurred artwork background */}
      {station?.logo && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Image
            src={station.logo}
            alt=""
            fill
            className="scale-110 object-cover opacity-10 blur-3xl"
            unoptimized
          />
        </div>
      )}

      {/* Collapse button */}
      <div className="relative flex items-center justify-end px-6 pt-6">
        <button
          onClick={onClose}
          title="Close full screen"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
        >
          <ArrowsInIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-10 px-8 pb-8">
        {/* Station artwork */}
        <div
          className={`relative flex h-52 w-52 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-800 shadow-2xl transition-all duration-500 sm:h-64 sm:w-64 ${isPlaying ? 'shadow-brand/20' : ''}`}
        >
          {station?.logo ? (
            <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
          ) : (
            <RadioIcon className="h-16 w-16 text-zinc-600" />
          )}
        </div>

        {/* Station info */}
        <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              {station?.name ?? '—'}
            </h2>
            {isPlaying && <WaveformBars />}
          </div>

          <p className="text-base text-zinc-400">
            {isError
              ? 'Stream unavailable'
              : isLoading && !nowPlaying
                ? 'Connecting…'
                : nowPlaying?.title
                  ? nowPlaying.artist
                    ? `${nowPlaying.artist} · ${nowPlaying.song}`
                    : nowPlaying.title
                  : [genreLine || undefined, locationLine || undefined].filter(Boolean).join(' · ')}
          </p>

          {/* Quality badge */}
          {(isLosslessLike || codecLabel || bitrateKbps > 0) && (
            <div className="mt-1 flex items-center gap-2">
              {isLosslessLike && (
                <span className="rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  Lossless
                </span>
              )}
              {codecLabel && !isLosslessLike && (
                <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                  {codecLabel}
                </span>
              )}
              {bitrateKbps > 0 && !isLosslessLike && (
                <span className="text-xs tabular-nums text-zinc-600">{bitrateKbps} kbps</span>
              )}
            </div>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={playPrev}
            disabled={!hasPrev}
            title="Previous"
            className="flex h-12 w-12 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <SkipBackIcon weight="fill" className="h-6 w-6" />
          </button>

          {isLoading ? (
            <div className="flex h-16 w-16 items-center justify-center">
              <CircleNotchIcon className="h-7 w-7 animate-spin text-zinc-500" />
            </div>
          ) : isPlaying ? (
            <button
              onClick={pause}
              title="Pause"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand transition-all hover:bg-brand/25"
            >
              <PauseIcon weight="fill" className="h-7 w-7" />
            </button>
          ) : (
            <button
              onClick={resume}
              disabled={isError}
              title="Play"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 transition-all hover:bg-zinc-700 disabled:opacity-40"
            >
              <PlayIcon weight="fill" className="ml-0.5 h-7 w-7" />
            </button>
          )}

          <button
            onClick={playNext}
            disabled={!hasNext}
            title="Next"
            className="flex h-12 w-12 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <SkipForwardIcon weight="fill" className="h-6 w-6" />
          </button>
        </div>

        {/* Volume control */}
        <div className="flex w-full max-w-xs items-center gap-3">
          <button
            onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
            title={volume === 0 ? 'Unmute' : 'Mute'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            {volume === 0
              ? <SpeakerXIcon className="h-5 w-5" />
              : <SpeakerHighIcon className="h-5 w-5" />
            }
          </button>

          <div
            className="group relative flex h-6 flex-1 cursor-pointer items-center"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setVolume(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
            }}
            onMouseMove={(e) => {
              if (e.buttons !== 1) return
              const rect = e.currentTarget.getBoundingClientRect()
              setVolume(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
            }}
            onTouchStart={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setVolume(Math.min(1, Math.max(0, (e.touches[0].clientX - rect.left) / rect.width)))
            }}
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setVolume(Math.min(1, Math.max(0, (e.touches[0].clientX - rect.left) / rect.width)))
            }}
          >
            <div className="h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-500 transition-colors group-hover:bg-zinc-300"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
            <div
              className="absolute h-3.5 w-3.5 rounded-full bg-zinc-300 opacity-90 shadow-sm transition-opacity group-hover:opacity-100"
              style={{ left: `calc(${volume * 100}% - 7px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
