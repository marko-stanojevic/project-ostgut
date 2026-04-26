'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { useNowPlaying } from '@/hooks/useNowPlaying'
import { FullScreenPlayer } from '@/components/full-screen-player'
import { PlayerDeviceMenu } from '@/components/player-device-menu'
import { PlayerVolumeControl } from '@/components/player-volume-control'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildMetadataBadges } from '@/lib/metadata-badges'
import { resolveDisplayStream } from '@/components/player/resolve-stream'
import type { NowPlaying } from '@/hooks/useNowPlaying'
import type { StationStream } from '@/types/player'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  RadioIcon,
  CircleNotchIcon,
  CornersOutIcon,
} from '@phosphor-icons/react'

type PlayerStatBadge = {
  label: string
  tone?: 'default' | 'accent'
}

function getStreamDetailBadges(stream?: {
  codec?: string
  lossless?: boolean
  bitDepth?: number
  sampleRateHz?: number
  sampleRateConfidence?: string
  channels?: number
} | null): PlayerStatBadge[] {
  if (!stream) return []
  const badges: PlayerStatBadge[] = []
  if (stream.codec) badges.push({ label: `Codec: ${stream.codec}` })
  if (stream.lossless) badges.push({ label: 'Format: Lossless' })
  if ((stream.bitDepth ?? 0) > 0) badges.push({ label: `Depth: ${stream.bitDepth}-bit` })
  if ((stream.sampleRateHz ?? 0) > 0) badges.push({ label: `Rate: ${stream.sampleRateHz} Hz` })
  return badges
}

function getMetadataBadges(
  stream: StationStream | null,
  nowPlaying: NowPlaying | null,
): PlayerStatBadge[] {
  return buildMetadataBadges(stream, nowPlaying).map((label) => ({ label }))
}

function PlayerMetadataTicker({ text, className, active = true }: { text: string; className?: string; active?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const [shouldScroll, setShouldScroll] = useState(false)
  const [scrollDistance, setScrollDistance] = useState(0)

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current
      const content = measureRef.current
      if (!container || !content) return
      const distance = Math.max(0, content.scrollWidth - container.clientWidth)
      setShouldScroll(distance > 8)
      setScrollDistance(distance)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [text])

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute invisible inline-block whitespace-nowrap"
      >
        {text}
      </span>
      {shouldScroll ? (
        <span
          ref={textRef}
          className="inline-block animate-player-marquee-swing"
          style={{
            ['--player-marquee-shift' as string]: `${scrollDistance}px`,
            ['--player-marquee-duration' as string]: `${Math.max(6, scrollDistance / 18)}s`,
            animationPlayState: active ? 'running' : 'paused',
          }}
        >
          {text}
        </span>
      ) : (
        <span ref={textRef} className="block truncate">
          {text}
        </span>
      )}
    </div>
  )
}


