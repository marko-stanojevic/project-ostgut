'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/context/PlayerContext'
import { useNowPlaying } from '@/hooks/useNowPlaying'
import { FullScreenPlayer } from '@/components/full-screen-player'
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
  CornersOutIcon,
} from '@phosphor-icons/react'

function getStreamDetailBadges(stream?: {
  codec?: string
  lossless?: boolean
  bitDepth?: number
  sampleRateHz?: number
  sampleRateConfidence?: string
  channels?: number
} | null): { primary: string[]; secondary: string[] } {
  if (!stream) return { primary: [], secondary: [] }
  const primary: string[] = []
  const secondary: string[] = []
  if (stream.codec) primary.push(`Codec: ${stream.codec}`)
  if (stream.lossless) primary.push('Format: Lossless')
  if ((stream.bitDepth ?? 0) > 0) secondary.push(`Depth: ${stream.bitDepth}-bit`)
  if ((stream.sampleRateHz ?? 0) > 0) secondary.push(`Rate: ${stream.sampleRateHz} Hz`)
  return { primary, secondary }
}

function PlayerMetadataTicker({ text, className }: { text: string; className?: string }) {
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
          className="inline-block animate-player-marquee-swing will-change-transform"
          style={{
            ['--player-marquee-shift' as string]: `${scrollDistance}px`,
            ['--player-marquee-duration' as string]: `${Math.max(6, scrollDistance / 18)}s`,
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

  const { nowPlaying, settled } = useNowPlaying(
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
  const streamDetailBadges = getStreamDetailBadges(displayStream)
  const isLosslessLike = Boolean(
    displayStream?.lossless || (displayStream?.codec || '').toUpperCase().includes('FLAC'),
  )
  const bitrateKbps = displayStream ? (displayStream.bitrate ?? 0) : (station?.bitrate || 0)
  const normalizationBadge = Math.abs(normalizationOffsetDb) >= 0.1
    ? `${normalizationOffsetDb > 0 ? '+' : ''}${normalizationOffsetDb.toFixed(1)} dB`
    : null
  const hasQualityDetails = streamDetailBadges.primary.length > 0 || streamDetailBadges.secondary.length > 0 || (bitrateKbps > 0 && !isLosslessLike) || Boolean(normalizationEnabled && normalizationBadge)
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
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 border-t border-[var(--player-bar-border)] bg-[image:var(--player-bar-bg)] text-player-bar-fg backdrop-blur-xl">
      <div
        className="relative grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-4.5 sm:px-5 sm:py-5"
      >

        {/* Station identity — left */}
        <div className="flex min-w-0 max-w-[calc(50vw-5.5rem)] items-center justify-self-start gap-3 overflow-hidden sm:max-w-[calc(50vw-7.5rem)] sm:gap-3.5">
          <div
            className={`absolute bottom-[0.4rem] left-4 flex h-[6.8rem] w-[6.8rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.68rem] bg-player-bar-artwork-bg shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition-all duration-500 sm:bottom-[0.5rem] sm:left-5 sm:h-[8.4rem] sm:w-[8.4rem] sm:rounded-[0.82rem] ${isPlaying
              ? 'shadow-[0_0_20px_var(--player-accent-glow),0_14px_34px_rgba(0,0,0,0.32)]'
              : ''
              }`}
          >
            {station?.logo ? (
              <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
            ) : (
              <RadioIcon className="h-5 w-5 text-player-bar-artwork-icon sm:h-6 sm:w-6" />
            )}
          </div>
          <div className="flex h-12 min-w-0 flex-1 flex-col justify-center pl-[7.55rem] sm:h-14 sm:pl-[9.25rem]">
            <p className="truncate text-xl font-semibold tracking-tight text-player-bar-fg sm:text-2xl">
              {station?.name ?? '—'}
            </p>
            <div className={`flex h-4 min-w-0 items-center sm:h-5 ${isError ? 'text-red-300' : 'text-player-bar-secondary'}`}>
              {!isReconnecting && secondaryLine ? (
                <PlayerMetadataTicker className="w-full min-w-0 text-xs sm:text-sm" text={secondaryLine} />
              ) : null}
            </div>
          </div>
        </div>

        {/* Playback controls — center */}
        <div className="flex shrink-0 items-center justify-self-center gap-1.5 sm:gap-2">
          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={playPrev}
              disabled={!hasPrev}
              aria-label="Previous"
              className="flex h-10 w-10 items-center justify-center rounded-full text-player-bar-icon transition-all hover:bg-player-bar-chip-bg hover:text-player-bar-icon-hover disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12"
            >
              <SkipBackIcon weight="fill" className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
            </TooltipTrigger>
            <TooltipContent>Previous</TooltipContent>
          </Tooltip>
          {isLoading ? (
            <div className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center sm:h-14 sm:w-14">
              <CircleNotchIcon className="h-5.5 w-5.5 animate-spin text-player-bar-muted sm:h-6.5 sm:w-6.5" />
            </div>
          ) : isPlaying ? (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={pause}
                aria-label="Pause"
                className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-accent-soft text-player-accent transition-all hover:scale-[1.03] hover:bg-player-accent-soft-hover sm:h-14 sm:w-14"
              >
                <PauseIcon weight="fill" className="h-5.5 w-5.5 sm:h-6.5 sm:w-6.5" />
              </TooltipTrigger>
              <TooltipContent>Pause</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                onClick={resume}
                aria-label="Play"
                className="flex h-12 w-12 animate-in zoom-in-90 fade-in duration-200 items-center justify-center rounded-full bg-player-surface text-player-bar-fg transition-all hover:scale-[1.03] hover:bg-player-surface-hover sm:h-14 sm:w-14"
              >
                <PlayIcon weight="fill" className="ml-0.5 h-5.5 w-5.5 sm:h-6.5 sm:w-6.5" />
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
              className="flex h-10 w-10 items-center justify-center rounded-full text-player-bar-icon transition-all hover:bg-player-bar-chip-bg hover:text-player-bar-icon-hover disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12"
            >
              <SkipForwardIcon weight="fill" className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5" />
            </TooltipTrigger>
            <TooltipContent>Next</TooltipContent>
          </Tooltip>
        </div>

        {/* Volume + bitrate — right */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          {hasQualityDetails ? (
            <div className="hidden items-center md:flex">
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  statsExpanded ? 'max-w-[24rem] opacity-100' : 'max-w-0 opacity-0'
                }`}
              >
                <div className="flex flex-col items-end gap-1 pr-3">
                  <div className="flex items-center gap-2">
                    {streamDetailBadges.primary.map((detail) => (
                      <span
                        key={detail}
                        className="shrink-0 rounded-[0.34rem] border border-player-bar-chip-border bg-player-bar-chip-bg px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-player-bar-muted"
                      >
                        {detail}
                      </span>
                    ))}
                    {bitrateKbps > 0 && !isLosslessLike ? (
                      <span className="shrink-0 rounded-[0.34rem] border border-player-bar-chip-border bg-player-bar-chip-bg px-1.5 py-0.5 text-[8px] font-medium tabular-nums uppercase tracking-[0.12em] text-player-bar-muted">
                        Bitrate: {bitrateKbps} kbps
                      </span>
                    ) : null}
                  </div>
                  {streamDetailBadges.secondary.length > 0 || (normalizationEnabled && normalizationBadge) ? (
                    <div className="flex items-center gap-2">
                      {streamDetailBadges.secondary.map((detail) => (
                        <span
                          key={detail}
                          className="shrink-0 rounded-[0.34rem] border border-player-bar-chip-border bg-player-bar-chip-bg px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-player-bar-muted"
                        >
                          {detail}
                        </span>
                      ))}
                      {normalizationEnabled && normalizationBadge ? (
                        <span className="shrink-0 rounded-[0.34rem] border border-player-accent-border bg-player-accent-soft px-1.5 py-0.5 text-[8px] font-medium tabular-nums uppercase tracking-[0.12em] text-player-accent">
                          Leveling: {normalizationBadge}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger
                  delay={300}
                  type="button"
                  aria-expanded={statsExpanded}
                  aria-label={statsExpanded ? 'Hide stats' : 'Show stats'}
                  onClick={() => setStatsExpanded((prev) => !prev)}
                  className="flex h-10 shrink-0 items-center justify-center rounded-[0.7rem] px-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-player-bar-muted transition-colors hover:text-player-bar-icon-hover"
                >
                  <span>Stats</span>
                </TooltipTrigger>
                <TooltipContent>{statsExpanded ? 'Hide stats for nerds' : 'Show stats for nerds'}</TooltipContent>
              </Tooltip>
            </div>
          ) : null}

          <PlayerVolumeControl
            className="hidden w-[19rem] shrink-0 flex-col md:flex"
            iconClassName="h-5.5 w-5.5"
            utilitySlot={<PlayerDeviceMenu />}
            normalizationEnabled={normalizationEnabled}
            onToggleNormalization={setNormalizationEnabled}
            volume={volume}
            setVolume={setVolume}
          />

          <Tooltip>
            <TooltipTrigger
              delay={300}
              onClick={() => setFullScreen(true)}
              aria-label="Full screen"
              className="flex h-12 w-12 shrink-0 items-center justify-center text-player-bar-muted transition-colors hover:text-player-bar-icon-hover"
            >
              <CornersOutIcon className="h-9 w-9" weight="light" />
            </TooltipTrigger>
            <TooltipContent>Full screen</TooltipContent>
          </Tooltip>
        </div>

      </div>
    </div>
    </>
  )
}
