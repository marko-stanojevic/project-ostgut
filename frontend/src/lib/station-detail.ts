import { getPublicStation } from '@/lib/public-stations'
import type { ApiStationDetail } from '@/types/station'

export interface StationDetailState {
    station: ApiStationDetail | null
    error: string | null
}

export async function fetchStationDetail(id: string): Promise<StationDetailState> {
    try {
        const station = await getPublicStation(id)

        return {
            station,
            error: null,
        }
    } catch (error) {
        return {
            station: null,
            error: error instanceof Error && error.message.includes('status 404') ? 'Station not found.' : 'Unable to load station.',
        }
    }
}

export async function fetchStationByID(id: string, init?: RequestInit) {
    return getPublicStation(id, init)
}
