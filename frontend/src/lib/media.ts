export interface MediaAssetResponse {
    id: string
    kind: string
    status: string
    mime_type?: string
    original_url?: string
    variants?: Record<string, string>
    rejection_reason?: string
}

export function getPreferredMediaUrl(asset?: MediaAssetResponse | null): string | null {
    if (!asset) {
        return null
    }

    const variants = asset.variants ?? {}
    return (
        variants.webp_128 ??
        variants.webp_96 ??
        variants.webp_256 ??
        variants.webp_64 ??
        asset.original_url ??
        null
    )
}