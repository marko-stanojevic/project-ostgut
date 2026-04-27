import { optionalString, requireRecord, requireString } from '@/lib/api-contract'

const MEDIA_CONTRACT = 'media asset payload'

export interface MediaAssetResponse {
    id: string
    kind: string
    status: string
    mime_type?: string
    original_url?: string
    variants?: Record<string, string>
    rejection_reason?: string
}

export function parseMediaAsset(payload: unknown, field = 'asset'): MediaAssetResponse {
    const asset = requireRecord(payload, field, MEDIA_CONTRACT)

    return {
        id: requireString(asset.id, `${field}.id`, MEDIA_CONTRACT),
        kind: requireString(asset.kind, `${field}.kind`, MEDIA_CONTRACT),
        status: requireString(asset.status, `${field}.status`, MEDIA_CONTRACT),
        mime_type: optionalString(asset.mime_type, `${field}.mime_type`, MEDIA_CONTRACT),
        original_url: optionalString(asset.original_url, `${field}.original_url`, MEDIA_CONTRACT),
        variants: parseMediaVariants(asset.variants, `${field}.variants`),
        rejection_reason: optionalString(asset.rejection_reason, `${field}.rejection_reason`, MEDIA_CONTRACT),
    }
}

function parseMediaVariants(value: unknown, field: string): Record<string, string> | undefined {
    if (value === undefined || value === null) {
        return undefined
    }

    const variants = requireRecord(value, field, MEDIA_CONTRACT)
    return Object.fromEntries(
        Object.entries(variants).map(([key, url]) => [key, requireString(url, `${field}.${key}`, MEDIA_CONTRACT)]),
    )
}

export function getPreferredMediaUrl(asset?: MediaAssetResponse | null): string | null {
    if (!asset) {
        return null
    }

    const variants = asset.variants ?? {}
    return (
        variants.png_512 ??
        variants.png_192 ??
        variants.webp_128 ??
        variants.webp_96 ??
        variants.webp_256 ??
        variants.webp_64 ??
        variants.png_128 ??
        variants.png_96 ??
        variants.png_256 ??
        variants.png_64 ??
        asset.original_url ??
        null
    )
}