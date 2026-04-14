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
    <div className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden border-t border-zinc-400/25 bg-gradient-to-b from-slate-500/36 via-zinc-700/54 to-zinc-950/78 text-zinc-100 shadow-[0_-10px_30px_rgba(0,0,0,0.46)] backdrop-blur-md supports-[backdrop-filter]:from-slate-400/26 supports-[backdrop-filter]:via-zinc-700/50 supports-[backdrop-filter]:to-zinc-950/70">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-10 top-0 h-full w-[42%] opacity-40"
        style={{
          clipPath: 'polygon(0 0, 92% 0, 76% 100%, 0 100%)',
          backgroundImage:
            'linear-gradient(102deg, rgba(236,239,244,0.22) 0%, rgba(148,163,184,0.06) 32%, rgba(17,24,39,0.36) 100%), radial-gradient(circle at 22% 68%, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0) 48%), radial-gradient(circle at 38% 30%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[44%] top-0 h-full w-20 -skew-x-[18deg] opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(82,82,91,0.5) 55%, rgba(10,10,10,0.58) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-6 top-[18%] h-[60%] w-[26%] rounded-[40%] opacity-35 blur-[0.6px]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 34% 42%, rgba(214,211,209,0.24) 0%, rgba(214,211,209,0.04) 30%, rgba(0,0,0,0) 65%), radial-gradient(circle at 66% 64%, rgba(87,83,78,0.42) 0%, rgba(87,83,78,0.12) 46%, rgba(0,0,0,0) 78%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 right-[21%] h-px w-28 rotate-[7deg] opacity-60"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.28), rgba(113,113,122,0.16), rgba(0,0,0,0))' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[9%] top-[12%] h-7 w-14 rotate-[-11deg] opacity-55 blur-[0.2px]"
        style={{
          clipPath: 'polygon(3% 32%, 22% 6%, 51% 10%, 77% 0, 100% 22%, 85% 68%, 56% 94%, 20% 86%, 0 62%)',
          backgroundImage:
            'radial-gradient(circle at 30% 58%, rgba(249,115,22,0.45) 0%, rgba(180,83,9,0.4) 30%, rgba(120,53,15,0.1) 64%, rgba(0,0,0,0) 100%), radial-gradient(circle at 72% 34%, rgba(251,191,36,0.28) 0%, rgba(180,83,9,0.18) 38%, rgba(0,0,0,0) 76%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[53%] bottom-[16%] h-6 w-11 rotate-[8deg] opacity-45"
        style={{
          clipPath: 'polygon(0 42%, 15% 12%, 48% 0, 88% 16%, 100% 48%, 70% 94%, 23% 100%, 5% 76%)',
          backgroundImage:
            'radial-gradient(circle at 42% 44%, rgba(217,119,6,0.36) 0%, rgba(154,52,18,0.3) 34%, rgba(68,64,60,0.1) 60%, rgba(0,0,0,0) 92%), radial-gradient(circle at 64% 72%, rgba(120,53,15,0.34) 0%, rgba(120,53,15,0.08) 52%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[11%] top-[8%] h-10 w-16 rotate-[14deg] opacity-40"
        style={{
          clipPath: 'polygon(2% 26%, 26% 2%, 61% 8%, 94% 22%, 100% 50%, 78% 82%, 39% 100%, 8% 78%)',
          backgroundImage:
            'radial-gradient(circle at 32% 42%, rgba(251,146,60,0.34) 0%, rgba(194,65,12,0.24) 34%, rgba(120,53,15,0.08) 58%, rgba(0,0,0,0) 90%), radial-gradient(circle at 70% 60%, rgba(146,64,14,0.34) 0%, rgba(113,63,18,0.14) 40%, rgba(0,0,0,0) 78%), radial-gradient(circle at 56% 28%, rgba(255,245,220,0.16) 0%, rgba(255,245,220,0) 28%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[58%] top-[10%] h-8 w-24 rotate-[-6deg] opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 8% 40%, rgba(245,158,11,0.42) 0 1px, transparent 2px), radial-gradient(circle at 18% 62%, rgba(180,83,9,0.34) 0 1px, transparent 2px), radial-gradient(circle at 35% 30%, rgba(251,146,60,0.34) 0 1px, transparent 2px), radial-gradient(circle at 57% 56%, rgba(180,83,9,0.3) 0 1px, transparent 2px), radial-gradient(circle at 79% 36%, rgba(146,64,14,0.28) 0 1px, transparent 2px)',
        }}
      />
      <div className="relative z-10 mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-4">

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
