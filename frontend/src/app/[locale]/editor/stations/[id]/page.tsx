'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { usePlayer, type Station as PlayerStation } from '@/context/PlayerContext'
import { getEditorStation, getEditorStationIcon, updateEditorStation, type AdminStation, type AdminStream, type EditorStationPayload, type SupplementalMetadataProvider } from '@/lib/editor-stations'
import { getPreferredMediaUrl, type MediaAssetResponse } from '@/lib/media'
import { uploadMediaAsset } from '@/lib/media-upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { TagInput } from '@/components/ui/tag-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    RadioIcon,
    ArrowLeftIcon,
    FloppyDiskIcon,
    UploadSimpleIcon,
    PlayIcon,
    PauseIcon,
    PlusIcon,
    TrashIcon,
    CaretDownIcon,
} from '@phosphor-icons/react'

interface StreamFormEntry {
    id?: string
    url: string
    priority: number
    bitrate: string
    metadata_enabled: boolean
    metadata_provider: '' | SupplementalMetadataProvider
    metadata_provider_value: string
}

interface StationForm {
    name: string
    streams: StreamFormEntry[]
    logo: string
    website: string
    genre_tags: string[]
    subgenre_tags: string[]
    language: string
    country: string
    city: string
    style_tags: string[]
    format_tags: string[]
    texture_tags: string[]
    overview: string
    status: 'pending' | 'approved'
    featured: boolean
    editorial_review: string
    internal_notes: string
}

const STATUS_BADGE_BASE_CLASS = 'rounded-md border-transparent px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]'
const TECHNICAL_INPUT_CLASS = 'border-border/60 bg-muted/30 font-mono text-xs text-foreground/80 placeholder:text-muted-foreground/45 focus-visible:bg-background'
const TECHNICAL_VALUE_CLASS = 'break-all font-mono text-xs text-foreground/80'
const METADATA_WAIT_SECONDS_NORMAL = 6
const METADATA_WAIT_SECONDS_DELAYED = 20
const METADATA_PROVIDER_OPTIONS: Array<{ value: 'none' | SupplementalMetadataProvider; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'npr-composer', label: 'NPR Composer' },
    { value: 'nts-live', label: 'NTS Live' },
]

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'

type StatusBadgeItem = {
    label: string
    tone?: StatusTone
}

type MetadataDiagnosis = {
    primary: StatusBadgeItem
    detail: string
    evidence: StatusBadgeItem[]
}

type MetadataOpsField = {
    label: string
    value: string
    tone?: StatusTone
    mono?: boolean
}

function tagListLabel(tags: string[]) {
    return tags.length > 0 ? tags.join(', ') : undefined
}

function cleanTags(tags: string[]) {
    return tags.map((tag) => tag.trim()).filter(Boolean)
}

function statusBadgeClass(tone: StatusTone = 'neutral') {
    switch (tone) {
        case 'success':
            return `${STATUS_BADGE_BASE_CLASS} bg-success-soft text-success`
        case 'warning':
            return `${STATUS_BADGE_BASE_CLASS} bg-amber-500/10 text-amber-700 dark:text-amber-300`
        case 'danger':
            return `${STATUS_BADGE_BASE_CLASS} bg-destructive-soft text-destructive`
        default:
            return `${STATUS_BADGE_BASE_CLASS} bg-secondary text-secondary-foreground`
    }
}

function StatusBadge({ item }: { item: StatusBadgeItem }) {
    return (
        <Badge variant="secondary" className={statusBadgeClass(item.tone)}>
            {item.label}
        </Badge>
    )
}

function buildMetadataDiagnosis(stream: AdminStream, formStream: StreamFormEntry): MetadataDiagnosis {
    if (!formStream.metadata_enabled) {
        return {
            primary: { label: 'Disabled', tone: 'warning' },
            detail: 'Metadata is turned off for this stream and the player will not request now-playing data.',
            evidence: [],
        }
    }

    if (stream.metadata_plan?.delivery === 'client-poll') {
        return {
            primary: { label: 'Client metadata', tone: 'success' },
            detail: 'Browser-readable metadata is preferred, even if the last backend snapshot missed.',
            evidence: [
                { label: 'Delivery client-poll' },
                stream.metadata_source ? { label: `Source ${stream.metadata_source}` } : undefined,
                stream.metadata_url ? { label: 'Endpoint known' } : undefined,
            ].filter(Boolean) as StatusBadgeItem[],
        }
    }

    if (stream.metadata_plan?.delivery === 'hls-id3') {
        return {
            primary: { label: 'HLS ID3', tone: 'success' },
            detail: 'The player listens for in-stream ID3 metadata during HLS playback.',
            evidence: [{ label: 'Delivery hls-id3' }],
        }
    }

    if (stream.metadata_plan?.delivery === 'none' || stream.metadata_error_code === 'no_metadata') {
        return {
            primary: { label: 'No metadata', tone: 'warning' },
            detail: stream.metadata_error || 'No usable metadata path has been discovered. The player should not poll backend metadata for this stream.',
            evidence: [
                stream.metadata_plan?.delivery ? { label: `Delivery ${stream.metadata_plan.delivery}` } : undefined,
                stream.metadata_error_code ? { label: stream.metadata_error_code, tone: 'warning' } : undefined,
            ].filter(Boolean) as StatusBadgeItem[],
        }
    }

    if (stream.metadata_error || stream.metadata_error_code) {
        return {
            primary: { label: 'Metadata error', tone: 'danger' },
            detail: stream.metadata_error || stream.metadata_error_code || 'Latest metadata check failed.',
            evidence: [
                stream.metadata_error_code ? { label: stream.metadata_error_code, tone: 'danger' } : undefined,
                stream.metadata_plan?.delivery ? { label: `Delivery ${stream.metadata_plan.delivery}` } : undefined,
            ].filter(Boolean) as StatusBadgeItem[],
        }
    }

    switch (stream.metadata_plan?.delivery) {
        case 'sse':
            return {
                primary: { label: 'Server SSE', tone: 'neutral' },
                detail: 'The backend owns upstream metadata polling and fans out snapshots over SSE.',
                evidence: [
                    { label: 'Delivery sse' },
                    stream.metadata_source ? { label: `Source ${stream.metadata_source}` } : undefined,
                    stream.metadata_provider ? { label: `Provider ${stream.metadata_provider}` } : undefined,
                ].filter(Boolean) as StatusBadgeItem[],
            }
        default:
            return {
                primary: { label: 'Not checked', tone: 'warning' },
                detail: 'Metadata routing has not produced a runtime delivery plan yet. Refresh resolver or metadata after saving.',
                evidence: stream.metadata_resolver ? [{ label: `Resolver ${stream.metadata_resolver}` }] : [],
            }
    }
}

