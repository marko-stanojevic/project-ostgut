'use client'

import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Play,
  Pause,
  Square,
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 text-zinc-50 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/90">
      <div className="flex items-center gap-4 px-4 py-3 max-w-screen-2xl mx-auto">

        {/* Station identity */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative h-9 w-9 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
            {station?.favicon ? (
              <Image
                src={station.favicon}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <Radio className="h-4 w-4 text-muted-foreground" />
            )}
            {/* Live pulse indicator */}
            {isPlaying && (
              <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">
              {station?.name ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {isError
                ? 'Stream unavailable'
                : isLoading
                  ? 'Connecting…'
                  : [station?.genre, station?.country].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1 shrink-0">
          {isLoading ? (
            <CircleNotch className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isPlaying ? (
            <Button variant="ghost" size="icon" onClick={pause} title="Pause">
              <Pause className="h-5 w-5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={resume} disabled={isError} title="Play">
              <Play className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={stop} title="Stop">
            <Square className="h-4 w-4" />
          </Button>
        </div>

        {/* Bitrate badge */}
        {station?.bitrate ? (
          <span className="hidden sm:inline-flex text-xs text-muted-foreground tabular-nums shrink-0">
            {station.bitrate} kbps
          </span>
        ) : null}

        {/* Volume */}
        <div className="hidden md:flex items-center gap-2 w-32 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? (
              <SpeakerX className="h-4 w-4" />
            ) : (
              <SpeakerHigh className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[volume * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={(vals) => setVolume((vals as number[])[0] / 100)}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}
