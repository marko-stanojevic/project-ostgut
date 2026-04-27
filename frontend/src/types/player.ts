export interface StationStream {
    id: string
    url: string
    resolvedUrl: string
    kind: string
    container: string
    transport: string
    mimeType: string
    codec?: string
    lossless?: boolean
    bitrate?: number
    bitDepth?: number
    sampleRateHz?: number
    sampleRateConfidence?: string
    channels?: number
    priority: number
    isActive: boolean
    metadataEnabled?: boolean
    metadataType?: string
    metadataSource?: string
    metadataUrl?: string
    metadataDelayed?: boolean
    metadataResolver?: 'none' | 'server' | 'client'
    metadataResolverCheckedAt?: string
    healthScore: number
    loudnessIntegratedLufs?: number
    loudnessPeakDbfs?: number
    loudnessSampleDurationSeconds?: number
    loudnessMeasuredAt?: string
    loudnessMeasurementStatus?: string
    lastCheckedAt?: string
    lastError?: string
}

export interface Station {
    id: string
    name: string
    streamUrl: string
    streams?: StationStream[]
    logo?: string
    genres: string[]
    country: string
    city?: string
    bitrate?: number
    codec?: string
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PersistedPlayerState {
    volume: number
    station: Station | null
    normalizationEnabled: boolean
    updatedAt: string
}

export interface PlayerPreferencesPayload {
    volume: number
    station: Station | null
    normalizationEnabled: boolean
    updatedAt: string
}

export function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 0.8
    return Math.max(0, Math.min(1, value))
}

export function normalizeNormalizationEnabled(value: unknown): boolean {
    if (typeof value !== 'boolean') return true
    return value
}

export function normalizeUpdatedAt(value: unknown): string {
    if (typeof value !== 'string') return new Date().toISOString()
    const t = Date.parse(value)
    if (!Number.isFinite(t)) return new Date().toISOString()
    return new Date(t).toISOString()
}

export function isTimestampNewer(next: string, current: string): boolean {
    const nextMs = Date.parse(next)
    const currentMs = Date.parse(current)
    if (!Number.isFinite(nextMs)) return false
    if (!Number.isFinite(currentMs)) return true
    return nextMs > currentMs
}

export function toPersistedSnapshot(
    volume: number,
    station: Station | null,
    normalizationEnabled: boolean,
    updatedAt: string,
): PersistedPlayerState {
    return {
        volume: clampVolume(volume),
        station,
        normalizationEnabled: normalizeNormalizationEnabled(normalizationEnabled),
        updatedAt,
    }
}

export const PLAYER_STORAGE_KEY = 'player:v1'

export function readPersistedPlayerState(): PersistedPlayerState | null {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY)
    if (!raw) return null

    try {
        const parsed = parsePersistedPlayerState(JSON.parse(raw))
        return {
            volume: clampVolume(parsed?.volume ?? 0.8),
            station: parsed?.station ?? null,
            normalizationEnabled: normalizeNormalizationEnabled(parsed?.normalizationEnabled),
            updatedAt: normalizeUpdatedAt(parsed?.updatedAt),
        }
    } catch {
        return null
    }
}

function parsePersistedPlayerState(value: unknown): Partial<PersistedPlayerState> {
    if (!isRecord(value)) return {}

    return {
        volume: typeof value.volume === 'number' ? value.volume : undefined,
        station: parsePersistedStation(value.station),
        normalizationEnabled: readBoolean(value.normalizationEnabled),
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    }
}

function parsePersistedStation(value: unknown): Station | null {
    if (value === null || value === undefined) return null
    if (!isRecord(value)) return null

    const id = readString(value.id)
    const name = readString(value.name)
    const streamUrl = readString(value.streamUrl)
    const country = readString(value.country)
    if (!id || !name || !streamUrl || !country) return null

    return {
        id,
        name,
        streamUrl,
        streams: parsePersistedStreams(value.streams),
        logo: readString(value.logo) || undefined,
        genres: parseStringArray(value.genres),
        country,
        city: readString(value.city) || undefined,
        bitrate: readNumber(value.bitrate),
        codec: readString(value.codec) || undefined,
    }
}

function parsePersistedStreams(value: unknown): StationStream[] | undefined {
    if (!Array.isArray(value)) return undefined
    const streams = value.flatMap((item) => {
        const stream = parsePersistedStream(item)
        return stream ? [stream] : []
    })
    return streams.length > 0 ? streams : undefined
}

function parsePersistedStream(value: unknown): StationStream | null {
    if (!isRecord(value)) return null

    const id = readString(value.id)
    const url = readString(value.url)
    const resolvedUrl = readString(value.resolvedUrl)
    const kind = readString(value.kind)
    const container = readString(value.container)
    const transport = readString(value.transport)
    const mimeType = readString(value.mimeType)
    const priority = readNumber(value.priority)
    const isActive = readBoolean(value.isActive)
    const healthScore = readNumber(value.healthScore)
    if (!id || !url || !resolvedUrl || !kind || !container || !transport || !mimeType || priority === undefined || isActive === undefined || healthScore === undefined) {
        return null
    }

    return {
        id,
        url,
        resolvedUrl,
        kind,
        container,
        transport,
        mimeType,
        codec: readString(value.codec) || undefined,
        lossless: readBoolean(value.lossless),
        bitrate: readNumber(value.bitrate),
        bitDepth: readNumber(value.bitDepth),
        sampleRateHz: readNumber(value.sampleRateHz),
        sampleRateConfidence: readString(value.sampleRateConfidence) || undefined,
        channels: readNumber(value.channels),
        priority,
        isActive,
        metadataEnabled: readBoolean(value.metadataEnabled),
        metadataType: readString(value.metadataType) || undefined,
        metadataSource: readString(value.metadataSource) || undefined,
        metadataUrl: readString(value.metadataUrl) || undefined,
        metadataDelayed: readBoolean(value.metadataDelayed),
        metadataResolver: readMetadataResolver(value.metadataResolver),
        metadataResolverCheckedAt: readString(value.metadataResolverCheckedAt) || undefined,
        healthScore,
        loudnessIntegratedLufs: readNumber(value.loudnessIntegratedLufs),
        loudnessPeakDbfs: readNumber(value.loudnessPeakDbfs),
        loudnessSampleDurationSeconds: readNumber(value.loudnessSampleDurationSeconds),
        loudnessMeasuredAt: readString(value.loudnessMeasuredAt) || undefined,
        loudnessMeasurementStatus: readString(value.loudnessMeasurementStatus) || undefined,
        lastCheckedAt: readString(value.lastCheckedAt) || undefined,
        lastError: readString(value.lastError) || undefined,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function parseStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readMetadataResolver(value: unknown): StationStream['metadataResolver'] {
    if (value === 'none' || value === 'server' || value === 'client') return value
    return undefined
}
