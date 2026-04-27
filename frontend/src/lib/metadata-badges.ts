import type { NowPlaying } from '@/lib/now-playing'
import type { StationStream } from '@/types/player'
import { formatMetadataLabel } from '@/lib/metadata-title'

export function buildMetadataBadges(
  stream: StationStream | null,
  nowPlaying: NowPlaying | null,
): string[] {
  if (!stream?.metadataEnabled) return []

  const resolver = nowPlaying?.resolver || stream.metadataResolver
  const badges: string[] = []

  if (resolver && resolver !== 'none') {
    badges.push(`Metadata: ${resolver === 'client' ? 'Client' : 'Server'}`)
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