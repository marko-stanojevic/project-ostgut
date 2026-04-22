'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
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
    ArrowSquareOutIcon,
    CheckCircleIcon,
    ClockIcon,
    ArrowLeftIcon,
    FloppyDiskIcon,
    UploadSimpleIcon,
    PlusIcon,
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
    metadata_enabled: boolean
    metadata_type: string
    metadata_source?: string
    metadata_error?: string
    metadata_error_code?: string
    metadata_last_fetched_at?: string
    health_score: number
    last_checked_at?: string
    last_error?: string
}

interface AdminStation {
    id: string
    name: string
    stream_url: string
    streams?: AdminStream[]
    logo?: string
    website?: string
    genres: string[]
    language: string
    country: string
    city: string
    country_code: string
    tags: string[]
    style_tags: string[]
    format_tags: string[]
    texture_tags: string[]
    reliability_score: number
    featured: boolean
    status: string
    overview?: string
    editor_notes?: string
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
    genre: string
    language: string
    country: string
    city: string
    country_code: string
    style_tags: string
    format_tags: string
    texture_tags: string
    reliability_score: string
    overview: string
    status: 'pending' | 'approved'
    featured: boolean
    editor_notes: string
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

const statusConfig = {
    pending: { label: 'Pending', icon: ClockIcon, className: 'text-yellow-600 dark:text-yellow-400' },
    approved: { label: 'Approved', icon: CheckCircleIcon, className: 'text-green-600 dark:text-green-400' },
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
            : [{ ...createEmptyStream(1), url: station.stream_url }],
        logo: station.logo ?? '',
        website: station.website ?? '',
        genre: (station.genres ?? []).join(', '),
        language: station.language,
        country: station.country,
        city: station.city ?? '',
        country_code: station.country_code,
        style_tags: (station.style_tags ?? []).join(', '),
        format_tags: (station.format_tags ?? []).join(', '),
        texture_tags: (station.texture_tags ?? []).join(', '),
        reliability_score: String(station.reliability_score ?? 0),
        overview: station.overview ?? '',
        status: station.status === 'approved' ? 'approved' : 'pending',
        featured: !!station.featured,
        editor_notes: station.editor_notes ?? '',
    }
}

