import { API_URL } from '@/lib/api'
import { requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { parseMediaAsset, type MediaAssetResponse } from '@/lib/media'

const USER_PROFILE_CONTRACT = 'user profile payload'

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

export interface UpdateUserProfileResponse {
    message: string
}

export function getUserProfile(accessToken: string, init?: RequestInit) {
    return fetchJSONWithAuth(`${API_URL}/users/me`, accessToken, init).then(parseUserProfile)
}

export function updateUserProfile(accessToken: string, payload: UpdateUserProfilePayload) {
    return fetchJSONWithAuth(`${API_URL}/users/me`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(payload),
    }).then(parseUpdateUserProfileResponse)
}

function parseUserProfile(payload: unknown): UserProfile {
    const profile = requireRecord(payload, 'user profile response', USER_PROFILE_CONTRACT)

    return {
        id: requireString(profile.id, 'id', USER_PROFILE_CONTRACT),
        email: requireString(profile.email, 'email', USER_PROFILE_CONTRACT),
        name: requireString(profile.name, 'name', USER_PROFILE_CONTRACT),
        role: requireUserRole(profile.role, 'role'),
        avatar: parseProfileAvatar(profile.avatar),
    }
}

function parseUpdateUserProfileResponse(payload: unknown): UpdateUserProfileResponse {
    const response = requireRecord(payload, 'update user profile response', USER_PROFILE_CONTRACT)

    return {
        message: requireString(response.message, 'message', USER_PROFILE_CONTRACT),
    }
}

function parseProfileAvatar(value: unknown): MediaAssetResponse | null {
    if (value === undefined || value === null) {
        return null
    }

    return parseMediaAsset(value, 'avatar')
}

function requireUserRole(value: unknown, field: string): UserProfile['role'] {
    if (value === 'user' || value === 'editor' || value === 'admin') {
        return value
    }

    throw new Error(`Invalid ${USER_PROFILE_CONTRACT}: ${field} must be user, editor, or admin`)
}
