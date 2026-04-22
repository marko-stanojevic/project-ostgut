'use client'

import {
  SpeakerHighIcon,
  SpeakerXIcon,
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
  const volumePercent = Math.round(volume * 100)
  const sliderBackground = `linear-gradient(90deg, rgba(200,116,58,0.95) 0%, rgba(200,116,58,0.95) ${volumePercent}%, rgba(255,255,255,0.12) ${volumePercent}%, rgba(255,255,255,0.12) 100%)`
  const offsetLabel = Math.abs(normalizationOffsetDb) >= 0.1
    ? `${normalizationOffsetDb > 0 ? '+' : ''}${normalizationOffsetDb.toFixed(1)} dB`
    : null

  return (
    <div className={className}>
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

      {onToggleNormalization ? (
        <button
          type="button"
          onClick={() => onToggleNormalization(!normalizationEnabled)}
          aria-pressed={normalizationEnabled}
          title={normalizationEnabled ? 'Disable smart leveling' : 'Enable smart leveling'}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors ${
            normalizationEnabled
              ? 'border-brand/35 bg-brand/12 text-brand'
              : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Level
        </button>
      ) : null}

      {normalizationEnabled && offsetLabel ? (
        <span className="hidden shrink-0 text-[11px] font-medium tabular-nums uppercase tracking-[0.16em] text-zinc-500 xl:inline">
          {offsetLabel}
        </span>
      ) : null}
    </div>
  )
}
