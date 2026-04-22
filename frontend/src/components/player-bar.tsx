'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { useNowPlaying } from '@/hooks/useNowPlaying'
import { FullScreenPlayer } from '@/components/full-screen-player'
import { PlayerVolumeControl } from '@/components/player-volume-control'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  RadioIcon,
  CircleNotchIcon,
  ArrowsOutIcon,
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
    <span className="flex h-[14px] items-end gap-[2px] animate-in fade-in duration-300 sm:h-[17px] sm:gap-[2.5px]">
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
  const [fullScreen, setFullScreen] = useState(false)
  useEffect(() => setMounted(true), [])

  const { station, currentStream, state, volume, queue, queueIndex, pause, resume, playNext, playPrev, setVolume } = usePlayer()

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'

  const nowPlaying = useNowPlaying(
    station?.id,
    currentStream?.id,
    (isPlaying || isLoading) && !fullScreen,
  )
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
  const cityLine = station?.city ?? ''
  const hasNowPlaying = Boolean(nowPlaying?.title)
  const secondaryLine = isError
    ? 'Tap play to reconnect'
    : isLoading && !hasNowPlaying
      ? 'Reconnecting to stream'
      : hasNowPlaying
        ? nowPlaying?.artist
          ? `${nowPlaying.artist} · ${nowPlaying.song}`
          : nowPlaying?.title ?? ''
        : cityLine

  if (!mounted) return null
  if (!station && state === 'idle') return null
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1

  return (
    <>
      {fullScreen && (
        <FullScreenPlayer
          nowPlaying={nowPlaying}
          onClose={() => setFullScreen(false)}
        />
      )}
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 border-t border-white/[0.07] bg-[linear-gradient(180deg,rgba(18,18,18,0.88)_0%,rgba(10,10,10,0.96)_100%)] text-zinc-100 backdrop-blur-xl">
      <div
        className="relative grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-4.5 sm:px-5 sm:py-5"
      >

        {/* Station identity — left */}
        <div className="flex min-w-0 items-center justify-self-start gap-3 overflow-visible sm:gap-3.5">
          <div
            className={`absolute bottom-[0.4rem] left-4 flex h-[6.8rem] w-[6.8rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.68rem] bg-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition-all duration-500 sm:bottom-[0.5rem] sm:left-5 sm:h-[8.4rem] sm:w-[8.4rem] sm:rounded-[0.82rem] ${isPlaying
              ? 'shadow-[0_0_20px_rgba(200,116,58,0.22),0_14px_34px_rgba(0,0,0,0.32)]'
              : ''
              }`}
          >
            {station?.logo ? (
              <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-5 w-5 text-zinc-600 sm:h-6 sm:w-6" />
            )}
          </div>
          <div className="min-w-0 pl-[7.55rem] sm:pl-[9.25rem]">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <p className="truncate text-sm font-medium leading-tight text-zinc-100 sm:text-base">
                {station?.name ?? '—'}
              </p>
              {isPlaying && <WaveformBars />}
            </div>
            <p className={`mt-0.5 truncate text-xs sm:mt-0.5 sm:text-sm ${
              isError ? 'text-red-200/80' : hasNowPlaying ? 'text-zinc-300' : 'text-zinc-500'
            }`}>
              {secondaryLine}
            </p>
          </div>
        </div>

        {/* Playback controls — center */}
        <div className="flex shrink-0 items-center justify-self-center gap-1.5 sm:gap-2">
          <button
            onClick={playPrev}
            disabled={!hasPrev}
            title="Previous"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12"
          >
            <SkipBackIcon weight="fill" className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
          </button>
          {isLoading ? (
            <div className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center sm:h-14 sm:w-14">
              <CircleNotchIcon className="h-5.5 w-5.5 animate-spin text-zinc-500 sm:h-6.5 sm:w-6.5" />
            </div>
          ) : isPlaying ? (
            <button
              onClick={pause}
              title="Pause"
              className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-brand/15 text-brand transition-all hover:scale-[1.03] hover:bg-brand/25 sm:h-14 sm:w-14"
            >
              <PauseIcon weight="fill" className="h-5.5 w-5.5 sm:h-6.5 sm:w-6.5" />
            </button>
          ) : (
            <button
              onClick={resume}
              title="Play"
              className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 transition-all hover:scale-[1.03] hover:bg-zinc-700 sm:h-14 sm:w-14"
            >
              <PlayIcon weight="fill" className="ml-0.5 h-5.5 w-5.5 sm:h-6.5 sm:w-6.5" />
            </button>
          )}
          <button
            onClick={playNext}
            disabled={!hasNext}
            title="Next"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12"
          >
            <SkipForwardIcon weight="fill" className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
          </button>
        </div>

        {/* Volume + bitrate — right */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          <div className="hidden items-center gap-2 sm:flex">
            {streamDetails ? (
              <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400 sm:text-sm">
                {streamDetails}
              </span>
            ) : null}
            {bitrateKbps > 0 && !isLosslessLike ? (
              <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs tabular-nums text-zinc-500 sm:text-sm">
                {bitrateKbps} kbps
              </span>
            ) : null}
          </div>

          <button
            onClick={() => setFullScreen(true)}
            title="Full screen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ArrowsOutIcon className="h-4.5 w-4.5" />
          </button>

          <PlayerVolumeControl
            className="hidden w-44 shrink-0 items-center gap-3 md:flex"
            iconClassName="h-5.5 w-5.5"
            volume={volume}
            setVolume={setVolume}
          />
        </div>

      </div>
    </div>
    </>
  )
}
