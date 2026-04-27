import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import type { MediaAssetResponse } from '@/lib/media'

export type StationModerationStatus = 'pending' | 'approved'
export type StreamProbeScope = 'quality' | 'metadata' | 'resolver' | 'loudness' | 'full'

export interface AdminStream {
    id: string
    url: string
    resolved_url: string
    kind: string
    container: string
    transport: string
    mime_type: string
    codec: string
    lossless: boolean
    bitrate: number
    bit_depth: number
    sample_rate_hz: number
    sample_rate_confidence: string
    channels: number
    priority: number
    is_active: boolean
    loudness_integrated_lufs?: number
    loudness_peak_dbfs?: number
    loudness_sample_duration_seconds?: number
    loudness_measured_at?: string
    loudness_measurement_status?: string
    metadata_enabled: boolean
    metadata_type: string
    metadata_source?: string
    metadata_url?: string
    metadata_delayed?: boolean
    metadata_error?: string
    metadata_error_code?: string
    metadata_last_fetched_at?: string
    metadata_resolver?: 'none' | 'server' | 'client'
    metadata_resolver_checked_at?: string
    health_score: number
    last_checked_at?: string
    last_error?: string
}

export interface AdminStation {
    id: string
    name: string
    streams?: AdminStream[]
    logo?: string
    website?: string
    genre_tags: string[]
    subgenre_tags?: string[]
    search_tags?: string[]
    language?: string
    country: string
    city: string
    style_tags?: string[]
    format_tags?: string[]
    texture_tags?: string[]
    reliability_score?: number
    featured: boolean
    status: string
    overview?: string
    editorial_review?: string
    internal_notes?: string
}

export interface ListEditorStationsParams {
    status: StationModerationStatus
    limit: number
    offset: number
    query?: string
}

export interface ListEditorStationsResult {
    stations: AdminStation[]
    count: number
}

export interface StationStreamPayload {
    url: string
    priority: number
    bitrate?: number
    metadata_enabled: boolean
}

export interface EditorStationPayload {
    name: string
    streams: StationStreamPayload[]
    genre_tags: string[]
    subgenre_tags: string[]
    country: string
    city: string
    language: string
    logo: string
    website?: string
    homepage?: string
    style_tags: string[]
    format_tags: string[]
    texture_tags: string[]
    overview: string | null
    editorial_review: string | null
    internal_notes: string | null
    status: StationModerationStatus
    featured: boolean
}

interface ListEditorStationsResponse {
    stations?: AdminStation[]
    count?: number
}

export function normalizeModerationStatus(value: string | null | undefined): StationModerationStatus {
    return value === 'approved' ? 'approved' : 'pending'
}

export async function listEditorStations(accessToken: string, params: ListEditorStationsParams): Promise<ListEditorStationsResult> {
    const searchParams = new URLSearchParams({
        status: params.status,
        limit: String(params.limit),
        offset: String(params.offset),
    })
    if (params.query) searchParams.set('q', params.query)

    const data = await fetchJSONWithAuth<ListEditorStationsResponse>(
        `${API_URL}/editor/stations?${searchParams}`,
        accessToken,
    )

    return {
        stations: data.stations ?? [],
        count: data.count ?? 0,
    }
}

export function bulkUpdateEditorStations(accessToken: string, ids: string[], status: StationModerationStatus) {
    return fetchJSONWithAuth<void>(`${API_URL}/editor/stations/bulk`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ ids, status }),
    })
}

export function createEditorStation(accessToken: string, payload: EditorStationPayload) {
    return fetchJSONWithAuth<AdminStation>(`${API_URL}/editor/stations`, accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export function getEditorStation(accessToken: string, stationID: string) {
    return fetchJSONWithAuth<AdminStation>(`${API_URL}/editor/stations/${stationID}`, accessToken)
}

export function getEditorStationIcon(accessToken: string, stationID: string) {
    return fetchJSONWithAuth<MediaAssetResponse>(`${API_URL}/editor/stations/${stationID}/icon`, accessToken)
}

export function updateEditorStation(accessToken: string, stationID: string, payload: EditorStationPayload) {
    return fetchJSONWithAuth<AdminStation>(`${API_URL}/editor/stations/${stationID}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(payload),
    })
}

export function probeEditorStationStream(accessToken: string, stationID: string, streamID: string, scope: StreamProbeScope) {
    return fetchJSONWithAuth<AdminStation>(
        `${API_URL}/editor/stations/${stationID}/streams/${streamID}/probe?scope=${scope}`,
        accessToken,
        { method: 'POST' },
    )
}
