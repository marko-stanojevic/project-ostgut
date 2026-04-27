'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { useNowPlaying } from '@/hooks/useNowPlaying'
import { FullScreenPlayer } from '@/components/full-screen-player'
import { resolveDisplayStream } from '@/components/player/resolve-stream'
import { cn } from '@/lib/utils'
import {
  PlayIcon,
  PauseIcon,
  RadioIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react'

/**
 * Compact player chip — replaces the full PlayerBar on the compact form factor.
 *
 * - Sits just above the MobileTabBar (`bottom: var(--mobile-tab-bar-height)`).
 * - Tapping the chip opens the FullScreenPlayer (the same component used by
 *   the desktop player bar's expand button).
 * - The play / pause button is a stop-propagation hit target so the chip can
 *   stay tappable for expansion.
 *
 * Hidden on `md+` where the regular PlayerBar is the primary surface.
 */
export function MobileMiniPlayer() {
  const [mounted, setMounted] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  useEffect(() => setMounted(true), [])

  const { station, currentStream, state, pause, resume } = usePlayer()
  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'

  const displayStream = useMemo(
    () => resolveDisplayStream(station, currentStream),
    [station, currentStream],
  )
  const { nowPlaying } = useNowPlaying(
    station?.id,
    currentStream?.id,
    displayStream,
    (isPlaying || isLoading) && !fullScreen,
  )

  if (!mounted) return null
  if (!station && state === 'idle') return null

  const secondaryLine = isError
    ? 'Tap play to reconnect'
    : nowPlaying?.title
      ? nowPlaying.artist
        ? `${nowPlaying.artist} · ${nowPlaying.song}`
        : nowPlaying.title
      : station?.city && station.city !== '-'
        ? station.city
        : ''

  const togglePlayback = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) pause()
    else resume()
  }

  return (
    <>
      {fullScreen && (
        <FullScreenPlayer
          nowPlaying={nowPlaying}
          onClose={() => setFullScreen(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setFullScreen(true)}
        aria-label="Open full screen player"
        className={cn(
          // Position: above the tab bar plus iOS home indicator.
          'fixed left-2 right-2 z-[var(--z-player)] flex items-center gap-3 rounded-2xl border border-player-bar-border',
          'bg-[image:var(--player-bar-bg)] px-3 py-2 text-left text-player-bar-fg shadow-md backdrop-blur-xl',
          'animate-in slide-in-from-bottom-4 fade-in duration-300 md:hidden',
          'transition-colors hover:bg-player-bar-chip-bg/40',
        )}
        style={{ bottom: 'calc(var(--mobile-tab-bar-height) + var(--safe-bottom) + 0.5rem)' }}
      >
        <span
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-player-bar-artwork-bg shadow-player-artwork transition-shadow',
            isPlaying && 'shadow-player-artwork-glow',
          )}
        >
          {station?.logo ? (
            <Image src={station.logo} alt="" fill loading="eager" fetchPriority="high" className="object-cover" unoptimized />
          ) : (
            <RadioIcon className="h-5 w-5 text-player-bar-artwork-icon" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium tracking-tight">
            {station?.name ?? '—'}
          </span>
          <span
            className={cn(
              'truncate text-[11px]',
              isError ? 'text-destructive' : 'text-player-bar-secondary',
            )}
          >
            {secondaryLine || '\u00A0'}
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlayback}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              if (isPlaying) pause()
              else resume()
            }
          }}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            isPlaying
              ? 'bg-player-accent-soft text-player-accent hover:bg-player-accent-soft-hover'
              : 'bg-player-surface text-player-bar-fg hover:bg-player-surface-hover',
          )}
        >
          {isLoading ? (
            <CircleNotchIcon className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <PauseIcon weight="fill" className="h-4 w-4" />
          ) : (
            <PlayIcon weight="fill" className="ml-0.5 h-4 w-4" />
          )}
        </span>
      </button>
    </>
  )
}
