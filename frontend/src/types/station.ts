export interface ApiStream {
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
    metadata_mode: 'auto' | 'off'
    metadata_type: string
    metadata_source?: string
    metadata_url?: string
    metadata_delayed?: boolean
    metadata_error?: string
    metadata_error_code?: string
    metadata_last_fetched_at?: string
    metadata_resolver?: 'unknown' | 'none' | 'server' | 'client'
    metadata_resolver_checked_at?: string
    metadata_plan?: {
        resolver: 'unknown' | 'none' | 'server' | 'client'
        delivery: 'none' | 'sse' | 'client-poll' | 'hls-id3'
        preferred_strategy: string
        supports_client: boolean
        supports_server: boolean
        supports_server_snapshot: boolean
        requires_client_connect_src: boolean
        pressure_class: 'none' | 'client' | 'server-live'
        reason: string
    }
    health_score: number
    last_checked_at?: string
    last_error?: string
}

export interface ApiStation {
    id: string
    name: string
    streams?: ApiStream[]
    logo?: string
    genre_tags: string[]
    subgenre_tags?: string[]
    search_tags?: string[]
    style_tags?: string[]
    format_tags?: string[]
    texture_tags?: string[]
    editorial_review?: string
    language?: string
    country: string
    city: string
    bitrate?: number
    codec?: string
    reliability_score?: number
    featured?: boolean
}

export interface ApiStationDetail extends ApiStation {
    website?: string
    overview?: string
    description?: string
}
