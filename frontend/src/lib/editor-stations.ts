import { API_URL } from '@/lib/api'
import {
    optionalDateString,
    optionalNumber,
    optionalString,
    requireArray,
    requireBoolean,
    requireNumber,
    requireRecord,
    requireString,
    requireStringArray,
} from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { parseMediaAsset } from '@/lib/media'

const EDITOR_STATIONS_CONTRACT = 'editor stations payload'

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
    stations: AdminStation[]
    count: number
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

    return fetchJSONWithAuth<unknown>(
        `${API_URL}/editor/stations?${searchParams}`,
        accessToken,
    ).then(parseListEditorStationsResponse)
}

export function bulkUpdateEditorStations(accessToken: string, ids: string[], status: StationModerationStatus) {
    return fetchJSONWithAuth<void>(`${API_URL}/editor/stations/bulk`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ ids, status }),
    })
}

export function createEditorStation(accessToken: string, payload: EditorStationPayload) {
    return fetchJSONWithAuth<unknown>(`${API_URL}/editor/stations`, accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
    }).then((response) => parseAdminStation(response, 'station'))
}

export function getEditorStation(accessToken: string, stationID: string) {
    return fetchJSONWithAuth<unknown>(`${API_URL}/editor/stations/${stationID}`, accessToken).then((response) =>
        parseAdminStation(response, 'station'),
    )
}

export function getEditorStationIcon(accessToken: string, stationID: string) {
    return fetchJSONWithAuth<unknown>(`${API_URL}/editor/stations/${stationID}/icon`, accessToken).then((payload) =>
        parseMediaAsset(payload, 'station icon'),
    )
}

