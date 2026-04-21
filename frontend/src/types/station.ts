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
    health_score: number
    last_checked_at?: string
    last_error?: string
}

export interface ApiStation {
    id: string
    name: string
    stream_url: string
    streams?: ApiStream[]
    logo?: string
    genres: string[]
    language?: string
    country: string
    city: string
    country_code: string
    bitrate?: number
    codec?: string
    reliability_score?: number
    featured?: boolean
}
