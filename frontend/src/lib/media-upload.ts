import { API_URL } from '@/lib/api'
import { requireArray, requireDateString, requireNumber, requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { parseMediaAsset, type MediaAssetResponse } from '@/lib/media'

const MEDIA_UPLOAD_CONTRACT = 'media upload payload'

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
    return fetchJSONWithAuth(`${API_URL}/media/upload-intent`, accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
    }).then(parseUploadIntentResponse)
}

export function completeUpload(accessToken: string, assetId: string, blobKey: string) {
    return fetchJSONWithAuth(`${API_URL}/media/complete`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ assetId, blobKey }),
    }).then(parseCompleteUploadResponse)
}

export async function uploadMediaAsset(
    accessToken: string,
    payload: CreateUploadIntentPayload,
    file: File,
): Promise<MediaAssetResponse> {
    const intent = await createUploadIntent(accessToken, payload)

    const uploadResponse = await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
    })

    if (!uploadResponse.ok) {
        throw new Error('Upload failed')
    }

    const completed = await completeUpload(accessToken, intent.assetId, intent.blobKey)
    if (completed.status === 'rejected') {
        throw new Error(completed.asset.rejection_reason || 'Image was rejected')
    }

    return completed.asset
}

function parseUploadIntentResponse(payload: unknown): UploadIntentResponse {
    const response = requireRecord(payload, 'upload intent response', MEDIA_UPLOAD_CONTRACT)
    const constraints = requireRecord(response.constraints, 'constraints', MEDIA_UPLOAD_CONTRACT)
    const allowedMimeTypes = requireArray(constraints.allowedMimeTypes, 'constraints.allowedMimeTypes', MEDIA_UPLOAD_CONTRACT)

    return {
        assetId: requireString(response.assetId, 'assetId', MEDIA_UPLOAD_CONTRACT),
        uploadUrl: requireString(response.uploadUrl, 'uploadUrl', MEDIA_UPLOAD_CONTRACT),
        blobKey: requireString(response.blobKey, 'blobKey', MEDIA_UPLOAD_CONTRACT),
        expiresAt: requireDateString(response.expiresAt, 'expiresAt', MEDIA_UPLOAD_CONTRACT),
        constraints: {
            maxBytes: requireNumber(constraints.maxBytes, 'constraints.maxBytes', MEDIA_UPLOAD_CONTRACT),
            allowedMimeTypes: allowedMimeTypes.map((mimeType, index) =>
                requireString(mimeType, `constraints.allowedMimeTypes[${index}]`, MEDIA_UPLOAD_CONTRACT),
            ),
        },
    }
}

function parseCompleteUploadResponse(payload: unknown): CompleteUploadResponse {
    const response = requireRecord(payload, 'complete upload response', MEDIA_UPLOAD_CONTRACT)

    return {
        status: requireString(response.status, 'status', MEDIA_UPLOAD_CONTRACT),
        asset: parseMediaAsset(response.asset, 'asset'),
    }
}
