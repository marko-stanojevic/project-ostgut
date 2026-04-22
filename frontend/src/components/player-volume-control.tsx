'use client'

import { useState } from 'react'
import {
  SpeakerHighIcon,
  SpeakerXIcon,
  WaveSineIcon,
} from '@phosphor-icons/react'

interface PlayerVolumeControlProps {
  className?: string
  iconClassName?: string
  labelClassName?: string
  showPercentage?: boolean
  normalizationEnabled?: boolean
  normalizationOffsetDb?: number
  onToggleNormalization?: (enabled: boolean) => void
  volume: number
  setVolume: (value: number) => void
}

export function PlayerVolumeControl({
  className,
  iconClassName,
  labelClassName,
  showPercentage = false,
  normalizationEnabled,
  normalizationOffsetDb = 0,
  onToggleNormalization,
  volume,
  setVolume,
}: PlayerVolumeControlProps) {
  const [levelingExpanded, setLevelingExpanded] = useState(false)
  const volumePercent = Math.round(volume * 100)
  const sliderBackground = `linear-gradient(90deg, rgba(200,116,58,0.95) 0%, rgba(200,116,58,0.95) ${volumePercent}%, rgba(255,255,255,0.12) ${volumePercent}%, rgba(255,255,255,0.12) 100%)`
  const offsetLabel = Math.abs(normalizationOffsetDb) >= 0.1
    ? `${normalizationOffsetDb > 0 ? '+' : ''}${normalizationOffsetDb.toFixed(1)} dB`
    : null

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {onToggleNormalization ? (
          <div className="flex shrink-0 flex-col items-start">
            <button
              type="button"
              aria-expanded={levelingExpanded}
              aria-label={levelingExpanded ? 'Hide leveling details' : 'Show leveling details'}
            onClick={() => {
              if (!normalizationEnabled) {
                onToggleNormalization(true)
                setLevelingExpanded(true)
                return
              }
              setLevelingExpanded((prev) => !prev)
            }}
            title={levelingExpanded ? 'Hide leveling details' : 'Show leveling details'}
            className={`flex h-9 items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors ${
              levelingExpanded || normalizationEnabled ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <WaveSineIcon className="h-5.5 w-5.5" weight="regular" />
          </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                levelingExpanded ? 'max-h-16 pt-1 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="flex items-center gap-2">
                {normalizationEnabled && offsetLabel ? (
                  <span className="shrink-0 rounded-[0.45rem] border border-white/12 bg-white/[0.06] px-2 py-0.75 text-[10px] font-medium tabular-nums uppercase tracking-[0.12em] text-zinc-400">
                    {offsetLabel}
                  </span>
                ) : !normalizationEnabled ? (
                  <span className="shrink-0 rounded-[0.45rem] border border-white/12 bg-white/[0.06] px-2 py-0.75 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                    Off
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
          title={volume === 0 ? 'Unmute' : 'Mute'}
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {volume === 0
            ? <SpeakerXIcon className={iconClassName ?? 'h-5 w-5'} />
            : <SpeakerHighIcon className={iconClassName ?? 'h-5 w-5'} />
          }
        </button>

        <div className="relative flex h-9 flex-1 items-center">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 h-1.5 rounded-full"
            style={{ background: sliderBackground }}
          />
          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
            className="volume-slider relative z-10 h-9 w-full cursor-pointer appearance-none bg-transparent"
          />
        </div>

        {showPercentage ? (
          <span className={labelClassName ?? 'w-10 text-right text-xs tabular-nums text-zinc-500'}>
            {volumePercent}%
          </span>
        ) : null}
      </div>
    </div>
  )
}
