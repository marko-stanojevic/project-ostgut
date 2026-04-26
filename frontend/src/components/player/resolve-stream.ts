import type { StationStream } from '@/types/player'

/**
 * Resolve which stream to display in the player UI for a station.
 *
 * Priority:
 *   1. If a `currentStream` is set, prefer the matching stream from the
 *      station's stream list (refreshed metadata), or fall back to it.
 *   2. Otherwise, prefer the active streams ordered by priority.
 *   3. Otherwise, the first stream by priority.
 */
export function resolveDisplayStream(
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
