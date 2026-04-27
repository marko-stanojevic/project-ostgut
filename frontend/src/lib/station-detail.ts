import { API_URL } from '@/lib/api'
import type { ApiStationDetail } from '@/types/station'

export interface StationDetailState {
    station: ApiStationDetail | null
    error: string | null
}

export async function fetchStationDetail(id: string, revalidate = 60): Promise<StationDetailState> {
    try {
        const response = await fetch(`${API_URL}/stations/${id}`, {
            next: { revalidate },
        })

        if (!response.ok) {
            return {
                station: null,
                error: response.status === 404 ? 'Station not found.' : 'Unable to load station.',
            }
        }

        return {
            station: (await response.json()) as ApiStationDetail,
            error: null,
        }
    } catch {
        return { station: null, error: 'Unable to load station.' }
    }
}
