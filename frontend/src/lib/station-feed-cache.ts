import { cacheLife } from 'next/cache'
import { fetchStationFeed } from '@/lib/station-feed'

export async function fetchCachedStationFeed(path: string) {
    'use cache'
    cacheLife('minutes')

    return fetchStationFeed(path)
}
