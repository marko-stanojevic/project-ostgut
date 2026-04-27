import { API_URL } from '@/lib/api'
import {
  optionalBoolean,
  optionalString,
  requireBoolean,
  requireDateString,
  requireNumber,
  requireRecord,
  requireString,
  requireStringArray,
} from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import type { PlayerPreferencesPayload, Station } from '@/types/player'

const PLAYER_PREFERENCES_CONTRACT = 'player preferences payload'

export interface PlayerPreferencesResponse extends PlayerPreferencesPayload {
  message?: string
  stale?: boolean
}

export function getPlayerPreferences(accessToken: string) {
  return fetchJSONWithAuth<unknown>(`${API_URL}/users/me/player-preferences`, accessToken).then(parsePlayerPreferencesPayload)
}

export function updatePlayerPreferences(accessToken: string, payload: PlayerPreferencesPayload, init?: RequestInit) {
  return fetchJSONWithAuth<unknown>(`${API_URL}/users/me/player-preferences`, accessToken, {
    ...init,
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then(parsePlayerPreferencesResponse)
}

function parsePlayerPreferencesResponse(payload: unknown): PlayerPreferencesResponse {
  const response = requireRecord(payload, 'player preferences response', PLAYER_PREFERENCES_CONTRACT)
  const parsed = parsePlayerPreferencesRecord(response)

  return {
    ...parsed,
    message: optionalString(response.message, 'message', PLAYER_PREFERENCES_CONTRACT),
    stale: optionalBoolean(response.stale, 'stale', PLAYER_PREFERENCES_CONTRACT),
  }
}

function parsePlayerPreferencesPayload(payload: unknown): PlayerPreferencesPayload {
  return parsePlayerPreferencesRecord(requireRecord(payload, 'player preferences response', PLAYER_PREFERENCES_CONTRACT))
}

function parsePlayerPreferencesRecord(payload: Record<string, unknown>): PlayerPreferencesPayload {
  return {
    volume: requirePlayerVolume(payload.volume, 'volume'),
    station: parsePlayerStation(payload.station, 'station'),
    normalizationEnabled: requireBoolean(payload.normalizationEnabled, 'normalizationEnabled', PLAYER_PREFERENCES_CONTRACT),
    updatedAt: requireDateString(payload.updatedAt, 'updatedAt', PLAYER_PREFERENCES_CONTRACT),
  }
}

function parsePlayerStation(value: unknown, field: string): Station | null {
  if (value === null) {
    return null
  }

  const station = requireRecord(value, field, PLAYER_PREFERENCES_CONTRACT)
  return {
    id: requireString(station.id, `${field}.id`, PLAYER_PREFERENCES_CONTRACT),
    name: requireString(station.name, `${field}.name`, PLAYER_PREFERENCES_CONTRACT),
    streamUrl: requireString(station.streamUrl, `${field}.streamUrl`, PLAYER_PREFERENCES_CONTRACT),
    logo: optionalString(station.logo, `${field}.logo`, PLAYER_PREFERENCES_CONTRACT),
    genres: requireStringArray(station.genres, `${field}.genres`, PLAYER_PREFERENCES_CONTRACT),
    country: requireString(station.country, `${field}.country`, PLAYER_PREFERENCES_CONTRACT),
    city: optionalString(station.city, `${field}.city`, PLAYER_PREFERENCES_CONTRACT),
    bitrate: requireNumber(station.bitrate, `${field}.bitrate`, PLAYER_PREFERENCES_CONTRACT),
    codec: requireString(station.codec, `${field}.codec`, PLAYER_PREFERENCES_CONTRACT),
  }
}

function requirePlayerVolume(value: unknown, field: string): number {
  const volume = requireNumber(value, field, PLAYER_PREFERENCES_CONTRACT)
  if (volume < 0 || volume > 1) {
    throw new Error(`Invalid ${PLAYER_PREFERENCES_CONTRACT}: ${field} must be between 0 and 1`)
  }

  return volume
}
