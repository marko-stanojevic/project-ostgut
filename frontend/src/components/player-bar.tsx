'use client'

import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import {
  Play,
  Pause,
  Stop,
  SpeakerHigh,
  SpeakerX,
  Radio,
  CircleNotch,
} from '@phosphor-icons/react'

export function PlayerBar() {
  const { station, state, volume, pause, resume, stop, setVolume } = usePlayer()

  if (!station && state === 'idle') return null

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-400/25 bg-zinc-900/75 text-zinc-100 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-900/60">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-4">

        {/* Station identity */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-zinc-700/80 flex items-center justify-center ring-1 ring-zinc-300/20">
            {station?.favicon ? (
              <Image src={station.favicon} alt="" fill className="object-cover" unoptimized />
            ) : (
              <Radio className="h-6 w-6 text-zinc-300" />
            )}
            {isPlaying && (
              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{station?.name ?? '—'}</p>
            <p className="truncate text-xs text-zinc-400">
              {isError ? 'Stream unavailable' : isLoading ? 'Connecting…' : [station?.genre, station?.country].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isLoading ? (
            <CircleNotch className="h-7 w-7 animate-spin text-zinc-300" />
          ) : isPlaying ? (
            <button onClick={pause} title="Pause" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition-colors hover:bg-zinc-700/70">
              <Pause className="h-6 w-6" />
            </button>
          ) : (
            <button onClick={resume} disabled={isError} title="Play" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition-colors hover:bg-zinc-700/70 disabled:opacity-40">
              <Play className="h-6 w-6" />
            </button>
          )}
          <button onClick={stop} title="Stop" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 transition-colors hover:bg-zinc-700/70">
            <Stop className="h-6 w-6" />
          </button>
        </div>

        {/* Bitrate */}
        {station?.bitrate ? (
          <span className="hidden shrink-0 text-xs tabular-nums text-zinc-500 sm:inline-flex">
            {station.bitrate} kbps
          </span>
        ) : null}

        {/* Volume */}
        <div className="hidden md:flex items-center gap-2 w-36 shrink-0">
          <button
            onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
            title={volume === 0 ? 'Unmute' : 'Mute'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-zinc-700/70"
          >
            {volume === 0 ? <SpeakerX className="h-6 w-6" /> : <SpeakerHigh className="h-6 w-6" />}
          </button>

          {/* Custom slider — avoids theme color issues */}
          <div className="relative flex flex-1 items-center h-5 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              setVolume(Math.min(1, Math.max(0, x / rect.width)))
            }}
            onMouseMove={(e) => {
              if (e.buttons !== 1) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              setVolume(Math.min(1, Math.max(0, x / rect.width)))
            }}
          >
            {/* Track */}
            <div className="h-[3px] w-full rounded-full bg-zinc-700">
              {/* Fill */}
              <div
                className="h-full rounded-full bg-zinc-100 transition-none"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
            {/* Thumb */}
            <div
              className="absolute h-3 w-3 rounded-full bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${volume * 100}% - 6px)` }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
