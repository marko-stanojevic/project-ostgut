'use client'

import { useEffect, useMemo } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { PlayerDeviceMenu } from '@/components/player-device-menu'
import { PlayerVolumeControl } from '@/components/player-volume-control'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  RadioIcon,
  CircleNotchIcon,
  ArrowsInIcon,
} from '@phosphor-icons/react'
import type { StationStream } from '@/types/player'
import type { NowPlaying } from '@/hooks/useNowPlaying'

function WaveformBars() {
  return (
    <span className="flex h-4 items-end gap-[3px] animate-in fade-in duration-300">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-[3px] origin-bottom rounded-full bg-player-accent"
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
  nowPlaying: NowPlaying | null
  onClose: () => void
}

function formatMetadataLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase() === 'icy') return 'ICY'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

function getMetadataBadges(
  stream: StationStream | null,
  nowPlaying: NowPlaying | null,
): string[] {
  if (!stream?.metadataEnabled) return []

  const badges = ['Metadata: Server']

  if (stream.metadataClientCandidate) {
    badges.push('Metadata: Client Candidate')
  }

  if (stream.metadataType && stream.metadataType !== 'auto') {
    badges.push(`Probe: ${formatMetadataLabel(stream.metadataType)}`)
  }

  const source = nowPlaying?.source || stream.metadataSource || ''
  if (source) {
    badges.push(`Live: ${formatMetadataLabel(source)}`)
  }

  return badges
}

function resolveDisplayStream(
  station: { streams?: StationStream[] } | null,
  currentStream: StationStream | null,
): StationStream | null {
  const streams = station?.streams ?? []
  if (currentStream) {
    const latest = streams.find((stream) => {
      if (currentStream.id && stream.id === currentStream.id) return true
      if (currentStream.resolvedUrl && stream.resolvedUrl === currentStream.resolvedUrl) return true
      if (currentStream.url && stream.url === currentStream.url) return true
      return stream.priority === currentStream.priority
    })
    return latest ?? currentStream
  }

  if (streams.length === 0) return null
  const active = streams.filter((st) => st.isActive)
  if (active.length > 0) return [...active].sort((a, b) => a.priority - b.priority)[0]
  return [...streams].sort((a, b) => a.priority - b.priority)[0]
}

