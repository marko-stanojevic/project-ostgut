import type { NowPlaying } from '@/lib/now-playing'
import type { StationStream } from '@/types/player'
import { formatMetadataLabel } from '@/lib/metadata-title'

export function buildMetadataBadges(
  stream: StationStream | null,
  nowPlaying: NowPlaying | null,
): string[] {
  if (!stream || stream.metadataMode === 'off') return []
  const usesClientMetadataDelivery = stream.metadataPlan?.delivery === 'client-poll' || stream.metadataPlan?.delivery === 'hls-id3'
  if (stream.metadataErrorCode === 'no_metadata' && !usesClientMetadataDelivery) return []
  if (stream.metadataPlan?.delivery === 'none' || stream.metadataPlan?.resolver === 'none') return []

  const hasLiveMetadata = nowPlaying?.status === 'ok' && Boolean(nowPlaying.title)
  const resolver = hasLiveMetadata ? nowPlaying?.resolver || stream.metadataPlan?.resolver || stream.metadataResolver : undefined
  const badges: string[] = []

  if (resolver && resolver !== 'none') {
    badges.push(`Metadata: ${resolver === 'client' ? 'Client' : 'Server'}`)
  }

  if (stream.metadataType && stream.metadataType !== 'auto') {
    badges.push(`Probe: ${formatMetadataLabel(stream.metadataType)}`)
  }

  const source = hasLiveMetadata ? nowPlaying?.source || stream.metadataSource || '' : ''
  if (source) {
    badges.push(`Live: ${formatMetadataLabel(source)}`)
  }

  return badges
}
