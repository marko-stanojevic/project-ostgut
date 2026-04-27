import type { Station } from '@/types/player'
import type { ApiStation } from '@/types/station'

export function toStation(s: ApiStation): Station {
    const primaryStream = [...(s.streams ?? [])]
        .filter((stream) => stream.is_active)
        .sort((a, b) => a.priority - b.priority)[0]

    return {
        id: s.id,
        name: s.name,
        streamUrl: primaryStream ? (primaryStream.resolved_url || primaryStream.url || '').trim() : '',
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
            metadataEnabled: st.metadata_enabled,
            metadataType: st.metadata_type,
            metadataSource: st.metadata_source,
            metadataUrl: st.metadata_url,
            metadataDelayed: st.metadata_delayed,
            metadataError: st.metadata_error,
            metadataErrorCode: st.metadata_error_code,
            metadataLastFetchedAt: st.metadata_last_fetched_at,
            metadataResolver: st.metadata_resolver,
            metadataResolverCheckedAt: st.metadata_resolver_checked_at,
            metadataPlan: st.metadata_plan ? {
                resolver: st.metadata_plan.resolver,
                delivery: st.metadata_plan.delivery,
                preferredStrategy: st.metadata_plan.preferred_strategy,
                supportsClient: st.metadata_plan.supports_client,
                supportsServer: st.metadata_plan.supports_server,
                supportsServerSnapshot: st.metadata_plan.supports_server_snapshot,
                requiresClientConnectSrc: st.metadata_plan.requires_client_connect_src,
                pressureClass: st.metadata_plan.pressure_class,
                reason: st.metadata_plan.reason,
            } : undefined,
            healthScore: st.health_score,
            loudnessIntegratedLufs: st.loudness_integrated_lufs,
            loudnessPeakDbfs: st.loudness_peak_dbfs,
            loudnessSampleDurationSeconds: st.loudness_sample_duration_seconds,
            loudnessMeasuredAt: st.loudness_measured_at,
            loudnessMeasurementStatus: st.loudness_measurement_status,
            lastCheckedAt: st.last_checked_at,
            lastError: st.last_error,
        })),
        logo: s.logo,
        genres: s.genre_tags ?? [],
        country: s.country,
        city: s.city,
        bitrate: s.bitrate,
        codec: s.codec,
    }
}