function persistedStreamForForm(stream: StreamFormEntry, savedByID: Map<string, AdminStream>): AdminStream | undefined {
    if (!stream.id) return undefined
    const saved = savedByID.get(stream.id)
    if (!saved) return undefined
    return saved.url.trim() === stream.url.trim() ? saved : undefined
}

function streamRowKey(stream: StreamFormEntry, index: number) {
    return stream.id ?? `new-${index}`
}

function buildStreamHealthBadge(stream: StreamFormEntry, persistedStream: AdminStream | undefined, validationMessage: string): StatusBadgeItem {
    if (validationMessage) return { label: 'Invalid URL', tone: 'danger' }
    if (!stream.url.trim()) return { label: 'Draft', tone: 'warning' }
    if (!persistedStream) return { label: 'Unsaved', tone: 'warning' }
    if (persistedStream.last_error) return { label: 'Probe error', tone: 'danger' }
    if (typeof persistedStream.health_score === 'number') {
        const score = Math.round(persistedStream.health_score * 100)
        return {
            label: `Health ${score}%`,
            tone: score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger',
        }
    }
    return { label: 'Health unknown' }
}

function buildMetadataHealthBadge(
    stream: StreamFormEntry,
    persistedStream: AdminStream | undefined,
    metadataDiagnosis: MetadataDiagnosis | null,
    validationMessage: string,
): StatusBadgeItem {
    if (!stream.metadata_enabled) return { label: 'Disabled', tone: 'warning' }
    if (validationMessage) return { label: 'Blocked', tone: 'danger' }
    if (!stream.url.trim()) return { label: 'Draft', tone: 'warning' }
    if (!persistedStream || !metadataDiagnosis) return { label: 'Unprobed', tone: 'warning' }

    return {
        label: metadataDiagnosis.primary.label,
        tone: metadataDiagnosis.primary.tone,
    }
}

function formatTimestamp(value?: string) {
    if (!value) return 'Not recorded'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
}

function metadataDeliveryLabel(delivery?: 'none' | 'sse' | 'client-poll' | 'hls-id3') {
    switch (delivery) {
        case 'client-poll':
            return 'Client poll'
        case 'hls-id3':
            return 'HLS ID3'
        case 'sse':
            return 'Server SSE'
        case 'none':
            return 'None'
        default:
            return 'Unknown'
    }
}

function metadataResolverLabel(resolver?: AdminStream['metadata_resolver']) {
    switch (resolver) {
        case 'client':
            return 'Client'
        case 'server':
            return 'Server'
        case 'none':
            return 'None'
        default:
            return 'Unknown'
    }
}

function metadataStatusTone(enabled: boolean, persistedStream: AdminStream | undefined): StatusTone {
    if (!enabled) return 'warning'
    if (!persistedStream) return 'warning'
    if (persistedStream.metadata_plan?.delivery === 'none' || persistedStream.metadata_resolver === 'none') return 'warning'
    if (persistedStream.metadata_error && persistedStream.metadata_error_code !== 'no_metadata') return 'danger'
    return 'success'
}

function buildMetadataOpsFields(
    formStream: StreamFormEntry,
    persistedStream: AdminStream | undefined,
    metadataDiagnosis: MetadataDiagnosis | null,
): MetadataOpsField[] {
    const requestedState = formStream.metadata_enabled ? 'Enabled' : 'Disabled'
    const persistedState = persistedStream?.metadata_enabled === undefined
        ? 'Unsaved'
        : persistedStream.metadata_enabled ? 'Enabled' : 'Disabled'
    const delivery = metadataDeliveryLabel(persistedStream?.metadata_plan?.delivery)
    const resolver = metadataResolverLabel(persistedStream?.metadata_resolver)
    const latestResult = persistedStream?.metadata_error
        ? persistedStream.metadata_error
        : persistedStream?.metadata_error_code
            ? persistedStream.metadata_error_code
            : persistedStream?.metadata_last_fetched_at
                ? 'Snapshot recorded'
                : 'No metadata snapshot'
    const endpoint = persistedStream?.metadata_url || 'No metadata endpoint'
    const source = persistedStream?.metadata_source || 'Unknown'
    const provider = persistedStream?.metadata_provider || 'None'
    const routeReason = persistedStream?.metadata_plan?.reason || 'No plan'
    const budget = persistedStream?.metadata_delayed ? `${METADATA_WAIT_SECONDS_DELAYED} seconds (delayed)` : `${METADATA_WAIT_SECONDS_NORMAL} seconds`

    return [
        { label: 'Requested state', value: requestedState, tone: formStream.metadata_enabled ? 'success' : 'warning' },
        { label: 'Persisted state', value: persistedState, tone: metadataStatusTone(persistedState === 'Enabled', persistedStream) },
        { label: 'Runtime delivery', value: delivery, tone: persistedStream?.metadata_plan?.delivery === 'none' ? 'warning' : 'neutral' },
        { label: 'Runtime resolver', value: resolver, tone: persistedStream?.metadata_resolver === 'none' ? 'warning' : 'neutral' },
        { label: 'Route reason', value: routeReason, mono: true },
        { label: 'Latest result', value: latestResult, tone: persistedStream?.metadata_error && persistedStream.metadata_error_code !== 'no_metadata' ? 'danger' : 'neutral' },
        { label: 'Latest fetch', value: formatTimestamp(persistedStream?.metadata_last_fetched_at) },
        { label: 'Resolver checked', value: formatTimestamp(persistedStream?.metadata_resolver_checked_at) },
        { label: 'Metadata source', value: source, mono: true },
        { label: 'Metadata endpoint', value: endpoint, mono: true },
        { label: 'Configured type', value: persistedStream?.metadata_type || 'auto', mono: true },
        { label: 'Supplemental provider', value: provider, mono: true },
        { label: 'ICY budget', value: budget },
        { label: 'Diagnosis', value: metadataDiagnosis?.primary.label || 'Unprobed', tone: metadataDiagnosis?.primary.tone },
    ]
}

