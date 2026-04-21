'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from '@phosphor-icons/react'

function formatStreamDetails(stream?: {
  codec?: string
  lossless?: boolean
  bitDepth?: number
  sampleRateHz?: number
  sampleRateConfidence?: string
  channels?: number
} | null): string {
  if (!stream) return ''
  const parts: string[] = []
  if (stream.codec) parts.push(stream.codec)
  if (stream.lossless) parts.push('Lossless')
  const hasFormatTuple = (stream.bitDepth ?? 0) > 0 || (stream.sampleRateHz ?? 0) > 0 || (stream.channels ?? 0) > 0
  if (hasFormatTuple || stream.lossless || (stream.codec || '').toUpperCase().includes('FLAC')) {
    parts.push(`${(stream.bitDepth ?? 0) > 0 ? `${stream.bitDepth}` : '-'}-bit`)
    parts.push(`${(stream.sampleRateHz ?? 0) > 0 ? `${stream.sampleRateHz}` : '-'} Hz`)
    parts.push(`${(stream.channels ?? 0) > 0 ? `${stream.channels}` : '-'}ch`)
    const confidence = (stream.sampleRateConfidence || '').toLowerCase()
    if (confidence === 'parsed_streaminfo') parts.push('Verified')
    if (confidence === 'parsed_frame') parts.push('Frame-verified')
  }
  return parts.join(' / ')
}

function WaveformBars() {
  return (
    <span className="flex h-[14px] items-end gap-[2px] sm:h-[17px] sm:gap-[2.5px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-[2.5px] origin-bottom rounded-full bg-brand sm:w-[3px]"
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

export function PlayerBar() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { station, currentStream, state, volume, queue, queueIndex, pause, resume, playNext, playPrev, setVolume } = usePlayer()

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'

  const nowPlaying = useNowPlaying(station?.id, isPlaying || isLoading)
  const displayStream = useMemo(() => {
    if (currentStream) return currentStream
    if (!station?.streams || station.streams.length === 0) return null
    const active = station.streams.filter((st) => st.isActive)
    if (active.length > 0) {
      return [...active].sort((a, b) => a.priority - b.priority)[0]
    }
    return [...station.streams].sort((a, b) => a.priority - b.priority)[0]
  }, [station, currentStream])
  const streamDetails = formatStreamDetails(displayStream)
  const isLosslessLike = Boolean(
    displayStream?.lossless || (displayStream?.codec || '').toUpperCase().includes('FLAC'),
  )
  const bitrateKbps = displayStream ? (displayStream.bitrate ?? 0) : (station?.bitrate || 0)

  if (!mounted) return null
  if (!station && state === 'idle') return null
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.07] bg-zinc-950/92 text-zinc-100 backdrop-blur-xl">
      <div
        className="mx-auto grid max-w-screen-2xl items-center px-4 py-3 sm:px-5 sm:py-4"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >

        {/* Station identity — left */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800 transition-all duration-500 sm:h-13 sm:w-13 sm:rounded-xl ${isPlaying
              ? 'shadow-[0_0_16px_rgba(200,116,58,0.25)]'
              : ''
              }`}
          >
            {station?.logo ? (
              <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-5 w-5 text-zinc-600 sm:h-6 sm:w-6" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <p className="truncate text-sm font-medium leading-tight text-zinc-100 sm:text-base">
                {station?.name ?? '—'}
              </p>
              {isPlaying && <WaveformBars />}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500 sm:mt-1 sm:text-sm">
              {isError
                ? 'Stream unavailable'
                : isLoading && !nowPlaying
                  ? 'Connecting…'
                  : nowPlaying?.title
                    ? nowPlaying.artist
                      ? `${nowPlaying.artist} · ${nowPlaying.song}`
                      : nowPlaying.title
                    : [(station?.genres ?? []).join(', ') || undefined, [station?.city, station?.country].filter(Boolean).join(', ') || undefined].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Playback controls — center */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={playPrev}
            disabled={!hasPrev}
            title="Previous"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <SkipBackIcon weight="fill" className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          {isLoading ? (
            <div className="flex h-11 w-11 items-center justify-center sm:h-13 sm:w-13">
              <CircleNotchIcon className="h-5 w-5 animate-spin text-zinc-500 sm:h-6 sm:w-6" />
            </div>
          ) : isPlaying ? (
            <button
              onClick={pause}
              title="Pause"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand transition-all hover:bg-brand/25 sm:h-13 sm:w-13"
            >
              <PauseIcon weight="fill" className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          ) : (
            <button
              onClick={resume}
              disabled={isError}
              title="Play"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 transition-all hover:bg-zinc-700 disabled:opacity-40 sm:h-13 sm:w-13"
            >
              <PlayIcon weight="fill" className="ml-0.5 h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          <button
            onClick={playNext}
            disabled={!hasNext}
            title="Next"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <SkipForwardIcon weight="fill" className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Volume + bitrate — right */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          {streamDetails ? (
            <span className="hidden shrink-0 text-xs text-zinc-600 sm:inline-flex sm:text-sm">
              {streamDetails}
            </span>
          ) : null}
          {bitrateKbps > 0 && !isLosslessLike ? (
            <span className="hidden shrink-0 text-xs tabular-nums text-zinc-600 sm:inline-flex sm:text-sm">
              {bitrateKbps} kbps
            </span>
          ) : null}

          <div className="hidden w-44 shrink-0 items-center gap-3 md:flex">
            <button
              onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
              title={volume === 0 ? 'Unmute' : 'Mute'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              {volume === 0
                ? <SpeakerXIcon className="h-5.5 w-5.5" />
                : <SpeakerHighIcon className="h-5.5 w-5.5" />
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
                className="absolute h-3.5 w-3.5 rounded-full bg-zinc-300 shadow-sm opacity-90 transition-opacity group-hover:opacity-100"
                style={{ left: `calc(${volume * 100}% - 7px)` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
