'use client'

import type { ReactNode } from 'react'
import {
  SpeakerHighIcon,
  SpeakerXIcon,
} from '@phosphor-icons/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PlayerVolumeControlProps {
  className?: string
  iconClassName?: string
  labelClassName?: string
  showPercentage?: boolean
  utilitySlot?: ReactNode
  normalizationEnabled?: boolean
  onToggleNormalization?: (enabled: boolean) => void
  volume: number
  setVolume: (value: number) => void
}

export function PlayerVolumeControl({
  className,
  iconClassName,
  labelClassName,
  showPercentage = false,
  utilitySlot,
  normalizationEnabled,
  onToggleNormalization,
  volume,
  setVolume,
}: PlayerVolumeControlProps) {
  const volumePercent = Math.round(volume * 100)
  const sliderBackground = `linear-gradient(90deg, rgba(200,116,58,0.95) 0%, rgba(200,116,58,0.95) ${volumePercent}%, rgba(255,255,255,0.12) ${volumePercent}%, rgba(255,255,255,0.12) 100%)`

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {onToggleNormalization ? (
          <Tooltip>
            <TooltipTrigger
              delay={300}
              type="button"
              aria-pressed={Boolean(normalizationEnabled)}
              aria-label={normalizationEnabled ? 'Disable leveling' : 'Enable leveling'}
              onClick={() => onToggleNormalization(!normalizationEnabled)}
              className="relative flex h-9 shrink-0 items-center justify-center rounded-[0.7rem] px-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:text-zinc-200"
            >
              <span>Leveling</span>
              {normalizationEnabled ? (
                <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand animate-player-leveling-dot" />
              ) : null}
            </TooltipTrigger>
            <TooltipContent className="max-w-[14rem] whitespace-normal leading-relaxed">
              {normalizationEnabled
                ? 'Leveling smooths loudness jumps between stations. Click to turn it off.'
                : 'Leveling smooths loudness jumps between stations. Click to turn it on.'}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {utilitySlot}

        <Tooltip>
          <TooltipTrigger
            delay={300}
            onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-200"
          >
            {volume === 0
              ? <SpeakerXIcon className={iconClassName ?? 'h-5 w-5'} />
              : <SpeakerHighIcon className={iconClassName ?? 'h-5 w-5'} />
            }
          </TooltipTrigger>
          <TooltipContent>{volume === 0 ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

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