function buildStreamOpsFields(
    formStream: StreamFormEntry,
    persistedStream: AdminStream | undefined,
    validationMessage: string,
    streamHealthBadge: StatusBadgeItem,
    streamQualityBadges: StatusBadgeItem[],
): MetadataOpsField[] {
    const requestedURL = formStream.url.trim() || 'No URL'
    const persistedURL = persistedStream?.resolved_url || persistedStream?.url || 'Unsaved'
    const requestedBitrate = formStream.bitrate.trim() ? `${formStream.bitrate.trim()} kbps` : 'Not set'
    const persistedBitrate = persistedStream?.bitrate && persistedStream.bitrate > 0 ? `${persistedStream.bitrate} kbps` : 'Unknown'
    const codec = persistedStream?.codec || 'Unknown'
    const transport = persistedStream?.transport || 'Unknown'
    const container = persistedStream?.container || 'Unknown'
    const qualitySummary = streamQualityBadges.map((item) => item.label).join(' · ') || 'No probe evidence'
    const latestProbe = persistedStream?.last_error || 'No stream errors recorded'

    return [
        { label: 'Health', value: streamHealthBadge.label, tone: streamHealthBadge.tone },
        { label: 'Validation', value: validationMessage || 'Valid', tone: validationMessage ? 'danger' : 'success' },
        { label: 'Requested URL', value: requestedURL, mono: true },
        { label: 'Persisted URL', value: persistedURL, mono: true },
        { label: 'Requested bitrate', value: requestedBitrate },
        { label: 'Persisted bitrate', value: persistedBitrate },
        { label: 'Codec', value: codec, mono: true },
        { label: 'Transport', value: transport, mono: true },
        { label: 'Container', value: container, mono: true },
        { label: 'Quality evidence', value: qualitySummary, mono: true },
        { label: 'Last probe', value: latestProbe, tone: persistedStream?.last_error ? 'danger' : 'neutral' },
        { label: 'Last checked', value: formatTimestamp(persistedStream?.last_checked_at) },
    ]
}

function loudnessStatusTone(status?: string): StatusTone {
    switch ((status || '').toLowerCase()) {
        case 'measured':
            return 'success'
        case 'failed':
            return 'danger'
        case 'insufficient_sample':
        case 'unavailable':
            return 'warning'
        default:
            return 'neutral'
    }
}

function buildLoudnessOpsFields(persistedStream: AdminStream): MetadataOpsField[] {
    const measuredLoudness = typeof persistedStream.loudness_integrated_lufs === 'number'
        ? `${persistedStream.loudness_integrated_lufs.toFixed(1)} LUFS`
        : 'Not measured'
    const truePeak = typeof persistedStream.loudness_peak_dbfs === 'number'
        ? `${persistedStream.loudness_peak_dbfs.toFixed(1)} dBFS`
        : 'Not measured'
    const sampleWindow = typeof persistedStream.loudness_sample_duration_seconds === 'number' && persistedStream.loudness_sample_duration_seconds > 0
        ? `${persistedStream.loudness_sample_duration_seconds.toFixed(1)} seconds`
        : 'No sample window'

    return [
        { label: 'Measurement state', value: formatLoudnessStatusLabel(persistedStream.loudness_measurement_status), tone: loudnessStatusTone(persistedStream.loudness_measurement_status) },
        { label: 'Integrated loudness', value: measuredLoudness },
        { label: 'True peak', value: truePeak },
        { label: 'Sample window', value: sampleWindow },
        { label: 'Measured at', value: formatTimestamp(persistedStream.loudness_measured_at) },
        { label: 'Health score', value: `${Math.round((persistedStream.health_score ?? 0) * 100)}%` },
    ]
}

function MetadataOpsFieldList({ fields }: { fields: MetadataOpsField[] }) {
    return (
        <div className="grid gap-3">
            {fields.map((field) => (
                <div key={field.label} className="grid gap-1">
                    <p className="text-xs text-muted-foreground">{field.label}</p>
                    <p className={field.mono ? TECHNICAL_VALUE_CLASS : 'text-sm'}>
                        {field.tone ? (
                            <span className={statusBadgeClass(field.tone).replace('px-2 py-0.5', 'px-0 py-0 bg-transparent border-transparent')}>
                                {field.value}
                            </span>
                        ) : field.value}
                    </p>
                </div>
            ))}
        </div>
    )
}

function buildStreamQualityBadges(stream: StreamFormEntry, persistedStream: AdminStream | undefined): StatusBadgeItem[] {
    if (!persistedStream) {
        const formBitrate = Number(stream.bitrate)
        return Number.isFinite(formBitrate) && formBitrate > 0
            ? [{ label: `${formBitrate} kbps` }, { label: 'Unprobed', tone: 'warning' }]
            : [{ label: 'Unprobed', tone: 'warning' }]
    }

    const badges: StatusBadgeItem[] = [{ label: persistedStream.kind }]
    if (persistedStream.codec) badges.push({ label: persistedStream.codec })
    if (persistedStream.lossless) badges.push({ label: 'Lossless', tone: 'success' })
    if (persistedStream.bit_depth > 0) badges.push({ label: `${persistedStream.bit_depth}-bit` })
    if (persistedStream.bitrate > 0) badges.push({ label: `${persistedStream.bitrate} kbps` })

    return badges
}

