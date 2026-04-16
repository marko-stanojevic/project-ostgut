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