import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import type { MediaAssetResponse } from '@/lib/media'

export interface UserProfile {
    id: string
    email: string
    name: string
    role: 'user' | 'editor' | 'admin'
    avatar?: MediaAssetResponse | null
}

export interface UpdateUserProfilePayload {
    name: string
}

export function getUserProfile(accessToken: string, init?: RequestInit) {
    return fetchJSONWithAuth<UserProfile>(`${API_URL}/users/me`, accessToken, init)
}

export function updateUserProfile(accessToken: string, payload: UpdateUserProfilePayload) {
    return fetchJSONWithAuth<UserProfile>(`${API_URL}/users/me`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(payload),
    })
}