function SourceField({ label, value }: { label: string; value?: string }) {
    if (!value) {
        return (
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm italic text-muted-foreground/50">-</p>
            </div>
        )
    }

    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 break-all text-sm">{value}</p>
        </div>
    )
}

function isValidAbsoluteURL(value: string) {
    if (!value) return false
    try {
        const u = new URL(value)
        return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host)
    } catch {
        return false
    }
}

function getStreamURLValidationMessage(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (!isValidAbsoluteURL(trimmed)) return 'Enter a valid absolute URL'

    try {
        const u = new URL(trimmed)
        if (u.protocol !== 'https:') {
            return 'Stream URLs must use HTTPS for web playback on staging and production'
        }
    } catch {
        return 'Enter a valid absolute URL'
    }

    return ''
}

function getMetadataProviderValidationMessage(stream: StreamFormEntry) {
    if (!stream.metadata_provider) return ''
    const value = stream.metadata_provider_value.trim()
    if (stream.metadata_provider === 'npr-composer') {
        if (!value) return 'Enter an NPR Composer UCS code or playlist URL'
        if (!value.startsWith('http')) return ''
        try {
            const parsed = new URL(value)
            if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.composer.nprstations.org') {
                return 'Use the api.composer.nprstations.org playlist URL'
            }
        } catch {
            return 'Enter a valid Composer playlist URL or UCS code'
        }
    }
    if (stream.metadata_provider === 'nts-live' && value !== '1' && value !== '2') {
        return 'Choose NTS channel 1 or 2'
    }
    return ''
}

function metadataProviderPayload(stream: StreamFormEntry): Record<string, unknown> | undefined {
    const value = stream.metadata_provider_value.trim()
    if (stream.metadata_provider === 'npr-composer') {
        return value.startsWith('http') ? { url: value } : { ucs: value }
    }
    if (stream.metadata_provider === 'nts-live') {
        return { channel: value }
    }
    return undefined
}

function formatLoudnessStatusLabel(status?: string): string {
    switch ((status || '').toLowerCase()) {
        case 'measured':
            return 'Measured'
        case 'insufficient_sample':
            return 'Short sample'
        case 'unavailable':
            return 'Unavailable'
        case 'failed':
            return 'Failed'
        default:
            return 'Unknown'
    }
}

function createEmptyStream(priority: number): StreamFormEntry {
    return {
        url: '',
        priority,
        bitrate: '',
        metadata_enabled: true,
        metadata_provider: '',
        metadata_provider_value: '',
    }
}

function metadataProviderValue(stream: AdminStream): string {
    const config = stream.metadata_provider_config ?? {}
    if (stream.metadata_provider === 'npr-composer') {
        const ucs = config.ucs
        return typeof ucs === 'string' ? ucs : ''
    }
    if (stream.metadata_provider === 'nts-live') {
        const channel = config.channel
        return typeof channel === 'string' ? channel : ''
    }
    return ''
}

function toStreamFormEntry(stream: AdminStream, fallbackPriority: number): StreamFormEntry {
    return {
        id: stream.id,
        url: stream.url,
        priority: stream.priority || fallbackPriority,
        bitrate: stream.bitrate > 0 ? String(stream.bitrate) : '',
        metadata_enabled: true,
        metadata_provider: stream.metadata_provider ?? '',
        metadata_provider_value: metadataProviderValue(stream),
    }
}

function toStationForm(station: AdminStation): StationForm {
    return {
        name: station.name,
        streams: station.streams && station.streams.length > 0
            ? [...station.streams].sort((a, b) => a.priority - b.priority).map((stream, index) => toStreamFormEntry(stream, index + 1))
            : [createEmptyStream(1)],
        logo: station.logo ?? '',
        website: station.website ?? '',
        genre_tags: station.genre_tags ?? [],
        subgenre_tags: station.subgenre_tags ?? [],
        language: station.language ?? '',
        country: station.country,
        city: station.city ?? '',
        style_tags: station.style_tags ?? [],
        format_tags: station.format_tags ?? [],
        texture_tags: station.texture_tags ?? [],
        overview: station.overview ?? '',
        status: station.status === 'approved' ? 'approved' : 'pending',
        featured: !!station.featured,
        editorial_review: station.editorial_review ?? '',
        internal_notes: station.internal_notes ?? '',
    }
}