export function PlayerBar() {
  const [mounted, setMounted] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  useEffect(() => setMounted(true), [])

  const {
    station,
    currentStream,
    state,
    volume,
    normalizationEnabled,
    normalizationOffsetDb,
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

  const displayStream = useMemo(
    () => resolveDisplayStream(station, currentStream),
    [station, currentStream],
  )
  const { nowPlaying, settled } = useNowPlaying(
    station?.id,
    currentStream?.id,
    displayStream,
    (isPlaying || isLoading) && !fullScreen,
  )
  const streamDetailBadges = getStreamDetailBadges(displayStream)
  const metadataBadges = getMetadataBadges(displayStream, nowPlaying)
  const isLosslessLike = Boolean(
    displayStream?.lossless || (displayStream?.codec || '').toUpperCase().includes('FLAC'),
  )
  const bitrateKbps = displayStream ? (displayStream.bitrate ?? 0) : (station?.bitrate || 0)
  const normalizationBadge = Math.abs(normalizationOffsetDb) >= 0.1
    ? `${normalizationOffsetDb > 0 ? '+' : ''}${normalizationOffsetDb.toFixed(1)} dB`
    : null
  const allStatBadges: PlayerStatBadge[] = [
    ...streamDetailBadges,
    ...metadataBadges,
    ...(bitrateKbps > 0 && !isLosslessLike ? [{ label: `Bitrate: ${bitrateKbps} kbps` }] : []),
    ...(normalizationEnabled && normalizationBadge
      ? [{ label: `Leveling: ${normalizationBadge}`, tone: 'accent' as const }]
      : []),
  ]
  const hasQualityDetails =
    allStatBadges.length > 0
  const cityLine = (station?.city && station.city !== '-') ? station.city : ''
  const hasNowPlaying = Boolean(nowPlaying?.title)
  const isReconnecting = isLoading && !hasNowPlaying
  const secondaryLine = isError
    ? 'Tap play to reconnect'
    : isReconnecting
      ? null
      : hasNowPlaying
        ? nowPlaying?.artist
          ? `${nowPlaying.artist} · ${nowPlaying.song}`
          : nowPlaying?.title ?? ''
        : settled ? cityLine : ''

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
    <div className="fixed bottom-0 left-0 right-0 z-50 hidden animate-in slide-in-from-bottom-4 fade-in duration-300 border-t border-player-bar-border bg-[image:var(--player-bar-bg)] text-player-bar-fg backdrop-blur-xl md:block">
      <div
        className="relative grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-3 sm:px-5 sm:py-3.5"
      >

        {/* Station identity — left */}
        <div className="flex min-w-0 max-w-[calc(50vw-5.5rem)] items-center justify-self-start gap-3 overflow-hidden sm:max-w-[calc(50vw-7.5rem)] sm:gap-3.5">
          <div
            className={`absolute bottom-[0.2rem] left-4 flex h-[6.8rem] w-[6.8rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-player-bar-artwork-bg shadow-player-artwork transition-all duration-500 sm:bottom-[0.25rem] sm:left-5 sm:h-[8.4rem] sm:w-[8.4rem] sm:rounded-2xl ${isPlaying
              ? 'shadow-player-artwork-glow'
              : ''
              }`}
          >
            {station?.logo ? (
              <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-5 w-5 text-player-bar-artwork-icon sm:h-6 sm:w-6" />
            )}
          </div>
          <div className="flex h-10 min-w-0 flex-1 flex-col justify-center pl-[7.55rem] sm:h-12 sm:pl-[9.25rem]">
            <p className="truncate text-[1rem] font-semibold tracking-tight text-player-bar-fg sm:text-[1.4rem]">
              {station?.name ?? '—'}
            </p>
            <div className={`flex h-3.5 min-w-0 items-center ${isError ? 'text-destructive' : 'text-player-bar-secondary'}`}>
              {!isReconnecting && secondaryLine ? (
                <PlayerMetadataTicker className="w-full min-w-0 text-[11px] sm:text-[13px]" text={secondaryLine} active={isPlaying} />
              ) : null}
            </div>
          </div>
        </div>

        {/* Playback controls — center */}
        <div className="flex shrink-0 items-center justify-self-center gap-1 sm:gap-1.5">
          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={playPrev}
              disabled={!hasPrev}
              aria-label="Previous"
              className="flex h-9 w-9 items-center justify-center rounded-full text-player-bar-icon transition-all hover:bg-player-bar-chip-bg hover:text-player-bar-icon-hover disabled:cursor-not-allowed disabled:opacity-30 sm:h-10 sm:w-10"
            >
              <SkipBackIcon weight="fill" className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </TooltipTrigger>
            <TooltipContent>Previous</TooltipContent>
          </Tooltip>
          {isLoading ? (
            <div className="flex h-11 w-11 animate-in zoom-in-90 fade-in duration-200 items-center justify-center sm:h-12 sm:w-12">
              <CircleNotchIcon className="h-5 w-5 animate-spin text-player-bar-muted sm:h-5.5 sm:w-5.5" />
            </div>
          ) : isPlaying ? (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={pause}
                aria-label="Pause"
                className="flex h-11 w-11 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-accent-soft text-player-accent transition-all hover:scale-[1.03] hover:bg-player-accent-soft-hover sm:h-12 sm:w-12"
              >
                <PauseIcon weight="fill" className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
              </TooltipTrigger>
              <TooltipContent>Pause</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={resume}
                aria-label="Play"
                className="flex h-11 w-11 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-surface text-player-bar-fg transition-all hover:scale-[1.03] hover:bg-player-surface-hover sm:h-12 sm:w-12"
              >
                <PlayIcon weight="fill" className="ml-0.5 h-5 w-5 sm:h-5.5 sm:w-5.5" />
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-player-bar-icon transition-all hover:bg-player-bar-chip-bg hover:text-player-bar-icon-hover disabled:cursor-not-allowed disabled:opacity-30 sm:h-10 sm:w-10"
            >
              <SkipForwardIcon weight="fill" className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </TooltipTrigger>
            <TooltipContent>Next</TooltipContent>
          </Tooltip>
        </div>

        {/* Volume + bitrate — right */}
        <div className="flex items-center justify-end gap-2.5 sm:gap-3">
          {hasQualityDetails ? (
            <div className="hidden items-center md:flex">
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  statsExpanded ? 'max-w-[24rem] opacity-100' : 'max-w-0 opacity-0'
                }`}
              >
                <div className="flex h-[2.85rem] w-[24rem] content-start flex-wrap justify-end gap-2 overflow-hidden pr-3">
                  {allStatBadges.map((badge) => (
                    <span
                      key={badge.label}
                      className={
                        badge.tone === 'accent'
                          ? 'shrink-0 rounded-xs border border-player-accent-border bg-player-accent-soft px-1.5 py-0.5 text-[8px] font-medium tabular-nums uppercase tracking-wider text-player-accent'
                          : 'shrink-0 rounded-xs border border-player-bar-chip-border bg-player-bar-chip-bg px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-player-bar-muted'
                      }
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger
                  delay={300}
                  type="button"
                  aria-expanded={statsExpanded}
                  aria-label={statsExpanded ? 'Hide stats' : 'Show stats'}
                  onClick={() => setStatsExpanded((prev) => !prev)}
                  className="flex h-10 shrink-0 items-center justify-center rounded-md px-2.5 ui-eyebrow text-player-bar-muted transition-colors hover:text-player-bar-icon-hover"
                >
                  <span>Stats</span>
                </TooltipTrigger>
                <TooltipContent>{statsExpanded ? 'Hide stats for nerds' : 'Show stats for nerds'}</TooltipContent>
              </Tooltip>
            </div>
          ) : null}

          <PlayerVolumeControl
            className="hidden w-[18rem] shrink-0 flex-col md:flex"
            iconClassName="h-5.5 w-5.5"
            utilitySlot={<PlayerDeviceMenu />}
            normalizationEnabled={normalizationEnabled}
            showNormalizationActivity={isPlaying || isLoading}
            onToggleNormalization={setNormalizationEnabled}
            volume={volume}
            setVolume={setVolume}
          />

          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={() => setFullScreen(true)}
              aria-label="Full screen"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-player-bar-muted transition-colors hover:text-player-bar-icon-hover"
            >
              <CornersOutIcon className="h-8 w-8" weight="light" />
            </TooltipTrigger>
            <TooltipContent>Full screen</TooltipContent>
          </Tooltip>
        </div>

      </div>
    </div>
    </>
  )
}
