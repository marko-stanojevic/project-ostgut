import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import type { MediaAssetResponse } from '@/lib/media'

export interface UploadIntentResponse {
    assetId: string
    uploadUrl: string
    blobKey: string
    expiresAt: string
    constraints: {
        maxBytes: number
        allowedMimeTypes: string[]
    }
}

export interface CompleteUploadResponse {
    status: string
    asset: MediaAssetResponse
}

export interface CreateUploadIntentPayload {
    kind: string
    ownerId?: string
    contentType: string
    contentLength: number
}

export function createUploadIntent(accessToken: string, payload: CreateUploadIntentPayload) {
    return fetchJSONWithAuth<UploadIntentResponse>(`${API_URL}/media/upload-intent`, accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export function completeUpload(accessToken: string, assetId: string, blobKey: string) {
    return fetchJSONWithAuth<CompleteUploadResponse>(`${API_URL}/media/complete`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ assetId, blobKey }),
    })
}
