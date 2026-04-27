import { cacheLife } from 'next/cache'
import { fetchStationDetail } from '@/lib/station-detail'

export async function fetchCachedStationDetail(id: string) {
    'use cache'
    cacheLife('minutes')

    return fetchStationDetail(id)
}
