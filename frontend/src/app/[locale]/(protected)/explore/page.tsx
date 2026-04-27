import { ExploreClient } from './explore-client'
import { fetchCachedStationFilters } from '@/lib/station-filters-cache'
import { fetchCachedStationFeed } from '@/lib/station-feed-cache'
import { buildStationFeedPathFromSearchParams, type PageSearchParams } from '@/lib/station-query'

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: Promise<PageSearchParams>
}) {
    const resolvedSearchParams = await searchParams
    const initialStationsPath = buildStationFeedPathFromSearchParams(resolvedSearchParams)
    const [initialStations, initialFilters] = await Promise.all([
        fetchCachedStationFeed(initialStationsPath),
        fetchCachedStationFilters(),
    ])

    return (
        <ExploreClient
            initialStations={initialStations}
            initialFilters={initialFilters}
            initialStationsPath={initialStationsPath}
        />
    )
}
