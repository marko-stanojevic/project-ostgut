'use client'

import { useEffect } from 'react'
import {
    type Station,
    type PersistedPlayerState,
    PLAYER_STORAGE_KEY,
    clampVolume,
    isTimestampNewer,
    readPersistedPlayerState,
    toPersistedSnapshot,
} from '@/types/player'

interface ExternalUpdate {
    volume: number
    station: Station | null
    updatedAt: string
}

interface UsePlayerStorageOptions {
    volume: number
    station: Station | null
    updatedAt: string
    onExternalUpdate: (update: ExternalUpdate) => void
}

/**
 * Owns all localStorage interaction for player preferences.
 * Writes the current state on every change and listens for cross-tab StorageEvents.
 */
export function usePlayerStorage({
    volume,
    station,
    updatedAt,
    onExternalUpdate,
}: UsePlayerStorageOptions): void {
    // Write to localStorage whenever preferences change.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const snapshot = toPersistedSnapshot(volume, station, updatedAt)
        window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(snapshot))
    }, [volume, station, updatedAt])

    // Listen for updates from other tabs.
    useEffect(() => {
        if (typeof window === 'undefined') return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== PLAYER_STORAGE_KEY) return
            const nextState: PersistedPlayerState | null = readPersistedPlayerState()
            if (!nextState) return
            if (!isTimestampNewer(nextState.updatedAt, updatedAt)) return

            onExternalUpdate({
                volume: clampVolume(nextState.volume),
                station: nextState.station,
                updatedAt: nextState.updatedAt,
            })
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [updatedAt, onExternalUpdate])
}
