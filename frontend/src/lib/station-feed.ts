import { getPublicStations } from '@/lib/public-stations'
import type { ApiStation } from '@/types/station'

export const STATION_FEED_PAGE_SIZE = 24

export interface StationFeedState {
    stations: ApiStation[]
    total: number
    error: boolean
}

export async function fetchStationFeed(path: string): Promise<StationFeedState> {
    try {
        const data = await getPublicStations(path)

        return {
            ...data,
            error: false,
        }
    } catch {
        return { stations: [], total: 0, error: true }
    }
}

export async function fetchStations(path: string, init?: RequestInit) {
    return getPublicStations(path, init)
}