export function updateEditorStation(accessToken: string, stationID: string, payload: EditorStationPayload) {
    return fetchJSONWithAuth<unknown>(`${API_URL}/editor/stations/${stationID}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(payload),
    }).then((response) => parseAdminStation(response, 'station'))
}

export function probeEditorStationStream(accessToken: string, stationID: string, streamID: string, scope: StreamProbeScope) {
    return fetchJSONWithAuth<unknown>(
        `${API_URL}/editor/stations/${stationID}/streams/${streamID}/probe?scope=${scope}`,
        accessToken,
        { method: 'POST' },
    ).then((response) => parseAdminStation(response, 'station'))
}

function parseListEditorStationsResponse(payload: unknown): ListEditorStationsResponse {
    const response = requireRecord(payload, 'list editor stations response', EDITOR_STATIONS_CONTRACT)
    const stations = requireArray(response.stations, 'stations', EDITOR_STATIONS_CONTRACT)

    return {
        stations: stations.map((station, index) => parseAdminStation(station, `stations[${index}]`)),
        count: requireNumber(response.count, 'count', EDITOR_STATIONS_CONTRACT),
    }
}

function parseAdminStation(payload: unknown, field: string): AdminStation {
    const station = requireRecord(payload, field, EDITOR_STATIONS_CONTRACT)
    const streams = requireArray(station.streams, `${field}.streams`, EDITOR_STATIONS_CONTRACT)

    return {
        id: requireString(station.id, `${field}.id`, EDITOR_STATIONS_CONTRACT),
        name: requireString(station.name, `${field}.name`, EDITOR_STATIONS_CONTRACT),
        streams: streams.map((stream, index) => parseAdminStream(stream, `${field}.streams[${index}]`)),
        logo: optionalString(station.logo, `${field}.logo`, EDITOR_STATIONS_CONTRACT),
        website: optionalString(station.website, `${field}.website`, EDITOR_STATIONS_CONTRACT),
        genre_tags: requireStringArray(station.genre_tags, `${field}.genre_tags`, EDITOR_STATIONS_CONTRACT),
        subgenre_tags: requireStringArray(station.subgenre_tags, `${field}.subgenre_tags`, EDITOR_STATIONS_CONTRACT),
        search_tags: requireStringArray(station.search_tags, `${field}.search_tags`, EDITOR_STATIONS_CONTRACT),
        language: requireString(station.language, `${field}.language`, EDITOR_STATIONS_CONTRACT),
        country: requireString(station.country, `${field}.country`, EDITOR_STATIONS_CONTRACT),
        city: requireString(station.city, `${field}.city`, EDITOR_STATIONS_CONTRACT),
        style_tags: requireStringArray(station.style_tags, `${field}.style_tags`, EDITOR_STATIONS_CONTRACT),
        format_tags: requireStringArray(station.format_tags, `${field}.format_tags`, EDITOR_STATIONS_CONTRACT),
        texture_tags: requireStringArray(station.texture_tags, `${field}.texture_tags`, EDITOR_STATIONS_CONTRACT),
        reliability_score: requireNumber(station.reliability_score, `${field}.reliability_score`, EDITOR_STATIONS_CONTRACT),
        featured: requireBoolean(station.featured, `${field}.featured`, EDITOR_STATIONS_CONTRACT),
        status: requireString(station.status, `${field}.status`, EDITOR_STATIONS_CONTRACT),
        overview: optionalString(station.overview, `${field}.overview`, EDITOR_STATIONS_CONTRACT),
        editorial_review: optionalString(station.editorial_review, `${field}.editorial_review`, EDITOR_STATIONS_CONTRACT),
        internal_notes: optionalString(station.internal_notes, `${field}.internal_notes`, EDITOR_STATIONS_CONTRACT),
    }
}

function parseAdminStream(payload: unknown, field: string): AdminStream {
    const stream = requireRecord(payload, field, EDITOR_STATIONS_CONTRACT)

    return {
        id: requireString(stream.id, `${field}.id`, EDITOR_STATIONS_CONTRACT),
        url: requireString(stream.url, `${field}.url`, EDITOR_STATIONS_CONTRACT),
        resolved_url: requireString(stream.resolved_url, `${field}.resolved_url`, EDITOR_STATIONS_CONTRACT),
        kind: requireString(stream.kind, `${field}.kind`, EDITOR_STATIONS_CONTRACT),
        container: requireString(stream.container, `${field}.container`, EDITOR_STATIONS_CONTRACT),
        transport: requireString(stream.transport, `${field}.transport`, EDITOR_STATIONS_CONTRACT),
        mime_type: requireString(stream.mime_type, `${field}.mime_type`, EDITOR_STATIONS_CONTRACT),
        codec: requireString(stream.codec, `${field}.codec`, EDITOR_STATIONS_CONTRACT),
        lossless: requireBoolean(stream.lossless, `${field}.lossless`, EDITOR_STATIONS_CONTRACT),
        bitrate: requireNumber(stream.bitrate, `${field}.bitrate`, EDITOR_STATIONS_CONTRACT),
        bit_depth: requireNumber(stream.bit_depth, `${field}.bit_depth`, EDITOR_STATIONS_CONTRACT),
        sample_rate_hz: requireNumber(stream.sample_rate_hz, `${field}.sample_rate_hz`, EDITOR_STATIONS_CONTRACT),
        sample_rate_confidence: requireString(stream.sample_rate_confidence, `${field}.sample_rate_confidence`, EDITOR_STATIONS_CONTRACT),
        channels: requireNumber(stream.channels, `${field}.channels`, EDITOR_STATIONS_CONTRACT),
        priority: requireNumber(stream.priority, `${field}.priority`, EDITOR_STATIONS_CONTRACT),
        is_active: requireBoolean(stream.is_active, `${field}.is_active`, EDITOR_STATIONS_CONTRACT),
        loudness_integrated_lufs: optionalNumber(stream.loudness_integrated_lufs, `${field}.loudness_integrated_lufs`, EDITOR_STATIONS_CONTRACT),
        loudness_peak_dbfs: optionalNumber(stream.loudness_peak_dbfs, `${field}.loudness_peak_dbfs`, EDITOR_STATIONS_CONTRACT),
        loudness_sample_duration_seconds: requireNumber(stream.loudness_sample_duration_seconds, `${field}.loudness_sample_duration_seconds`, EDITOR_STATIONS_CONTRACT),
        loudness_measured_at: optionalDateString(stream.loudness_measured_at, `${field}.loudness_measured_at`, EDITOR_STATIONS_CONTRACT),
        loudness_measurement_status: requireString(stream.loudness_measurement_status, `${field}.loudness_measurement_status`, EDITOR_STATIONS_CONTRACT),
        metadata_enabled: requireBoolean(stream.metadata_enabled, `${field}.metadata_enabled`, EDITOR_STATIONS_CONTRACT),
        metadata_type: requireString(stream.metadata_type, `${field}.metadata_type`, EDITOR_STATIONS_CONTRACT),
        metadata_source: optionalString(stream.metadata_source, `${field}.metadata_source`, EDITOR_STATIONS_CONTRACT),
        metadata_url: optionalString(stream.metadata_url, `${field}.metadata_url`, EDITOR_STATIONS_CONTRACT),
        metadata_delayed: requireBoolean(stream.metadata_delayed, `${field}.metadata_delayed`, EDITOR_STATIONS_CONTRACT),
        metadata_error: optionalString(stream.metadata_error, `${field}.metadata_error`, EDITOR_STATIONS_CONTRACT),
        metadata_error_code: optionalString(stream.metadata_error_code, `${field}.metadata_error_code`, EDITOR_STATIONS_CONTRACT),
        metadata_last_fetched_at: optionalDateString(stream.metadata_last_fetched_at, `${field}.metadata_last_fetched_at`, EDITOR_STATIONS_CONTRACT),
        metadata_resolver: requireMetadataResolver(stream.metadata_resolver, `${field}.metadata_resolver`),
        metadata_resolver_checked_at: optionalDateString(stream.metadata_resolver_checked_at, `${field}.metadata_resolver_checked_at`, EDITOR_STATIONS_CONTRACT),
        health_score: requireNumber(stream.health_score, `${field}.health_score`, EDITOR_STATIONS_CONTRACT),
        last_checked_at: optionalDateString(stream.last_checked_at, `${field}.last_checked_at`, EDITOR_STATIONS_CONTRACT),
        last_error: optionalString(stream.last_error, `${field}.last_error`, EDITOR_STATIONS_CONTRACT),
    }
}

function requireMetadataResolver(value: unknown, field: string): AdminStream['metadata_resolver'] {
    if (value === 'none' || value === 'server' || value === 'client') {
        return value
    }

    throw new Error(`Invalid ${EDITOR_STATIONS_CONTRACT}: ${field} must be none, server, or client`)
}
