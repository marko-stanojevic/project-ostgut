import { cacheLife } from 'next/cache'
import { fetchStationFilters } from '@/lib/station-filters'

export async function fetchCachedStationFilters() {
    'use cache'
    cacheLife('minutes')

    return fetchStationFilters()
}
