import type { Station } from '@/types/player'
import type { ApiStation } from '@/types/station'

export function toStation(s: ApiStation): Station {
    return {
        id: s.id,
        name: s.name,
        streamUrl: s.stream_url,
        streams: s.streams?.map((st) => ({
            id: st.id,
            url: st.url,
            resolvedUrl: st.resolved_url,
            kind: st.kind,
            container: st.container,
            transport: st.transport,
            mimeType: st.mime_type,
            codec: st.codec,
            lossless: st.lossless,
            bitrate: st.bitrate,
            bitDepth: st.bit_depth,
            sampleRateHz: st.sample_rate_hz,
            sampleRateConfidence: st.sample_rate_confidence,
            channels: st.channels,
            priority: st.priority,
            isActive: st.is_active,
            healthScore: st.health_score,
            lastCheckedAt: st.last_checked_at,
            lastError: st.last_error,
        })),
        logo: s.logo,
        genres: s.genres ?? [],
        country: s.country,
        city: s.city,
        bitrate: s.bitrate,
        codec: s.codec,
    }
}
