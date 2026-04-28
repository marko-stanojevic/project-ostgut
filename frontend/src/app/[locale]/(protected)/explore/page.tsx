import { ExploreClient } from './explore-client'
import { fetchStationFilters } from '@/lib/station-filters'
import { fetchStationFeed } from '@/lib/station-feed'
import { buildStationFeedPathFromSearchParams, type PageSearchParams } from '@/lib/station-query'

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: Promise<PageSearchParams>
}) {
    const resolvedSearchParams = await searchParams
    const initialStationsPath = buildStationFeedPathFromSearchParams(resolvedSearchParams)
    const [initialStations, initialFilters] = await Promise.all([
        fetchStationFeed(initialStationsPath),
        fetchStationFilters(),
    ])

    return (
        <ExploreClient
            initialStations={initialStations}
            initialFilters={initialFilters}
            initialStationsPath={initialStationsPath}
        />
    )
}
