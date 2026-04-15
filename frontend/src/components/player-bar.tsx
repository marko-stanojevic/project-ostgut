'use client'

import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import {
  PlayIcon,
  PauseIcon,
  SpeakerHighIcon,
  SpeakerXIcon,
  RadioIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react'

function WaveformBars() {
  return (
    <span className="flex items-end gap-[2px]" style={{ height: '14px' }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-brand origin-bottom block"
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
  const { station, state, volume, pause, resume, setVolume } = usePlayer()

  if (!station && state === 'idle') return null

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.07] bg-zinc-950/92 text-zinc-100 backdrop-blur-xl">
      <div
        className="mx-auto grid max-w-screen-2xl items-center px-4 py-3"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >

        {/* Station identity — left */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-800 flex items-center justify-center transition-all duration-500 ${isPlaying
                ? 'ring-2 ring-brand/50 shadow-[0_0_16px_rgba(200,116,58,0.25)]'
                : 'ring-1 ring-white/8'
              }`}
          >
            {station?.favicon ? (
              <Image src={station.favicon} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-5 w-5 text-zinc-600" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <p className="truncate text-sm font-medium leading-tight text-zinc-100">
                {station?.name ?? '—'}
              </p>
              {isPlaying && <WaveformBars />}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {isError
                ? 'Stream unavailable'
                : isLoading
                  ? 'Connecting…'
                  : [station?.genre, station?.country].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Playback controls — center */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isLoading ? (
            <div className="flex h-11 w-11 items-center justify-center">
              <CircleNotchIcon className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : isPlaying ? (
            <button
              onClick={pause}
              title="Pause"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand ring-1 ring-brand/20 transition-all hover:bg-brand/25"
            >
              <PauseIcon weight="fill" className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={resume}
              disabled={isError}
              title="Play"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 ring-1 ring-white/8 transition-all hover:bg-zinc-700 disabled:opacity-40"
            >
              <PlayIcon weight="fill" className="h-5 w-5 ml-0.5" />
            </button>
          )}
        </div>

        {/* Volume + bitrate — right */}
        <div className="flex items-center justify-end gap-3">
          {station?.bitrate ? (
            <span className="hidden shrink-0 text-xs tabular-nums text-zinc-600 sm:inline-flex">
              {station.bitrate} kbps
            </span>
          ) : null}

          <div className="hidden md:flex items-center gap-2 w-32 shrink-0">
            <button
              onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
              title={volume === 0 ? 'Unmute' : 'Mute'}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-zinc-300"
            >
              {volume === 0
                ? <SpeakerXIcon className="h-4 w-4" />
                : <SpeakerHighIcon className="h-4 w-4" />
              }
            </button>

            <div
              className="relative flex flex-1 items-center h-4 cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setVolume(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
              }}
              onMouseMove={(e) => {
                if (e.buttons !== 1) return
                const rect = e.currentTarget.getBoundingClientRect()
                setVolume(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
              }}
            >
              <div className="h-[3px] w-full rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-500 group-hover:bg-zinc-300 transition-colors"
                  style={{ width: `${volume * 100}%` }}
                />
              </div>
              <div
                className="absolute h-2.5 w-2.5 rounded-full bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${volume * 100}% - 5px)` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
