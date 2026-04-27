import { CuratedClient } from './curated-client'
import { fetchStationFeed, STATION_FEED_PAGE_SIZE } from '@/lib/station-feed'

export default async function CuratedPage() {
    const [initialRecommended, initialMostPlayed] = await Promise.all([
        fetchStationFeed(`/stations?featured=true&limit=${STATION_FEED_PAGE_SIZE}&offset=0`),
        fetchStationFeed(`/stations?sort=popular&limit=${STATION_FEED_PAGE_SIZE}&offset=0`),
    ])

    return (
        <CuratedClient
            initialRecommended={initialRecommended}
            initialMostPlayed={initialMostPlayed}
        />
    )
}
