'use client'

import { useEffect, useRef } from 'react'
import {
    type Station,
    type PlayerPreferencesPayload,
    clampVolume,
    normalizeNormalizationEnabled,
    normalizeUpdatedAt,
    isTimestampNewer,
} from '@/types/player'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface RemoteUpdate {
    volume: number
    station: Station | null
    normalizationEnabled: boolean
    updatedAt: string
}

interface UsePlayerSyncOptions {
    volume: number
    station: Station | null
    normalizationEnabled: boolean
    updatedAt: string
    accessToken: string | null | undefined
    onRemoteUpdate: (update: RemoteUpdate) => void
}

/**
 * Owns all backend sync for player preferences.
 * Hydrates from the remote on mount (once per session) and debounces PUT on every change.
 */
export function usePlayerSync({
    volume,
    station,
    normalizationEnabled,
    updatedAt,
    accessToken,
    onRemoteUpdate,
}: UsePlayerSyncOptions): void {
    const didHydrateRef = useRef(false)

    // Reset hydration flag when the user session changes.
    useEffect(() => {
        didHydrateRef.current = false
    }, [accessToken])

    // Hydrate from remote once per session token.
    useEffect(() => {
        if (!accessToken || didHydrateRef.current) return

        let isCancelled = false

        const loadRemotePreferences = async () => {
            try {
                const res = await fetch(`${API}/users/me/player-preferences`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                if (!res.ok) return

                const payload = (await res.json()) as Partial<PlayerPreferencesPayload>
                const remoteUpdatedAt = normalizeUpdatedAt(payload.updatedAt)

                if (!isTimestampNewer(remoteUpdatedAt, updatedAt)) {
                    didHydrateRef.current = true
                    return
                }
                if (isCancelled) return

                onRemoteUpdate({
                    volume: clampVolume(payload.volume ?? 0.8),
                    station: payload.station ?? null,
                    normalizationEnabled: normalizeNormalizationEnabled(payload.normalizationEnabled),
                    updatedAt: remoteUpdatedAt,
                })
            } catch {
                // Keep local preferences when network sync is unavailable.
            } finally {
                didHydrateRef.current = true
            }
        }

        loadRemotePreferences()

        return () => {
            isCancelled = true
        }
        // updatedAt intentionally omitted — only run once per accessToken change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, onRemoteUpdate])

    // Debounced PUT on every preference change.
    useEffect(() => {
        if (!accessToken) return

        const controller = new AbortController()
        const timeoutID = window.setTimeout(() => {
            const payload: PlayerPreferencesPayload = { volume, station, normalizationEnabled, updatedAt }

            fetch(`${API}/users/me/player-preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            }).catch(() => {
                // Keep local preferences when network sync is unavailable.
            })
        }, 700)

        return () => {
            controller.abort()
            window.clearTimeout(timeoutID)
        }
    }, [accessToken, volume, station, normalizationEnabled, updatedAt])
}
