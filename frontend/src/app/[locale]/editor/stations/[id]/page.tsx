'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { usePlayer, type Station as PlayerStation } from '@/context/PlayerContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { getPreferredMediaUrl, type MediaAssetResponse } from '@/lib/media'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
    RadioIcon,
    ArrowLeftIcon,
    ArrowsClockwiseIcon,
    FloppyDiskIcon,
    UploadSimpleIcon,
    PlayIcon,
    PauseIcon,
    PlusIcon,
    CircleNotchIcon,
    WaveformIcon,
    TrashIcon,
} from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface AdminStream {
    id: string
    url: string
    resolved_url: string
    kind: string
    container: string
    transport: string
    mime_type: string
    codec: string
    lossless: boolean
    bitrate: number
    bit_depth: number
    sample_rate_hz: number
    sample_rate_confidence: string
    channels: number
    priority: number
    is_active: boolean
    loudness_integrated_lufs?: number
    loudness_peak_dbfs?: number
    loudness_sample_duration_seconds?: number
    loudness_measured_at?: string
    loudness_measurement_status?: string
    metadata_enabled: boolean
    metadata_type: string
    metadata_source?: string
    metadata_url?: string
    metadata_delayed?: boolean
    metadata_error?: string
    metadata_error_code?: string
    metadata_last_fetched_at?: string
    metadata_resolver?: 'none' | 'server' | 'client'
    metadata_resolver_checked_at?: string
    health_score: number
    last_checked_at?: string
    last_error?: string
}

interface AdminStation {
    id: string
    name: string
    streams?: AdminStream[]
    logo?: string
    website?: string
    genre_tags: string[]
    subgenre_tags: string[]
    search_tags: string[]
    language: string
    country: string
    city: string
    style_tags: string[]
    format_tags: string[]
    texture_tags: string[]
    reliability_score: number
    featured: boolean
    status: string
    overview?: string
    editorial_review?: string
    internal_notes?: string
}

interface StreamFormEntry {
    url: string
    priority: number
    bitrate: string
    metadata_enabled: boolean
}

interface StationForm {
    name: string
    streams: StreamFormEntry[]
    logo: string
    website: string
    genre_tags: string
    subgenre_tags: string
    language: string
    country: string
    city: string
    style_tags: string
    format_tags: string
    texture_tags: string
    overview: string
    status: 'pending' | 'approved'
    featured: boolean
    editorial_review: string
    internal_notes: string
}

type UploadIntentResponse = {
    assetId: string
    uploadUrl: string
    blobKey: string
    expiresAt: string
    constraints: {
        maxBytes: number
        allowedMimeTypes: string[]
    }
}

type CompleteUploadResponse = {
    status: string
    asset: MediaAssetResponse
}

const ADMIN_TAG_BADGE_CLASS = 'ui-admin-tag-badge rounded-none border-transparent font-medium text-[10px] uppercase tracking-wide'
const METADATA_WAIT_SECONDS_NORMAL = 6
const METADATA_WAIT_SECONDS_DELAYED = 20

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

function formatSampleRateConfidenceLabel(stream: AdminStream): string {
    switch ((stream.sample_rate_confidence || '').toLowerCase()) {
        case 'parsed_streaminfo':
            return 'Verified (STREAMINFO)'
        case 'parsed_frame':
            return 'Verified (Frame)'
        default:
            return 'Unknown confidence'
    }
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
    }
}