export function FullScreenPlayer({ nowPlaying, onClose }: FullScreenPlayerProps) {
  const {
    station,
    currentStream,
    state,
    volume,
    normalizationEnabled,
    queue,
    queueIndex,
    pause,
    resume,
    playNext,
    playPrev,
    setVolume,
    setNormalizationEnabled,
  } = usePlayer()

  const isPlaying = state === 'playing'
  const isLoading = state === 'loading'
  const isError = state === 'error'
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1

  const displayStream = useMemo(
    () => resolveDisplayStream(station, currentStream),
    [station, currentStream],
  )

  const bitrateKbps = displayStream ? (displayStream.bitrate ?? 0) : (station?.bitrate || 0)
  const isLosslessLike = Boolean(displayStream?.lossless || (displayStream?.codec || '').toUpperCase().includes('FLAC'))
  const codecLabel = displayStream?.codec ? displayStream.codec.toUpperCase() : null
  const metadataBadges = getMetadataBadges(displayStream, nowPlaying)

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
  const hasNowPlaying = Boolean(nowPlaying?.title)
  const fallbackLine = [genreLine || undefined, locationLine || undefined].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-[60] flex animate-in fade-in duration-300 flex-col bg-[image:var(--player-screen-bg)] text-player-screen-fg">
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--player-overlay-top),transparent_34%),radial-gradient(circle_at_bottom,var(--player-overlay-bottom),transparent_28%)]"
      />

      {/* Collapse button */}
      <div className="relative flex animate-in slide-in-from-top-3 fade-in duration-300 items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-player-screen-muted">
            Listening Room
          </span>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] ${
            isError
              ? 'border-red-500/30 bg-red-500/10 text-red-200/80'
              : isLoading
                ? 'border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel-strong)] text-player-screen-secondary'
                : isPlaying
                  ? 'border-player-accent-border bg-player-accent-soft text-player-accent'
                  : 'border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] text-player-screen-muted'
          }`}>
            {(isPlaying || isLoading) && !isError ? (
              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                isPlaying ? 'animate-pulse bg-player-accent' : 'animate-pulse bg-player-screen-secondary'
              }`} />
            ) : null}
            {isError ? 'Recover' : isLoading ? 'Connecting' : isPlaying ? 'Live' : 'Paused'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <PlayerDeviceMenu />
          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={onClose}
              aria-label="Close full screen"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--player-screen-panel-border)] text-player-screen-icon transition-colors hover:bg-[var(--player-screen-panel)] hover:text-player-screen-icon-hover"
            >
              <ArrowsInIcon className="h-5 w-5" />
            </TooltipTrigger>
            <TooltipContent>Close full screen</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <div className="relative flex flex-1 animate-in slide-in-from-bottom-4 fade-in duration-500 flex-col items-center justify-center gap-8 px-8 pb-8 sm:gap-10">
        {/* Station artwork */}
        <div className="relative">
          <div
            aria-hidden="true"
            className={`absolute inset-[-10%] rounded-full blur-3xl transition-all duration-700 ${
              isPlaying ? 'bg-player-accent-soft-hover opacity-100' : 'bg-[var(--player-screen-panel)] opacity-60'
            }`}
          />
          <div
            className={`relative flex h-52 w-52 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-[var(--player-screen-panel-border)] bg-player-screen-artwork-bg shadow-2xl transition-all duration-500 sm:h-64 sm:w-64 ${isPlaying ? 'shadow-[0_0_36px_var(--player-accent-glow)]' : ''}`}
          >
            {station?.logo ? (
              <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-16 w-16 text-player-screen-artwork-icon" />
            )}
          </div>
        </div>

        {/* Station info */}
        <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-player-screen-fg sm:text-5xl">
              {station?.name ?? '—'}
            </h2>
            {isPlaying && <WaveformBars />}
          </div>

          {hasNowPlaying ? (
            <div className="space-y-1">
              <p className="text-lg font-medium text-player-screen-fg sm:text-2xl">
                {nowPlaying?.song ?? nowPlaying?.title}
              </p>
              {nowPlaying?.artist ? (
                <p className="text-sm uppercase tracking-[0.24em] text-player-screen-muted sm:text-base">
                  {nowPlaying.artist}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-base text-player-screen-secondary sm:text-lg">
              {fallbackLine}
            </p>
          )}

          <div className={`rounded-full border px-4 py-2 text-sm transition-all duration-300 ${
            isError
              ? 'border-red-500/30 bg-red-500/10 text-red-200/80'
            : isLoading
                ? 'border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel-strong)] text-player-screen-secondary'
                : 'border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] text-player-screen-muted'
          }`}>
            {isError
              ? 'Stream unavailable. Press play to try again.'
              : isLoading
                ? 'Reconnecting to the live stream…'
                : 'Live radio stays uninterrupted while you browse.'}
          </div>

          {/* Quality badge */}
          {(isLosslessLike || codecLabel || bitrateKbps > 0 || locationLine || metadataBadges.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {locationLine ? (
                <span className="rounded-full border border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] px-3 py-1 text-xs font-medium text-player-screen-secondary">
                  {locationLine}
                </span>
              ) : null}
              {isLosslessLike && (
                <span className="rounded-full border border-player-accent-border bg-player-accent-soft px-3 py-1 text-xs font-medium text-player-accent">
                  Lossless
                </span>
              )}
              {codecLabel && !isLosslessLike && (
                <span className="rounded-full border border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel-strong)] px-3 py-1 text-xs font-medium text-player-screen-secondary">
                  {codecLabel}
                </span>
              )}
              {bitrateKbps > 0 && !isLosslessLike && (
                <span className="rounded-full border border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] px-3 py-1 text-xs tabular-nums text-player-screen-muted">{bitrateKbps} kbps</span>
              )}
              {metadataBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-[var(--player-screen-panel-border)] bg-[var(--player-screen-panel)] px-3 py-1 text-xs font-medium text-player-screen-secondary"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={playPrev}
              disabled={!hasPrev}
              aria-label="Previous"
              className="flex h-12 w-12 items-center justify-center rounded-full text-player-screen-icon transition-all hover:bg-[var(--player-screen-panel)] hover:text-player-screen-icon-hover disabled:cursor-not-allowed disabled:opacity-25"
            >
              <SkipBackIcon weight="fill" className="h-6 w-6" />
            </TooltipTrigger>
            <TooltipContent>Previous</TooltipContent>
          </Tooltip>

          {isLoading ? (
            <div className="flex h-16 w-16 animate-in zoom-in-90 fade-in duration-200 items-center justify-center">
              <CircleNotchIcon className="h-7 w-7 animate-spin text-player-screen-muted" />
            </div>
          ) : isPlaying ? (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={pause}
                aria-label="Pause"
                className="flex h-16 w-16 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-accent-soft text-player-accent transition-all hover:scale-[1.03] hover:bg-player-accent-soft-hover"
              >
                <PauseIcon weight="fill" className="h-7 w-7" />
              </TooltipTrigger>
              <TooltipContent>Pause</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={resume}
                aria-label="Play"
                className="flex h-16 w-16 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-surface text-player-screen-fg transition-all hover:scale-[1.03] hover:bg-player-surface-hover"
              >
                <PlayIcon weight="fill" className="ml-0.5 h-7 w-7" />
              </TooltipTrigger>
              <TooltipContent>Play</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={playNext}
              disabled={!hasNext}
              aria-label="Next"
              className="flex h-12 w-12 items-center justify-center rounded-full text-player-screen-icon transition-all hover:bg-[var(--player-screen-panel)] hover:text-player-screen-icon-hover disabled:cursor-not-allowed disabled:opacity-25"
            >
              <SkipForwardIcon weight="fill" className="h-6 w-6" />
            </TooltipTrigger>
            <TooltipContent>Next</TooltipContent>
          </Tooltip>
        </div>

        {/* Volume control */}
        <PlayerVolumeControl
          className="flex w-full max-w-md flex-col"
          labelClassName="w-11 text-right text-sm tabular-nums text-player-muted"
          normalizationEnabled={normalizationEnabled}
          showNormalizationActivity={isPlaying || isLoading}
          onToggleNormalization={setNormalizationEnabled}
          showPercentage
          volume={volume}
          setVolume={setVolume}
        />
      </div>
    </div>
  )
}
