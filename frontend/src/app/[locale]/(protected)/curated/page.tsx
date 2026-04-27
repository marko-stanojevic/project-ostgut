import { CuratedClient } from './curated-client'
import { STATION_FEED_PAGE_SIZE } from '@/lib/station-feed'
import { fetchCachedStationFeed } from '@/lib/station-feed-cache'

export default async function CuratedPage() {
    const [initialRecommended, initialMostPlayed] = await Promise.all([
        fetchCachedStationFeed(`/stations?featured=true&limit=${STATION_FEED_PAGE_SIZE}&offset=0`),
        fetchCachedStationFeed(`/stations?sort=popular&limit=${STATION_FEED_PAGE_SIZE}&offset=0`),
    ])

    return (
        <CuratedClient
            initialRecommended={initialRecommended}
            initialMostPlayed={initialMostPlayed}
        />
    )
}