function toStreamFormEntry(stream: AdminStream, fallbackPriority: number): StreamFormEntry {
    return {
        url: stream.url,
        priority: stream.priority || fallbackPriority,
        bitrate: stream.bitrate > 0 ? String(stream.bitrate) : '',
        metadata_enabled: stream.metadata_enabled ?? true,
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
        genre_tags: (station.genre_tags ?? []).join(', '),
        subgenre_tags: (station.subgenre_tags ?? []).join(', '),
        language: station.language,
        country: station.country,
        city: station.city ?? '',
        style_tags: (station.style_tags ?? []).join(', '),
        format_tags: (station.format_tags ?? []).join(', '),
        texture_tags: (station.texture_tags ?? []).join(', '),
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
    const [probeError, setProbeError] = useState('')
    const [stationIcon, setStationIcon] = useState<MediaAssetResponse | null>(null)
    const [uploadingIcon, setUploadingIcon] = useState(false)
    const [iconError, setIconError] = useState('')
    const [probingAction, setProbingAction] = useState('')

    const [form, setForm] = useState<StationForm>({
        name: '',
        streams: [createEmptyStream(1)],
        logo: '',
        website: '',
        genre_tags: '',
        subgenre_tags: '',
        language: '',
        country: '',
        city: '',
        style_tags: '',
        format_tags: '',
        texture_tags: '',
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
    const hasAtLeastOneStreamURL = form.streams.some((s) => s.url.trim() !== '')

    const hasValidName = trimmedName.length > 0
    const hasValidStreams = form.streams.length > 0 &&
        streamValidationMessages.every((msg) => msg === '') &&
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
            setProbeError('')

            try {
                const s = await fetchJSONWithAuth<AdminStation>(
                    `${API}/editor/stations/${id}`,
                    accessToken,
                )
                if (cancelled) return

                setStation(s)
                setForm(toStationForm(s))

                try {
                    const icon = await fetchJSONWithAuth<MediaAssetResponse>(
                        `${API}/editor/stations/${id}/icon`,
                        accessToken,
                    )
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
            const intent = await fetchJSONWithAuth<UploadIntentResponse>(`${API}/media/upload-intent`, accessToken, {
                method: 'POST',
                body: JSON.stringify({
                    kind: 'station_icon',
                    ownerId: id,
                    contentType: file.type,
                    contentLength: file.size,
                }),
            })

            const uploadResponse = await fetch(intent.uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type,
                },
                body: file,
            })

            if (!uploadResponse.ok) {
                throw new Error('Upload failed')
            }

            const completed = await fetchJSONWithAuth<CompleteUploadResponse>(`${API}/media/complete`, accessToken, {
                method: 'POST',
                body: JSON.stringify({
                    assetId: intent.assetId,
                    blobKey: intent.blobKey,
                }),
            })

            if (completed.status === 'rejected') {
                throw new Error(completed.asset.rejection_reason || 'Image was rejected')
            }

            setStationIcon(completed.asset)
            const uploadedUrl = getPreferredMediaUrl(completed.asset)
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

        const body: Record<string, unknown> = {
            name: trimmedName,
            streams: form.streams
                .filter(s => s.url.trim())
                .map((s, i) => {
                    const parsedBitrate = Number.parseInt(s.bitrate.trim(), 10)
                    return {
                        url: s.url.trim(),
                        priority: s.priority || i + 1,
                        bitrate: Number.isFinite(parsedBitrate) && parsedBitrate > 0 ? parsedBitrate : undefined,
                        metadata_enabled: s.metadata_enabled,
                    }
                }),
            logo: logoURL,
            website: websiteURL,
            genre_tags: form.genre_tags.split(',').map((g) => g.trim()).filter(Boolean),
            subgenre_tags: form.subgenre_tags.split(',').map((g) => g.trim()).filter(Boolean),
            language: form.language.trim(),
            country: form.country.trim(),
            city: form.city.trim(),
            style_tags: form.style_tags.split(',').map((t) => t.trim()).filter(Boolean),
            format_tags: form.format_tags.split(',').map((t) => t.trim()).filter(Boolean),
            texture_tags: form.texture_tags.split(',').map((t) => t.trim()).filter(Boolean),
            overview: form.overview.trim() || null,
            status: form.status,
            featured: form.featured,
            editorial_review: form.editorial_review.trim() || null,
            internal_notes: form.internal_notes.trim() || null,
        }

        try {
            const updated = await fetchJSONWithAuth<AdminStation>(`${API}/editor/stations/${id}`, accessToken, {
                method: 'PUT',
                body: JSON.stringify(body),
            })

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

    const handleProbeStream = async (streamID: string, scope: 'quality' | 'metadata' | 'resolver' | 'loudness' | 'full') => {
        if (!accessToken) return

        setProbingAction(`${streamID}:${scope}`)
        setProbeError('')

        try {
            const updated = await fetchJSONWithAuth<AdminStation>(
                `${API}/editor/stations/${id}/streams/${streamID}/probe?scope=${scope}`,
                accessToken,
                { method: 'POST' },
            )

            setStation(updated)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setProbeError(err instanceof Error ? err.message : 'Failed to run stream probe')
        } finally {
            setProbingAction('')
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

    const currentStyleTags = form.style_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentFormatTags = form.format_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentTextureTags = form.texture_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentGenreTags = form.genre_tags.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean)
    const currentSubgenreTags = form.subgenre_tags.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean)
    const allCurrentTags = [...new Set([...currentGenreTags, ...currentSubgenreTags, ...currentStyleTags, ...currentFormatTags, ...currentTextureTags])]
    const iconUrl = getPreferredMediaUrl(stationIcon) || logoURL
    const streamDetails = [...(station.streams ?? [])].sort((a, b) => a.priority - b.priority)
    const savedStreamByPriority = new Map(streamDetails.map((stream) => [stream.priority, stream]))
    const previewStreams = [...form.streams]
        .filter((stream) => stream.url.trim() !== '')
        .sort((a, b) => a.priority - b.priority)
        .map((stream, index) => {
            const trimmedUrl = stream.url.trim()
            const savedStream = savedStreamByPriority.get(stream.priority)

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
                metadataEnabled: stream.metadata_enabled,
                metadataType: savedStream?.metadata_type,
                metadataSource: savedStream?.metadata_source,
                metadataUrl: savedStream?.metadata_url,
                metadataResolver: savedStream?.metadata_resolver,
                metadataResolverCheckedAt: savedStream?.metadata_resolver_checked_at,
                metadataDelayed: savedStream?.metadata_delayed,
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
                    {probeError && <p className="text-sm text-destructive">{probeError}</p>}
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
                                            <Image src={iconUrl} alt="" fill sizes="(min-width: 768px) 192px, 100vw" className="object-cover" unoptimized />
                                        ) : (
                                            <RadioIcon className="h-8 w-8 text-muted-foreground" />
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <SourceField label="Genre tags" value={form.genre_tags} />
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
                                            <Badge key={`genre-${t}`} variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentSubgenreTags.map((t) => (
                                            <Badge key={`subgenre-${t}`} variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentStyleTags.map((t) => (
                                            <Badge key={`style-${t}`} variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentFormatTags.map((t) => (
                                            <Badge key={`format-${t}`} variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentTextureTags.map((t) => (
                                            <Badge key={`texture-${t}`} variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                {t}
                                            </Badge>
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
                                {form.streams.map((stream, i) => (
                                    <div key={i} className="space-y-3 rounded-lg border p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                                            <div className="flex-1 space-y-1">
                                                <Input
                                                    value={stream.url}
                                                    placeholder="https://…"
                                                    className="flex-1"
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

                                        {streamDetails[i] && (
                                            <div className="rounded-md border bg-muted/30 px-3 py-2">
                                                <div className="space-y-2">
                                                    <div className="space-y-1">
                                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stream URL</p>
                                                        <p className="break-all font-mono text-xs text-foreground/80">
                                                            {stream.url.trim() || 'Not set'}
                                                        </p>
                                                    </div>
                                                    {streamDetails[i].metadata_url && (
                                                        <div className="space-y-1">
                                                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metadata URL</p>
                                                            <p className="break-all font-mono text-xs text-foreground/80">
                                                                {streamDetails[i].metadata_url}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {streamDetails[i] && (
                                            <div className="grid gap-3 xl:grid-cols-3">
                                                <div className="flex h-full flex-col rounded-lg border p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Stream status</p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                    {streamDetails[i].kind}
                                                                </Badge>
                                                                {streamDetails[i].codec && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].codec}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].lossless && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        Lossless
                                                                    </Badge>
                                                                )}
                                                                {typeof streamDetails[i].health_score === 'number' && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {Math.round(streamDetails[i].health_score * 100)}%
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {(streamDetails[i].lossless || streamDetails[i].codec.toUpperCase().includes('FLAC') || streamDetails[i].bit_depth > 0 || streamDetails[i].sample_rate_hz > 0 || streamDetails[i].channels > 0 || streamDetails[i].bitrate > 0) && (
                                                        <div className="mt-3 space-y-1">
                                                            <p className="text-xs text-muted-foreground">Audio details</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {streamDetails[i].bit_depth > 0 && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].bit_depth}-bit
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].sample_rate_hz > 0 && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].sample_rate_hz} Hz
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].channels > 0 && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].channels}ch
                                                                    </Badge>
                                                                )}
                                                                {(streamDetails[i].lossless || streamDetails[i].codec.toUpperCase().includes('FLAC') || streamDetails[i].bit_depth > 0 || streamDetails[i].sample_rate_hz > 0 || streamDetails[i].channels > 0) && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {formatSampleRateConfidenceLabel(streamDetails[i])}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].bitrate > 0 && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].bitrate} kbps
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Latest probe</p>
                                                        <p className="text-sm">
                                                            {streamDetails[i].last_error ? streamDetails[i].last_error : 'No stream errors recorded'}
                                                        </p>
                                                    </div>
                                                    <div className="mt-auto pt-4">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 w-full gap-1.5 px-2.5 text-xs"
                                                            disabled={probingAction === `${streamDetails[i].id}:quality`}
                                                            onClick={() => handleProbeStream(streamDetails[i].id, 'quality')}
                                                        >
                                                            {probingAction === `${streamDetails[i].id}:quality` ? (
                                                                <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <WaveformIcon className="h-4 w-4" weight="fill" />
                                                            )}
                                                            Refresh quality
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="flex h-full flex-col rounded-lg border p-3">
                                                    <div className="space-y-1">
                                                        <p className="text-xs text-muted-foreground">Metadata status</p>
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {stream.metadata_enabled ? 'Enabled' : 'Disabled'}
                                                            </Badge>
                                                            <Switch
                                                                checked={stream.metadata_enabled}
                                                                onCheckedChange={(checked) => setForm((prev) => ({
                                                                    ...prev,
                                                                    streams: prev.streams.map((s, idx) =>
                                                                        idx === i ? { ...s, metadata_enabled: !!checked } : s
                                                                    ),
                                                                }))}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 min-w-0">
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Metadata type</p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                {streamDetails[i].metadata_type && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].metadata_type}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].metadata_source && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].metadata_source}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].metadata_resolver && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].metadata_resolver}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].metadata_delayed ? (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        delayed metadata
                                                                    </Badge>
                                                                ) : null}
                                                                {streamDetails[i].metadata_error_code && (
                                                                    <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                        {streamDetails[i].metadata_error_code}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Metadata timing</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {streamDetails[i].metadata_delayed ? 'delayed' : 'normal'}
                                                            </Badge>
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {streamDetails[i].metadata_delayed ? METADATA_WAIT_SECONDS_DELAYED : METADATA_WAIT_SECONDS_NORMAL} seconds
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            Server-side ICY metadata budget.
                                                        </p>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Latest metadata check</p>
                                                        <p className="text-sm">
                                                            {streamDetails[i].metadata_error ? streamDetails[i].metadata_error : 'No metadata errors recorded'}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Refreshing metadata also recalculates the resolver for this stream.
                                                        </p>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Last checked</p>
                                                        <p className="text-sm">
                                                            {streamDetails[i].metadata_last_fetched_at
                                                                ? new Date(streamDetails[i].metadata_last_fetched_at!).toLocaleString()
                                                                : 'Not checked yet'}
                                                        </p>
                                                    </div>
                                                    <div className="mt-auto grid gap-2 pt-4">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 w-full gap-1.5 px-2.5 text-xs"
                                                            disabled={probingAction === `${streamDetails[i].id}:metadata`}
                                                            onClick={() => handleProbeStream(streamDetails[i].id, 'metadata')}
                                                        >
                                                            {probingAction === `${streamDetails[i].id}:metadata` ? (
                                                                <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <ArrowsClockwiseIcon className="h-4 w-4" weight="bold" />
                                                            )}
                                                            Refresh metadata
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="flex h-full flex-col rounded-lg border p-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-muted-foreground">Loudness status</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {formatLoudnessStatusLabel(streamDetails[i].loudness_measurement_status)}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Measured loudness</p>
                                                        {typeof streamDetails[i].loudness_integrated_lufs === 'number' ? (
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {(streamDetails[i].loudness_integrated_lufs ?? 0).toFixed(1)} LUFS
                                                            </Badge>
                                                        ) : (
                                                            <p className="text-sm">No loudness measurement recorded</p>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">True peak</p>
                                                        {typeof streamDetails[i].loudness_peak_dbfs === 'number' ? (
                                                            <Badge variant="secondary" className={ADMIN_TAG_BADGE_CLASS}>
                                                                {(streamDetails[i].loudness_peak_dbfs ?? 0).toFixed(1)} dBFS
                                                            </Badge>
                                                        ) : (
                                                            <p className="text-sm">Peak not measured</p>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Sample window</p>
                                                        <p className="text-sm">
                                                            {typeof streamDetails[i].loudness_sample_duration_seconds === 'number' && (streamDetails[i].loudness_sample_duration_seconds ?? 0) > 0
                                                                ? `${(streamDetails[i].loudness_sample_duration_seconds ?? 0).toFixed(1)} seconds`
                                                                : 'No sample duration recorded'}
                                                        </p>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Last measured</p>
                                                        <p className="text-sm">
                                                            {streamDetails[i].loudness_measured_at
                                                                ? new Date(streamDetails[i].loudness_measured_at ?? '').toLocaleString()
                                                                : 'Not measured yet'}
                                                        </p>
                                                    </div>
                                                    <div className="mt-auto pt-4">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 w-full gap-1.5 px-2.5 text-xs"
                                                            disabled={probingAction === `${streamDetails[i].id}:loudness`}
                                                            onClick={() => handleProbeStream(streamDetails[i].id, 'loudness')}
                                                        >
                                                            {probingAction === `${streamDetails[i].id}:loudness` ? (
                                                                <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <WaveformIcon className="h-4 w-4" weight="fill" />
                                                            )}
                                                            Measure loudness
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
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
                            Saving updates the stream list without probing. Use the refresh actions below each stream for quality, metadata, and loudness checks. Stream variants must use HTTPS so they stay playable on the HTTPS web app. The first entry is primary and determines the station&apos;s canonical stream URL.
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
                                    <Input id="logo" value={form.logo} onChange={(e) => setForm((prev) => ({ ...prev, logo: e.target.value }))} />
                                    {!hasValidLogoURL && <p className="text-xs text-destructive">Logo URL must be a valid absolute URL</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="website">Website URL</Label>
                                    <Input id="website" value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} />
                                    {!hasValidWebsiteURL && <p className="text-xs text-destructive">Website URL must be a valid absolute URL</p>}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="genre-tags">Genre tags</Label>
                                    <Input id="genre-tags" value={form.genre_tags} onChange={(e) => setForm((prev) => ({ ...prev, genre_tags: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="subgenre-tags">Subgenre tags</Label>
                                    <Input id="subgenre-tags" value={form.subgenre_tags} onChange={(e) => setForm((prev) => ({ ...prev, subgenre_tags: e.target.value }))} />
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
                                    <Label htmlFor="style-tags">Style tags (comma-separated)</Label>
                                    <Input id="style-tags" placeholder="e.g. curated, underground, editorial" value={form.style_tags} onChange={(e) => setForm((prev) => ({ ...prev, style_tags: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="format-tags">Format tags (comma-separated)</Label>
                                    <Input id="format-tags" placeholder="e.g. live, hosted, freeform" value={form.format_tags} onChange={(e) => setForm((prev) => ({ ...prev, format_tags: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="texture-tags">Texture tags (comma-separated)</Label>
                                    <Input id="texture-tags" placeholder="e.g. smooth, raw, minimal" value={form.texture_tags} onChange={(e) => setForm((prev) => ({ ...prev, texture_tags: e.target.value }))} />
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
