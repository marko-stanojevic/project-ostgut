import { StationCard, StationCardSkeleton } from '@/components/StationCard'
import { cn } from '@/lib/utils'
import type { PlayerState } from '@/types/player'
import type { ApiStation } from '@/types/station'

interface StationGridProps {
    stations: ApiStation[]
    total: number
    loadingMore: boolean
    loadingLabel: string
    loadMoreLabel: string
    activeStationID?: string
    playerState: PlayerState
    className?: string
    loadingMoreSkeletonCount?: number
    imagePriorityCount?: number
    showCountry?: boolean
    onLoadMore: () => void
    onOpen: (stationID: string) => void
    onPlay: (index: number) => void
}

export function StationGrid({
    stations,
    total,
    loadingMore,
    loadingLabel,
    loadMoreLabel,
    activeStationID,
    playerState,
    className,
    loadingMoreSkeletonCount = 8,
    imagePriorityCount = 3,
    showCountry,
    onLoadMore,
    onOpen,
    onPlay,
}: StationGridProps) {
    return (
        <>
            <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-7', className)}>
                {stations.map((station, index) => (
                    <StationCard
                        key={station.id}
                        s={station}
                        imagePriority={index < imagePriorityCount}
                        showCountry={showCountry}
                        onOpen={() => onOpen(station.id)}
                        onPlay={() => onPlay(index)}
                        isActive={activeStationID === station.id}
                        isPlaying={activeStationID === station.id && playerState === 'playing'}
                    />
                ))}
                {loadingMore && Array.from({ length: loadingMoreSkeletonCount }).map((_, index) => <StationCardSkeleton key={`more-${index}`} />)}
            </div>
            {stations.length < total && (
                <div className="mt-6 text-center">
                    <button
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
                    >
                        {loadingMore ? loadingLabel : loadMoreLabel}
                    </button>
                </div>
            )}
        </>
    )
}

export function StationGridSkeleton({
    count,
    className,
}: {
    count: number
    className?: string
}) {
    return (
        <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-7', className)}>
            {Array.from({ length: count }).map((_, index) => <StationCardSkeleton key={index} />)}
        </div>
    )
}
