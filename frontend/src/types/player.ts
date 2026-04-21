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
    healthScore: number
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
    countryCode: string
    bitrate?: number
    codec?: string
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PersistedPlayerState {
    volume: number
    station: Station | null
    updatedAt: string
}

export interface PlayerPreferencesPayload {
    volume: number
    station: Station | null
    updatedAt: string
}

export function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 0.8
    return Math.max(0, Math.min(1, value))
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
    updatedAt: string,
): PersistedPlayerState {
    return {
        volume: clampVolume(volume),
        station,
        updatedAt,
    }
}

export const PLAYER_STORAGE_KEY = 'player:v1'

export function readPersistedPlayerState(): PersistedPlayerState | null {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY)
    if (!raw) return null

    try {
        const parsed = JSON.parse(raw) as PersistedPlayerState
        return {
            volume: clampVolume(parsed?.volume ?? 0.8),
            station: parsed?.station ?? null,
            updatedAt: normalizeUpdatedAt(parsed?.updatedAt),
        }
    } catch {
        return null
    }
}