export default function StationEditorPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const { session } = useAuth()
    const { station: activeStation, state: playerState, play, pause } = usePlayer()
    const iconInputRef = useRef<HTMLInputElement | null>(null)

    const [station, setStation] = useState<AdminStation | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [stationIcon, setStationIcon] = useState<MediaAssetResponse | null>(null)
    const [uploadingIcon, setUploadingIcon] = useState(false)
    const [iconError, setIconError] = useState('')
    const [expandedStreamRows, setExpandedStreamRows] = useState<Set<string>>(() => new Set())

    const [form, setForm] = useState<StationForm>({
        name: '',
        streams: [createEmptyStream(1)],
        logo: '',
        website: '',
        genre_tags: [],
        subgenre_tags: [],
        language: '',
        country: '',
        city: '',
        style_tags: [],
        format_tags: [],
        texture_tags: [],
        overview: '',
        status: 'pending',
        featured: false,
        editorial_review: '',
        internal_notes: '',
    })

    const accessToken = session?.accessToken

    const trimmedName = form.name.trim()
    const logoURL = form.logo.trim()
    const websiteURL = form.website.trim()
    const streamValidationMessages = form.streams.map((s) => getStreamURLValidationMessage(s.url))
    const metadataProviderValidationMessages = form.streams.map((s) => getMetadataProviderValidationMessage(s))
    const hasAtLeastOneStreamURL = form.streams.some((s) => s.url.trim() !== '')

    const hasValidName = trimmedName.length > 0
    const hasValidStreams = form.streams.length > 0 &&
        streamValidationMessages.every((msg) => msg === '') &&
        metadataProviderValidationMessages.every((msg) => msg === '') &&
        hasAtLeastOneStreamURL
    const hasValidLogoURL = logoURL === '' || isValidAbsoluteURL(logoURL)
    const hasValidWebsiteURL = websiteURL === '' || isValidAbsoluteURL(websiteURL)
    const canSave = hasValidName && hasValidStreams && hasValidLogoURL && hasValidWebsiteURL

    useEffect(() => {
        if (!accessToken) return
        let cancelled = false

        const loadStation = async () => {
            setLoading(true)
            setError('')

            try {
                const s = await getEditorStation(accessToken, id)
                if (cancelled) return

                setStation(s)
                setForm(toStationForm(s))

                try {
                    const icon = await getEditorStationIcon(accessToken, id)
                    if (!cancelled) {
                        setStationIcon(icon)
                    }
                } catch {
                    if (!cancelled) {
                        setStationIcon(null)
                    }
                }
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load station')
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadStation()

        return () => {
            cancelled = true
        }
    }, [id, accessToken])

    const handleStationIconUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''

        if (!file || !accessToken) {
            return
        }

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setIconError('Use a JPG, PNG, or WebP image.')
            return
        }

        setIconError('')
        setUploadingIcon(true)

        try {
            const asset = await uploadMediaAsset(accessToken, {
                kind: 'station_icon',
                ownerId: id,
                contentType: file.type,
                contentLength: file.size,
            }, file)

            setStationIcon(asset)
            const uploadedUrl = getPreferredMediaUrl(asset)
            if (uploadedUrl) {
                setForm((prev) => ({ ...prev, logo: uploadedUrl }))
            }
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setIconError(err instanceof Error ? err.message : 'Failed to upload station icon')
        } finally {
            setUploadingIcon(false)
        }
    }

    const handleSave = async () => {
        if (!accessToken) return
        if (!canSave) {
            setError('Please fix invalid fields before saving')
            return
        }

        setSaving(true)
        setError('')
        setSaved(false)

        const body: EditorStationPayload = {
            name: trimmedName,
            streams: form.streams
                .filter(s => s.url.trim())
                .map((s, i) => {
                    const parsedBitrate = Number.parseInt(s.bitrate.trim(), 10)
                    return {
                        url: s.url.trim(),
                        priority: s.priority || i + 1,
                        bitrate: Number.isFinite(parsedBitrate) && parsedBitrate > 0 ? parsedBitrate : undefined,
                        metadata_enabled: true,
                        metadata_provider: s.metadata_provider || undefined,
                        metadata_provider_config: metadataProviderPayload(s),
                    }
                }),
            logo: logoURL,
            website: websiteURL,
            genre_tags: cleanTags(form.genre_tags),
            subgenre_tags: cleanTags(form.subgenre_tags),
            language: form.language.trim(),
            country: form.country.trim(),
            city: form.city.trim(),
            style_tags: cleanTags(form.style_tags),
            format_tags: cleanTags(form.format_tags),
            texture_tags: cleanTags(form.texture_tags),
            overview: form.overview.trim() || null,
            status: form.status,
            featured: form.featured,
            editorial_review: form.editorial_review.trim() || null,
            internal_notes: form.internal_notes.trim() || null,
        }

        try {
            const updated = await updateEditorStation(accessToken, id, body)

            setStation(updated)
            setForm(toStationForm(updated))
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-6 lg:grid-cols-2">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            </div>
        )
    }

    if (!station) {
        return <p className="text-destructive">Station not found</p>
    }

    const currentStyleTags = cleanTags(form.style_tags)
    const currentFormatTags = cleanTags(form.format_tags)
    const currentTextureTags = cleanTags(form.texture_tags)
    const currentGenreTags = cleanTags(form.genre_tags).map((g) => g.toLowerCase())
    const currentSubgenreTags = cleanTags(form.subgenre_tags).map((g) => g.toLowerCase())
    const allCurrentTags = [...new Set([...currentGenreTags, ...currentSubgenreTags, ...currentStyleTags, ...currentFormatTags, ...currentTextureTags])]
    const iconUrl = getPreferredMediaUrl(stationIcon) || logoURL
    const streamDetails = [...(station.streams ?? [])].sort((a, b) => a.priority - b.priority)
    const savedStreamByID = new Map(streamDetails.map((stream) => [stream.id, stream]))
    const streamRows = form.streams.map((stream) => ({
        form: stream,
        persisted: persistedStreamForForm(stream, savedStreamByID),
    }))
    const previewStreams = [...form.streams]
        .filter((stream) => stream.url.trim() !== '')
        .sort((a, b) => a.priority - b.priority)
        .map((stream, index) => {
            const trimmedUrl = stream.url.trim()
            const savedStream = persistedStreamForForm(stream, savedStreamByID)

            return {
                id: savedStream?.id ?? `preview-${index + 1}`,
                url: trimmedUrl,
                resolvedUrl: savedStream?.url === trimmedUrl && savedStream.resolved_url ? savedStream.resolved_url : trimmedUrl,
                kind: savedStream?.kind ?? 'direct',
                container: savedStream?.container ?? 'none',
                transport: savedStream?.transport ?? (trimmedUrl.startsWith('https://') ? 'https' : 'http'),
                mimeType: savedStream?.mime_type ?? '',
                codec: savedStream?.codec,
                lossless: savedStream?.lossless,
                bitrate: savedStream?.bitrate,
                bitDepth: savedStream?.bit_depth,
                sampleRateHz: savedStream?.sample_rate_hz,
                sampleRateConfidence: savedStream?.sample_rate_confidence,
                channels: savedStream?.channels,
                priority: stream.priority || index + 1,
                isActive: savedStream?.is_active ?? true,
                healthScore: savedStream?.health_score ?? 0,
                loudnessIntegratedLufs: savedStream?.loudness_integrated_lufs,
                loudnessPeakDbfs: savedStream?.loudness_peak_dbfs,
                loudnessSampleDurationSeconds: savedStream?.loudness_sample_duration_seconds,
                loudnessMeasuredAt: savedStream?.loudness_measured_at,
                loudnessMeasurementStatus: savedStream?.loudness_measurement_status,
                metadataEnabled: true,
                metadataType: savedStream?.metadata_type ?? 'auto',
                metadataSource: savedStream?.metadata_source,
                metadataUrl: savedStream?.metadata_url,
                metadataResolver: savedStream?.metadata_resolver ?? 'server',
                metadataResolverCheckedAt: savedStream?.metadata_resolver_checked_at,
                metadataPlan: savedStream?.metadata_plan ? {
                    resolver: savedStream.metadata_plan.resolver,
                    delivery: savedStream.metadata_plan.delivery,
                    preferredStrategy: savedStream.metadata_plan.preferred_strategy,
                    supportsClient: savedStream.metadata_plan.supports_client,
                    supportsServer: savedStream.metadata_plan.supports_server,
                    supportsServerSnapshot: savedStream.metadata_plan.supports_server_snapshot,
                    requiresClientConnectSrc: savedStream.metadata_plan.requires_client_connect_src,
                    pressureClass: savedStream.metadata_plan.pressure_class,
                    reason: savedStream.metadata_plan.reason,
                } : undefined,
                metadataDelayed: savedStream?.metadata_delayed,
                metadataError: savedStream?.metadata_error,
                metadataErrorCode: savedStream?.metadata_error_code,
                metadataLastFetchedAt: savedStream?.metadata_last_fetched_at,
                lastCheckedAt: savedStream?.last_checked_at,
                lastError: savedStream?.last_error,
            }
        })
    const primaryPreviewStreamURL = previewStreams[0]?.url ?? ''
    const previewStation: PlayerStation | null = station ? {
        id: station.id,
        name: trimmedName || station.name,
        streamUrl: primaryPreviewStreamURL,
        streams: previewStreams,
        logo: iconUrl || station.logo,
        genres: currentGenreTags,
        country: form.country.trim(),
        city: form.city.trim() || undefined,
        bitrate: previewStreams[0]?.bitrate,
        codec: previewStreams[0]?.codec,
    } : null
    const isPreviewActive = Boolean(previewStation && activeStation?.id === previewStation.id)
    const isPreviewPlaying = isPreviewActive && playerState === 'playing'

    return (
        <div className="w-full space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <button
                        onClick={() => router.back()}
                        className="mt-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{trimmedName || station.name}</h1>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {saved && <p className="text-sm text-success">Saved</p>}
                    <Button onClick={handleSave} disabled={saving || !canSave} className="gap-2">
                        <FloppyDiskIcon className="h-4 w-4" />
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                Station Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Station logo</p>
                                    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
                                        {iconUrl ? (
                                            <Image src={iconUrl} alt="" fill loading="eager" fetchPriority="high" sizes="(min-width: 768px) 192px, 100vw" className="object-cover" unoptimized />
                                        ) : (
                                            <RadioIcon className="h-8 w-8 text-muted-foreground" />
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <SourceField label="Genre tags" value={tagListLabel(form.genre_tags)} />
                                    <SourceField label="Language" value={form.language} />
                                    <SourceField label="Country" value={form.country} />
                                    <SourceField label="City" value={form.city} />
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Station icon</p>
                                        <input
                                            ref={iconInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={handleStationIconUpload}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => iconInputRef.current?.click()}
                                            disabled={uploadingIcon}
                                        >
                                            <UploadSimpleIcon className="h-4 w-4" />
                                            {uploadingIcon ? 'Uploading…' : 'Upload icon'}
                                        </Button>
                                        <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 10 MB.</p>
                                        {iconError && <p className="text-xs text-destructive">{iconError}</p>}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Preview</p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                if (!previewStation) return
                                                if (isPreviewPlaying) {
                                                    pause()
                                                    return
                                                }
                                                play(previewStation)
                                            }}
                                            disabled={previewStreams.length === 0}
                                        >
                                            {isPreviewPlaying ? <PauseIcon className="h-4 w-4" weight="fill" /> : <PlayIcon className="h-4 w-4" weight="fill" />}
                                            {isPreviewPlaying ? 'Pause station' : 'Play station'}
                                        </Button>
                                    </div>
                                    <SourceField label="Website" value={websiteURL} />
                                </div>
                            </div>

                            <Separator />

                            {allCurrentTags.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-xs text-muted-foreground">Tags</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {currentGenreTags.map((t) => (
                                            <StatusBadge key={`genre-${t}`} item={{ label: t }} />
                                        ))}
                                        {currentSubgenreTags.map((t) => (
                                            <StatusBadge key={`subgenre-${t}`} item={{ label: t }} />
                                        ))}
                                        {currentStyleTags.map((t) => (
                                            <StatusBadge key={`style-${t}`} item={{ label: t }} />
                                        ))}
                                        {currentFormatTags.map((t) => (
                                            <StatusBadge key={`format-${t}`} item={{ label: t }} />
                                        ))}
                                        {currentTextureTags.map((t) => (
                                            <StatusBadge key={`texture-${t}`} item={{ label: t }} />
                                        ))}
                                    </div>
                                </div>
                            )}

                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                Streams
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                {streamRows.map(({ form: stream, persisted: persistedStream }, i) => {
                                    const metadataDiagnosis = persistedStream ? buildMetadataDiagnosis(persistedStream, stream) : null
                                    const rowKey = streamRowKey(stream, i)
                                    const isExpanded = expandedStreamRows.has(rowKey)
                                    const streamHealthBadge = buildStreamHealthBadge(stream, persistedStream, streamValidationMessages[i] ?? '')
                                    const metadataHealthBadge = buildMetadataHealthBadge(stream, persistedStream, metadataDiagnosis, streamValidationMessages[i] ?? '')
                                    const streamQualityBadges = buildStreamQualityBadges(stream, persistedStream)

                                    return (
                                    <div key={rowKey} className="rounded-lg bg-muted/20">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} stream ${i + 1}`}
                                            onClick={() => setExpandedStreamRows((prev) => {
                                                const next = new Set(prev)
                                                if (next.has(rowKey)) {
                                                    next.delete(rowKey)
                                                } else {
                                                    next.add(rowKey)
                                                }
                                                return next
                                            })}
                                        >
                                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                                <StatusBadge item={{ label: `Priority ${stream.priority || i + 1}` }} />
                                                <StatusBadge item={streamHealthBadge} />
                                                <StatusBadge item={metadataHealthBadge} />
                                                {streamQualityBadges.map((item) => (
                                                    <StatusBadge key={item.label} item={item} />
                                                ))}
                                            </div>
                                            <CaretDownIcon className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isExpanded && (
                                        <div className="space-y-3 px-3 pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                                            <div className="flex-1 space-y-1">
                                                <Input
                                                    value={stream.url}
                                                    placeholder="https://…"
                                                    className={`flex-1 ${TECHNICAL_INPUT_CLASS}`}
                                                    onChange={(e) => setForm((prev) => ({
                                                        ...prev,
                                                        streams: prev.streams.map((s, idx) =>
                                                            idx === i ? { ...s, url: e.target.value } : s
                                                        ),
                                                    }))}
                                                />
                                                {streamValidationMessages[i] && (
                                                    <p className="text-xs text-destructive">{streamValidationMessages[i]}</p>
                                                )}
                                            </div>
                                            <Input
                                                value={stream.bitrate}
                                                type="number"
                                                min={0}
                                                placeholder="kbps"
                                                className="w-24 shrink-0"
                                                onChange={(e) => setForm((prev) => ({
                                                    ...prev,
                                                    streams: prev.streams.map((s, idx) =>
                                                        idx === i ? { ...s, bitrate: e.target.value } : s
                                                    ),
                                                }))}
                                            />
                                            {form.streams.length > 1 && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setForm((prev) => ({
                                                        ...prev,
                                                        streams: prev.streams
                                                            .filter((_, idx) => idx !== i)
                                                            .map((s, idx) => ({ ...s, priority: idx + 1 })),
                                                    }))}
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs text-muted-foreground">Supplemental metadata</Label>
                                                <Select
                                                    value={stream.metadata_provider || 'none'}
                                                    onValueChange={(value) => setForm((prev) => ({
                                                        ...prev,
                                                        streams: prev.streams.map((s, idx) => {
                                                            if (idx !== i) return s
                                                            const nextValue = value ?? 'none'
                                                            const provider = nextValue === 'none' ? '' : nextValue as SupplementalMetadataProvider
                                                            return {
                                                                ...s,
                                                                metadata_provider: provider,
                                                                metadata_provider_value: provider === 'nts-live'
                                                                    ? (s.metadata_provider_value === '2' ? '2' : '1')
                                                                    : provider === 'npr-composer'
                                                                        ? s.metadata_provider_value
                                                                        : '',
                                                            }
                                                        }),
                                                    }))}
                                                >
                                                    <SelectTrigger className="w-full" aria-label={`Supplemental metadata provider for stream ${i + 1}`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {METADATA_PROVIDER_OPTIONS.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {stream.metadata_provider === 'npr-composer' && (
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">NPR Composer code or URL</Label>
                                                    <Input
                                                        value={stream.metadata_provider_value}
                                                        placeholder="wxxx or https://api.composer.nprstations.org/..."
                                                        className={TECHNICAL_INPUT_CLASS}
                                                        onChange={(e) => setForm((prev) => ({
                                                            ...prev,
                                                            streams: prev.streams.map((s, idx) =>
                                                                idx === i ? { ...s, metadata_provider_value: e.target.value } : s
                                                            ),
                                                        }))}
                                                    />
                                                </div>
                                            )}

                                            {stream.metadata_provider === 'nts-live' && (
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">NTS channel</Label>
                                                    <Select
                                                        value={stream.metadata_provider_value || '1'}
                                                        onValueChange={(value) => setForm((prev) => ({
                                                            ...prev,
                                                            streams: prev.streams.map((s, idx) =>
                                                                idx === i ? { ...s, metadata_provider_value: value ?? '1' } : s
                                                            ),
                                                        }))}
                                                    >
                                                        <SelectTrigger className="w-full" aria-label={`NTS channel for stream ${i + 1}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">NTS 1</SelectItem>
                                                            <SelectItem value="2">NTS 2</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>

                                        {metadataProviderValidationMessages[i] && (
                                            <p className="text-xs text-destructive">{metadataProviderValidationMessages[i]}</p>
                                        )}

                                        {persistedStream ? (
                                            <div className="rounded-md border bg-muted/30 px-3 py-2">
                                                <div className="space-y-2">
                                                    <div className="space-y-1">
                                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stream URL</p>
                                                        <p className={TECHNICAL_VALUE_CLASS}>
                                                            {stream.url.trim() || 'Not set'}
                                                        </p>
                                                    </div>
                                                    {persistedStream.metadata_url && (
                                                        <div className="space-y-1">
                                                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metadata URL</p>
                                                            <p className={TECHNICAL_VALUE_CLASS}>
                                                                {persistedStream.metadata_url}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : stream.url.trim() ? (
                                            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                                Save this stream before trusting probe, metadata, or loudness diagnostics.
                                            </div>
                                        ) : null}

                                        {persistedStream && metadataDiagnosis && (
                                            <div className="grid gap-3 xl:grid-cols-3">
                                                <div className="flex h-full flex-col rounded-md bg-background/60 p-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-muted-foreground">Stream operations</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <StatusBadge item={streamHealthBadge} />
                                                            {streamQualityBadges.map((item) => (
                                                                <StatusBadge key={item.label} item={item} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 grid gap-4 border-t border-border/50 pt-4">
                                                        <MetadataOpsFieldList
                                                            fields={buildStreamOpsFields(
                                                                stream,
                                                                persistedStream,
                                                                streamValidationMessages[i] ?? '',
                                                                streamHealthBadge,
                                                                streamQualityBadges,
                                                            )}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex h-full flex-col rounded-md bg-background/60 p-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-muted-foreground">Metadata operations</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <StatusBadge item={metadataDiagnosis.primary} />
                                                            {metadataDiagnosis.evidence.map((item) => (
                                                                <StatusBadge key={item.label} item={item} />
                                                            ))}
                                                        </div>
                                                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                            {metadataDiagnosis.detail}
                                                        </p>
                                                    </div>
                                                    <div className="mt-4 grid gap-4 border-t border-border/50 pt-4">
                                                        <MetadataOpsFieldList
                                                            fields={buildMetadataOpsFields(stream, persistedStream, metadataDiagnosis)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex h-full flex-col rounded-md bg-background/60 p-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-muted-foreground">Loudness operations</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <StatusBadge item={{ label: formatLoudnessStatusLabel(persistedStream.loudness_measurement_status), tone: persistedStream.loudness_measurement_status === 'measured' ? 'success' : 'neutral' }} />
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 grid gap-4 border-t border-border/50 pt-4">
                                                        <MetadataOpsFieldList
                                                            fields={buildLoudnessOpsFields(persistedStream)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                        )}
                                    </div>
                                    )
                                })}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-1 gap-1.5"
                                onClick={() => setForm((prev) => ({
                                    ...prev,
                                    streams: [...prev.streams, createEmptyStream(prev.streams.length + 1)],
                                }))}
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                Add stream URL
                            </Button>
                            {!hasValidStreams && (
                                <p className="text-xs text-destructive">
                                    {hasAtLeastOneStreamURL
                                        ? 'Fix invalid stream URLs before saving'
                                        : 'At least one stream URL is required'}
                                </p>
                            )}
                        <p className="text-xs text-muted-foreground">
                            Saving updates the stream list without running diagnostics. Stream, metadata, and loudness observability appears below for saved streams. Stream variants must use HTTPS so they stay playable on the HTTPS web app. The first entry is primary and determines the station&apos;s canonical stream URL.
                        </p>
                    </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                Moderation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">Approved</p>
                                    <p className="text-xs text-muted-foreground">Not approved stations stay pending and remain hidden from public lists</p>
                                </div>
                                <Switch
                                    checked={form.status === 'approved'}
                                    onCheckedChange={(checked) =>
                                        setForm((prev) => ({ ...prev, status: checked ? 'approved' : 'pending' }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">Staff Pick</p>
                                    <p className="text-xs text-muted-foreground">Appears in staff picks and discovery ranking</p>
                                </div>
                                <Switch checked={form.featured} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, featured: !!checked }))} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                Station Data
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name">Name</Label>
                                <Input id="name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                                {!hasValidName ? (
                                    <p className="text-xs text-destructive">Name cannot be empty</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Used directly in public APIs</p>
                                )}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="logo">Logo URL</Label>
                                    <Input id="logo" value={form.logo} className={TECHNICAL_INPUT_CLASS} onChange={(e) => setForm((prev) => ({ ...prev, logo: e.target.value }))} />
                                    {!hasValidLogoURL && <p className="text-xs text-destructive">Logo URL must be a valid absolute URL</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="website">Website URL</Label>
                                    <Input id="website" value={form.website} className={TECHNICAL_INPUT_CLASS} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} />
                                    {!hasValidWebsiteURL && <p className="text-xs text-destructive">Website URL must be a valid absolute URL</p>}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="genre-tags">Genre tags</Label>
                                    <TagInput value={form.genre_tags} lowercase onChange={(next) => setForm((prev) => ({ ...prev, genre_tags: next }))} placeholder="Add genre, press Enter" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="subgenre-tags">Subgenre tags</Label>
                                    <TagInput value={form.subgenre_tags} lowercase onChange={(next) => setForm((prev) => ({ ...prev, subgenre_tags: next }))} placeholder="Add subgenre, press Enter" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="language">Language</Label>
                                    <Input id="language" value={form.language} onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="country">Country</Label>
                                    <Input id="country" value={form.country} onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="city">City</Label>
                                    <Input id="city" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="style-tags">Style tags</Label>
                                    <TagInput value={form.style_tags} onChange={(next) => setForm((prev) => ({ ...prev, style_tags: next }))} placeholder="Add style, press Enter" />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="format-tags">Format tags</Label>
                                    <TagInput value={form.format_tags} onChange={(next) => setForm((prev) => ({ ...prev, format_tags: next }))} placeholder="Add format, press Enter" />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="texture-tags">Texture tags</Label>
                                    <TagInput value={form.texture_tags} onChange={(next) => setForm((prev) => ({ ...prev, texture_tags: next }))} placeholder="Add texture, press Enter" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="overview">Overview</Label>
                                <Textarea
                                    id="overview"
                                    placeholder="Short station summary shown on detail page"
                                    value={form.overview}
                                    onChange={(e) => setForm((prev) => ({ ...prev, overview: e.target.value }))}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="editorial-review">Editorial review</Label>
                                <Textarea
                                    id="editorial-review"
                                    placeholder="Public editorial review shown in station details"
                                    value={form.editorial_review}
                                    onChange={(e) => setForm((prev) => ({ ...prev, editorial_review: e.target.value }))}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="internal-notes">Internal notes</Label>
                                <Textarea
                                    id="internal-notes"
                                    placeholder="Private editorial notes for internal use"
                                    value={form.internal_notes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, internal_notes: e.target.value }))}
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    )
}
