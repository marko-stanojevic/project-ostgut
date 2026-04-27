import { API_URL } from '@/lib/api'
import type { ApiStation } from '@/types/station'

export const STATION_FEED_PAGE_SIZE = 24

export interface StationFeedState {
    stations: ApiStation[]
    total: number
    error: boolean
}

interface StationsResponse {
    stations?: ApiStation[]
    total?: number
    count?: number
}

function parseStationsResponse(data: StationsResponse) {
    return {
        stations: data.stations ?? [],
        total: data.total ?? data.count ?? 0,
    }
}

export async function fetchStationFeed(path: string, revalidate = 60): Promise<StationFeedState> {
    try {
        const response = await fetch(`${API_URL}${path}`, {
            next: { revalidate },
        })

        if (!response.ok) {
            return { stations: [], total: 0, error: true }
        }

        return {
            ...parseStationsResponse((await response.json()) as StationsResponse),
            error: false,
        }
    } catch {
        return { stations: [], total: 0, error: true }
    }
}

export async function fetchStations(path: string, init?: RequestInit) {
    const response = await fetch(`${API_URL}${path}`, init)
    if (!response.ok) {
        throw new Error(`Station request failed with status ${response.status}`)
    }

    return parseStationsResponse((await response.json()) as StationsResponse)
}