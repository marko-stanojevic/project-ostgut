import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import type { PlayerPreferencesPayload } from '@/types/player'

export interface PlayerPreferencesResponse extends PlayerPreferencesPayload {
  message?: string
  stale?: boolean
}

export function getPlayerPreferences(accessToken: string) {
  return fetchJSONWithAuth<PlayerPreferencesPayload>(`${API_URL}/users/me/player-preferences`, accessToken)
}

export function updatePlayerPreferences(accessToken: string, payload: PlayerPreferencesPayload, init?: RequestInit) {
  return fetchJSONWithAuth<PlayerPreferencesResponse>(`${API_URL}/users/me/player-preferences`, accessToken, {
    ...init,
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