export default function StationEditorPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const { session } = useAuth()
    const iconInputRef = useRef<HTMLInputElement | null>(null)

    const [station, setStation] = useState<AdminStation | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [stationIcon, setStationIcon] = useState<MediaAssetResponse | null>(null)
    const [uploadingIcon, setUploadingIcon] = useState(false)
    const [iconError, setIconError] = useState('')

    const [form, setForm] = useState<StationForm>({
        name: '',
        streams: [createEmptyStream(1)],
        logo: '',
        website: '',
        genre: '',
        language: '',
        country: '',
        city: '',
        country_code: '',
        style_tags: '',
        format_tags: '',
        texture_tags: '',
        reliability_score: '',
        overview: '',
        status: 'pending',
        featured: false,
        editor_notes: '',
    })

    const accessToken = session?.accessToken

    const trimmedName = form.name.trim()
    // Primary display URL — first non-empty stream entry.
    const primaryStreamURL = form.streams.find(s => s.url.trim())?.url.trim() ?? ''
    const logoURL = form.logo.trim()
    const websiteURL = form.website.trim()
    const reliabilityNum = form.reliability_score.trim() === '' ? 0 : Number(form.reliability_score)
    const streamValidationMessages = form.streams.map((s) => getStreamURLValidationMessage(s.url))
    const hasAtLeastOneStreamURL = form.streams.some((s) => s.url.trim() !== '')

    const hasValidName = trimmedName.length > 0
    const hasValidStreams = form.streams.length > 0 &&
        streamValidationMessages.every((msg) => msg === '') &&
        hasAtLeastOneStreamURL
    const hasValidLogoURL = logoURL === '' || isValidAbsoluteURL(logoURL)
    const hasValidWebsiteURL = websiteURL === '' || isValidAbsoluteURL(websiteURL)
    const hasValidReliability = Number.isFinite(reliabilityNum) && reliabilityNum >= 0 && reliabilityNum <= 1
    const canSave = hasValidName && hasValidStreams && hasValidLogoURL && hasValidWebsiteURL && hasValidReliability

    useEffect(() => {
        if (!accessToken) return
        let cancelled = false

        const loadStation = async () => {
            setLoading(true)
            setError('')

            try {
                const s = await fetchJSONWithAuth<AdminStation>(
                    `${API}/admin/stations/${id}`,
                    accessToken,
                )
                if (cancelled) return

                setStation(s)
                setForm(toStationForm(s))

                try {
                    const icon = await fetchJSONWithAuth<MediaAssetResponse>(
                        `${API}/admin/stations/${id}/icon`,
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
                        metadata_type: 'auto',
                    }
                }),
            logo: logoURL,
            website: websiteURL,
            genres: form.genre.split(',').map((g) => g.trim()).filter(Boolean),
            language: form.language.trim(),
            country: form.country.trim(),
            city: form.city.trim(),
            country_code: form.country_code.trim().toUpperCase(),
            style_tags: form.style_tags.split(',').map((t) => t.trim()).filter(Boolean),
            format_tags: form.format_tags.split(',').map((t) => t.trim()).filter(Boolean),
            texture_tags: form.texture_tags.split(',').map((t) => t.trim()).filter(Boolean),
            reliability_score: reliabilityNum,
            overview: form.overview.trim() || null,
            status: form.status,
            featured: form.featured,
            editor_notes: form.editor_notes.trim() || null,
        }

        try {
            const updated = await fetchJSONWithAuth<AdminStation>(`${API}/admin/stations/${id}`, accessToken, {
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

    const cfg = statusConfig[form.status as keyof typeof statusConfig]
    const reliabilityPct = Math.round((Number(form.reliability_score || 0) || 0) * 100)
    const currentStyleTags = form.style_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentFormatTags = form.format_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentTextureTags = form.texture_tags.split(',').map((t) => t.trim()).filter(Boolean)
    const currentGenreTags = form.genre.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean)
    const allCurrentTags = [...new Set([...currentGenreTags, ...currentStyleTags, ...currentFormatTags, ...currentTextureTags])]
    const iconUrl = getPreferredMediaUrl(stationIcon) || logoURL
    const streamDetails = [...(station.streams ?? [])].sort((a, b) => a.priority - b.priority)

    return (
        <div className="max-w-6xl space-y-6">
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
                        <div className="mt-1 flex items-center gap-2">
                            {cfg && (
                                <span className={`flex items-center gap-1 text-xs font-medium ${cfg.className}`}>
                                    <cfg.icon className="h-3.5 w-3.5" />
                                    {cfg.label}
                                </span>
                            )}
                            {form.featured && <Badge variant="default" className="text-xs">Staff Pick</Badge>}
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {saved && <p className="text-sm text-green-600 dark:text-green-400">Saved</p>}
                    <Button onClick={handleSave} disabled={saving || !canSave} className="gap-2">
                        <FloppyDiskIcon className="h-4 w-4" />
                        {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                Station Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                                    {iconUrl ? (
                                        <Image src={iconUrl} alt="" fill className="object-cover" unoptimized />
                                    ) : (
                                        <RadioIcon className="h-5 w-5 text-muted-foreground" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">{trimmedName || '-'}</p>
                                    <p className="text-xs text-muted-foreground">{form.genre || '-'} · {[form.city, form.country].filter(Boolean).join(', ') || '-'}</p>
                                </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-3">
                                <SourceField label="Genre" value={form.genre} />
                                <SourceField label="Language" value={form.language} />
                                <SourceField label="Country" value={form.country} />
                                <SourceField label="City" value={form.city} />
                                <SourceField label="Country Code" value={form.country_code.toUpperCase()} />
                            </div>

                            <Separator />

                            <SourceField label="Primary Stream" value={primaryStreamURL} />
                            <SourceField label="Website" value={websiteURL} />

                            <Separator />

                            <div>
                                <p className="mb-1.5 text-xs text-muted-foreground">Station icon</p>
                                <div className="flex items-center gap-3">
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
                                        variant="default"
                                        className="gap-2"
                                        onClick={() => iconInputRef.current?.click()}
                                        disabled={uploadingIcon}
                                    >
                                        <UploadSimpleIcon className="h-4 w-4" />
                                        {uploadingIcon ? 'Uploading…' : 'Upload icon'}
                                    </Button>
                                    <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 10 MB.</p>
                                </div>
                                {iconError && <p className="mt-2 text-xs text-destructive">{iconError}</p>}
                            </div>

                            {allCurrentTags.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-xs text-muted-foreground">Tags</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {currentGenreTags.map((t) => (
                                            <Badge key={`genre-${t}`} variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentStyleTags.map((t) => (
                                            <Badge key={`style-${t}`} variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentFormatTags.map((t) => (
                                            <Badge key={`format-${t}`} variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                {t}
                                            </Badge>
                                        ))}
                                        {currentTextureTags.map((t) => (
                                            <Badge key={`texture-${t}`} variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                {t}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Separator />

                            <div>
                                <p className="mb-1.5 text-xs text-muted-foreground">Reliability score</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={`h-full rounded-full ${reliabilityPct >= 70 ? 'bg-green-500' : reliabilityPct >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                            style={{ width: `${reliabilityPct}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-medium tabular-nums">{reliabilityPct}%</span>
                                </div>
                            </div>

                            {primaryStreamURL && (
                                <a
                                    href={primaryStreamURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                                    Open stream
                                </a>
                            )}
                            {websiteURL && (
                                <a
                                    href={websiteURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                                    Open website
                                </a>
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
                                            <div className="grid gap-3 lg:grid-cols-2">
                                                <div className="rounded-lg border p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Stream status</p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                    {streamDetails[i].kind}
                                                                </Badge>
                                                                {streamDetails[i].codec && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].codec}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].lossless && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        Lossless
                                                                    </Badge>
                                                                )}
                                                                {typeof streamDetails[i].health_score === 'number' && (
                                                                    <span className={`text-xs font-medium tabular-nums ${streamDetails[i].health_score >= 0.7 ? 'text-green-600 dark:text-green-400' : streamDetails[i].health_score >= 0.4 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500'}`}>
                                                                        {Math.round(streamDetails[i].health_score * 100)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {(streamDetails[i].lossless || streamDetails[i].codec.toUpperCase().includes('FLAC') || streamDetails[i].bit_depth > 0 || streamDetails[i].sample_rate_hz > 0 || streamDetails[i].channels > 0 || streamDetails[i].bitrate > 0) && (
                                                        <div className="mt-3 space-y-1">
                                                            <p className="text-xs text-muted-foreground">Audio details</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {streamDetails[i].bit_depth > 0 && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].bit_depth}-bit
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].sample_rate_hz > 0 && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].sample_rate_hz} Hz
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].channels > 0 && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].channels}ch
                                                                    </Badge>
                                                                )}
                                                                {(streamDetails[i].lossless || streamDetails[i].codec.toUpperCase().includes('FLAC') || streamDetails[i].bit_depth > 0 || streamDetails[i].sample_rate_hz > 0 || streamDetails[i].channels > 0) && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {formatSampleRateConfidenceLabel(streamDetails[i])}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].bitrate > 0 && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
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
                                                </div>

                                                <div className="rounded-lg border p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-muted-foreground">Metadata status</p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                    {streamDetails[i].metadata_enabled ? (streamDetails[i].metadata_type || 'auto') : 'disabled'}
                                                                </Badge>
                                                                {streamDetails[i].metadata_source && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].metadata_source}
                                                                    </Badge>
                                                                )}
                                                                {streamDetails[i].metadata_error_code && (
                                                                    <Badge variant="secondary" className="rounded-none border-brand bg-brand font-medium text-black text-[10px] uppercase tracking-wide">
                                                                        {streamDetails[i].metadata_error_code}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
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
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Metadata polling</p>
                                                        <p className="text-sm">
                                                            {stream.metadata_enabled ? 'Enabled with auto-detection' : 'Disabled'}
                                                        </p>
                                                    </div>
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-muted-foreground">Latest metadata check</p>
                                                        <p className="text-sm">
                                                            {streamDetails[i].metadata_error ? streamDetails[i].metadata_error : 'No metadata errors recorded'}
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
                            URLs are probed on save. Stream variants must use HTTPS so they stay playable on the HTTPS web app. The first entry is primary and determines the station&apos;s canonical stream URL.
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
                                    <Label htmlFor="genre">Genre</Label>
                                    <Input id="genre" value={form.genre} onChange={(e) => setForm((prev) => ({ ...prev, genre: e.target.value }))} />
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
                                <div className="space-y-1.5">
                                    <Label htmlFor="country-code">Country Code</Label>
                                    <Input id="country-code" value={form.country_code} onChange={(e) => setForm((prev) => ({ ...prev, country_code: e.target.value.toUpperCase() }))} />
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
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="reliability">Reliability score (0-1)</Label>
                                    <Input id="reliability" type="number" min={0} max={1} step="0.01" value={form.reliability_score} onChange={(e) => setForm((prev) => ({ ...prev, reliability_score: e.target.value }))} />
                                    {!hasValidReliability && <p className="text-xs text-destructive">Reliability score must be between 0 and 1</p>}
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
                                <Label htmlFor="editor-notes">Editor Notes</Label>
                                <Textarea
                                    id="editor-notes"
                                    placeholder="Editorial notes shown publicly in station details"
                                    value={form.editor_notes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, editor_notes: e.target.value }))}
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
