'use client'

import { usePathname } from 'next/navigation'
import { PlayerBar } from '@/components/player-bar'
import { MobileMiniPlayer } from '@/components/shell/mobile-mini-player'

/**
 * Renders the right global player surface for the current route.
 *
 * - `/carplay/*`: suppressed — CarPlay has its own embedded player UI.
 * - Everywhere else: PlayerBar (md+) and MobileMiniPlayer (compact) coexist;
 *   each is gated to its own form factor via Tailwind responsive utilities.
 *
 * Routing-aware suppression lives here (one place) rather than inside each
 * player component, so the player components stay form-factor-only and
 * route-agnostic.
 */
export function GlobalPlayerSurface() {
  const pathname = usePathname()
  // pathname includes the locale prefix, e.g. `/en/carplay`. Match `/carplay`
  // as a path segment so locale variation doesn't matter.
  if (/(^|\/)carplay(\/|$)/.test(pathname)) return null
  return (
    <>
      <PlayerBar />
      <MobileMiniPlayer />
    </>
  )
}
