'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { usePlayer } from '@/context/PlayerContext'
import { useRouter } from '@/i18n/navigation'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'
import { PlayIcon, PauseIcon, RadioIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface CarPlayClientProps {
  initialStations: ApiStation[]
}

/**
 * CarPlay surface — landscape, large hit targets, no chrome.
 *
 * Renders a tight grid of "for you" stations from the curated feed. Tapping a
 * tile sets the queue and starts playback through the same `PlayerContext`
 * used everywhere else, so handoff between phone and car is seamless.
 *
 * Hit targets follow CarPlay HIG: >= 64px logical, generous spacing, and
 * tracking-tight type at 1.25rem so glanceable while driving.
 */
export function CarPlayClient({ initialStations }: CarPlayClientProps) {
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()
  const { station: activeStation, state, setQueue, pause, resume } = usePlayer()

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      router.replace('/auth/login?redirect=/carplay')
    }
  }, [authLoading, session, router])

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'

  const handleTile = (index: number) => {
    const queue = initialStations.map(toStation)
    const tappedSameAsActive = activeStation?.id === initialStations[index]?.id
    if (tappedSameAsActive) {
      if (isPlaying) pause()
      else resume()
      return
    }
    setQueue(queue, index)
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 px-6 py-6 carplay:gap-8 carplay:px-10 carplay:py-8">
      <div className="flex items-center gap-4 rounded-3xl border border-border/40 bg-secondary/40 p-4 carplay:gap-6 carplay:p-6">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-player-bar-artwork-bg carplay:h-20 carplay:w-20">
          {activeStation?.logo ? (
            <Image src={activeStation.logo} alt="" fill className="object-cover" unoptimized />
          ) : (
            <RadioIcon className="h-7 w-7 text-player-bar-artwork-icon carplay:h-9 carplay:w-9" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xl font-semibold tracking-tight carplay:text-2xl">
            {activeStation?.name ?? 'Pick a station'}
          </p>
          <p className="truncate text-sm text-muted-foreground carplay:text-base">
            {activeStation?.city || activeStation?.country || 'Tap a tile below to start listening'}
          </p>
        </div>
        {activeStation && (
          <button
            type="button"
            onClick={isPlaying ? pause : resume}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-all carplay:h-20 carplay:w-20',
              isPlaying
                ? 'bg-player-accent-soft text-player-accent hover:bg-player-accent-soft-hover'
                : 'bg-player-surface text-player-bar-fg hover:bg-player-surface-hover',
            )}
          >
            {isLoading ? (
              <CircleNotchIcon className="h-7 w-7 animate-spin carplay:h-9 carplay:w-9" />
            ) : isPlaying ? (
              <PauseIcon weight="fill" className="h-7 w-7 carplay:h-9 carplay:w-9" />
            ) : (
              <PlayIcon weight="fill" className="ml-1 h-7 w-7 carplay:h-9 carplay:w-9" />
            )}
          </button>
        )}
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 carplay:grid-cols-3 carplay:gap-6">
        {initialStations.slice(0, 6).map((station, index) => {
          const active = activeStation?.id === station.id
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => handleTile(index)}
              className={cn(
                'group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-3xl border p-4 text-left transition-all carplay:p-6',
                active
                  ? 'border-player-accent-border bg-player-accent-soft/40 ring-2 ring-player-accent-border'
                  : 'border-border/40 bg-secondary/40 hover:border-border hover:bg-secondary/60',
              )}
            >
              {station.logo ? (
                <Image
                  src={station.logo}
                  alt=""
                  fill
                  className="object-cover opacity-30 transition-opacity group-hover:opacity-40"
                  unoptimized
                />
              ) : null}
              <div className="relative z-10 flex flex-col gap-1">
                <p className="truncate text-lg font-semibold tracking-tight carplay:text-xl">
                  {station.name}
                </p>
                <p className="truncate text-xs uppercase tracking-wider text-muted-foreground carplay:text-sm">
                  {station.city || station.country}
                </p>
              </div>
              {active && isPlaying && (
                <span className="absolute right-4 top-4 z-10 ui-nav-live-dot h-3 w-3 animate-pulse rounded-full carplay:h-4 carplay:w-4" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
