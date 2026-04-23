'use client'

import { useState } from 'react'
import {
  BroadcastIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react'
import { usePlayer } from '@/context/PlayerContext'
import {
  DropdownMenuGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function getCastLabel(castState: ReturnType<typeof usePlayer>['castState']) {
  if (castState === 'connected') return 'Casting'
  if (castState === 'connecting') return 'Connecting'
  if (castState === 'unavailable') return 'No devices'
  return 'Available'
}

function getAirPlayLabel(
  supported: ReturnType<typeof usePlayer>['airPlaySupported'],
  available: ReturnType<typeof usePlayer>['airPlayAvailable'],
  active: ReturnType<typeof usePlayer>['airPlayActive'],
) {
  if (!supported) return 'Unsupported'
  if (active) return 'Connected'
  if (available) return 'Available'
  return 'Searching'
}

export function PlayerDeviceMenu() {
  const [open, setOpen] = useState(false)
  const {
    transport,
    castState,
    airPlaySupported,
    airPlayAvailable,
    airPlayActive,
    promptCast,
    disconnectCast,
    promptAirPlay,
  } = usePlayer()

  const isActive = transport === 'cast' || airPlayActive
  const hasCastOption = castState !== 'unavailable' || transport === 'cast'
  const hasAirPlayOption = airPlaySupported
  const hasOtherDevices = hasCastOption || hasAirPlayOption
  const ariaLabel = transport === 'cast' && castState === 'connected'
    ? 'Playback devices, casting active'
    : airPlayActive
      ? 'Playback devices, AirPlay active'
      : 'Playback devices'
  const tooltipLabel = transport === 'cast' && castState === 'connected'
    ? 'Playback devices, casting active'
    : airPlayActive
      ? 'Playback devices, AirPlay active'
      : 'Playback devices'

  const handleAirPlayPointerDown = (event: React.PointerEvent) => {
    event.preventDefault()
    setOpen(false)
    void promptAirPlay()
  }

  const handleAirPlayKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setOpen(false)
    void promptAirPlay()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={ariaLabel}
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-player-muted transition-colors hover:text-player-muted-hover ${
                    isActive ? 'text-player-accent hover:text-player-accent' : ''
                  }`}
                />
              }
            />
          }
        >
          <BroadcastIcon className="h-5 w-5" weight={transport === 'cast' ? 'fill' : 'regular'} />
          {isActive ? (
            <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-player-accent" />
          ) : null}
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80 p-1.5">
        <div className="px-3 pt-2 pb-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-player-bar-muted">
            Connect
          </p>
        </div>

        <div className="mx-1 rounded-xl border border-player-bar-chip-border bg-player-bar-chip-bg px-3 py-3">
          <div className="flex items-center gap-2.5">
            <CheckCircleIcon className="h-4.5 w-4.5 text-player-accent" weight="fill" />
            <p className="text-sm font-medium text-player-bar-fg">This web browser</p>
          </div>
        </div>

        {hasOtherDevices ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Other devices</DropdownMenuLabel>
              {hasCastOption ? (
                <DropdownMenuItem
                  onClick={() => {
                    if (transport === 'cast' && castState === 'connected') {
                      disconnectCast()
                      return
                    }
                    void promptCast()
                  }}
                  className="gap-2.5 px-2.5 py-2"
                >
                  <BroadcastIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span>{transport === 'cast' && castState === 'connected' ? 'Disconnect Google Cast' : 'Google Cast'}</span>
                    <span className="text-xs text-muted-foreground">{getCastLabel(castState)}</span>
                  </div>
                </DropdownMenuItem>
              ) : null}
              {hasAirPlayOption ? (
                <DropdownMenuItem
                  onPointerDown={handleAirPlayPointerDown}
                  onKeyDown={handleAirPlayKeyDown}
                  className="gap-2.5 px-2.5 py-2"
                >
                  <BroadcastIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span>AirPlay</span>
                    <span className="text-xs text-muted-foreground">{getAirPlayLabel(airPlaySupported, airPlayAvailable, airPlayActive)}</span>
                  </div>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>

            {!hasAirPlayOption && castState === 'unavailable' ? (
              <>
                <DropdownMenuSeparator />
                <div className="px-3 py-3">
                  <p className="text-sm font-medium text-player-bar-fg">No other devices found</p>
                  <p className="mt-1 text-sm text-player-bar-muted">Check your WiFi</p>
                  <p className="mt-4 text-sm leading-relaxed text-player-bar-muted">
                    Connect the devices you&apos;re using to the same WiFi.
                  </p>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="px-3 py-3">
              <p className="text-sm font-medium text-player-bar-fg">No other devices found</p>
              <p className="mt-1 text-sm text-player-bar-muted">Check your WiFi</p>
              <p className="mt-4 text-sm leading-relaxed text-player-bar-muted">
                Connect the devices you&apos;re using to the same WiFi.
              </p>
            </div>

            <DropdownMenuSeparator />

            <div className="px-3 py-3">
              <p className="text-sm font-medium text-player-bar-fg">Play from another device</p>
              <p className="mt-1 text-sm leading-relaxed text-player-bar-muted">
                It will automatically appear here.
              </p>
            </div>

            <div className="px-3 pb-3">
              <p className="text-sm font-medium text-player-bar-fg">Switch to the OSTGUT app</p>
              <p className="mt-1 text-sm leading-relaxed text-player-bar-muted">
                The app can detect more devices.
              </p>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
