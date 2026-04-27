import { STATION_FEED_PAGE_SIZE } from '@/lib/station-feed'

export const STATION_FILTER_KEYS = ['genre', 'subgenre', 'style', 'format', 'texture'] as const

export type StationFilterKey = typeof STATION_FILTER_KEYS[number]
export type PageSearchParams = Record<string, string | string[] | undefined>
export type StationFilters = Record<StationFilterKey, string[]>

export function emptyStationFilters(): StationFilters {
    return {
        genre: [],
        subgenre: [],
        style: [],
        format: [],
        texture: [],
    }
}

function appendValue(params: URLSearchParams, key: string, value: string | string[] | undefined) {
    if (typeof value === 'string' && value) params.append(key, value)
    if (Array.isArray(value)) {
        for (const item of value) {
            if (item) params.append(key, item)
        }
    }
}

export function getStationFilters(searchParams: URLSearchParams): StationFilters {
    return {
        genre: searchParams.getAll('genre'),
        subgenre: searchParams.getAll('subgenre'),
        style: searchParams.getAll('style'),
        format: searchParams.getAll('format'),
        texture: searchParams.getAll('texture'),
    }
}

export function buildStationFeedPath({
    query,
    filters,
    offset,
    limit = STATION_FEED_PAGE_SIZE,
}: {
    query: string
    filters: StationFilters
    offset: number
    limit?: number
}) {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (query) params.set('q', query)

    for (const key of STATION_FILTER_KEYS) {
        for (const value of filters[key]) {
            params.append(key, value)
        }
    }

    return `/stations?${params.toString()}`
}

export function buildStationFeedPathFromSearchParams(searchParams: PageSearchParams) {
    const params = new URLSearchParams()
    params.set('limit', String(STATION_FEED_PAGE_SIZE))
    params.set('offset', '0')

    appendValue(params, 'q', searchParams.q)
    for (const key of STATION_FILTER_KEYS) {
        appendValue(params, key, searchParams[key])
    }

    return `/stations?${params.toString()}`
}
