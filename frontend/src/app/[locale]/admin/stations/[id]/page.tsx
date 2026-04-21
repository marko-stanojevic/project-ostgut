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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
    metadata_enabled: boolean
    metadata_type: 'auto' | 'icy' | 'icecast' | 'shoutcast'
    metadata_error?: string
    metadata_error_code?: string
    metadata_last_fetched_at?: string
    overview?: string
    editor_notes?: string
}

interface StreamFormEntry {
    url: string
    priority: number
    bitrate: string
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
    metadata_enabled: boolean
    metadata_type: 'auto' | 'icy' | 'icecast' | 'shoutcast'
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

function formatStreamAudioDetails(stream: AdminStream): string {
    const bitDepth = stream.bit_depth > 0 ? `${stream.bit_depth}-bit` : '-bit'
    const sampleRate = stream.sample_rate_hz > 0 ? `${stream.sample_rate_hz} Hz` : '- Hz'
    const channels = stream.channels > 0 ? `${stream.channels}ch` : '-ch'
    return `${bitDepth} / ${sampleRate} / ${channels}`
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
        streams: [{ url: '', priority: 1, bitrate: '' }],
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
        metadata_enabled: true,
        metadata_type: 'auto',
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

    const hasValidName = trimmedName.length > 0
    const hasValidStreams = form.streams.length > 0 &&
        form.streams.every(s => s.url.trim() === '' || isValidAbsoluteURL(s.url.trim())) &&
        form.streams.some(s => isValidAbsoluteURL(s.url.trim()))
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
                setForm({
                    name: s.name,
                    streams: s.streams && s.streams.length > 0
                        ? [...s.streams].sort((a, b) => a.priority - b.priority).map((st, i) => ({ url: st.url, priority: st.priority || i + 1, bitrate: st.bitrate > 0 ? String(st.bitrate) : '' }))
                        : [{ url: s.stream_url, priority: 1, bitrate: '' }],
                    logo: s.logo ?? '',
                    website: s.website ?? '',
                    genre: (s.genres ?? []).join(', '),
                    language: s.language,
                    country: s.country,
                    city: s.city ?? '',
                    country_code: s.country_code,
                    style_tags: (s.style_tags ?? []).join(', '),
                    format_tags: (s.format_tags ?? []).join(', '),
                    texture_tags: (s.texture_tags ?? []).join(', '),
                    reliability_score: String(s.reliability_score ?? 0),
                    overview: s.overview ?? '',
                    status: s.status === 'approved' ? 'approved' : 'pending',
                    metadata_enabled: s.metadata_enabled ?? true,
                    metadata_type: (s.metadata_type as StationForm['metadata_type']) || 'auto',
                    featured: !!s.featured,
                    editor_notes: s.editor_notes ?? '',
                })

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
            metadata_enabled: form.metadata_enabled,
            metadata_type: form.metadata_type,
            featured: form.featured,
            editor_notes: form.editor_notes.trim() || null,
        }

        try {
            const updated = await fetchJSONWithAuth<AdminStation>(`${API}/admin/stations/${id}`, accessToken, {
                method: 'PUT',
                body: JSON.stringify(body),
            })

            setStation(updated)
            setForm({
                name: updated.name,
                streams: updated.streams && updated.streams.length > 0
                    ? [...updated.streams].sort((a, b) => a.priority - b.priority).map((st, i) => ({ url: st.url, priority: st.priority || i + 1, bitrate: st.bitrate > 0 ? String(st.bitrate) : '' }))
                    : [{ url: updated.stream_url, priority: 1, bitrate: '' }],
                logo: updated.logo ?? '',
                website: updated.website ?? '',
                genre: (updated.genres ?? []).join(', '),
                language: updated.language,
                country: updated.country,
                city: updated.city ?? '',
                country_code: updated.country_code,
                style_tags: (updated.style_tags ?? []).join(', '),
                format_tags: (updated.format_tags ?? []).join(', '),
                texture_tags: (updated.texture_tags ?? []).join(', '),
                reliability_score: String(updated.reliability_score ?? 0),
                overview: updated.overview ?? '',
                status: updated.status === 'approved' ? 'approved' : 'pending',
                metadata_enabled: updated.metadata_enabled ?? true,
                metadata_type: (updated.metadata_type as StationForm['metadata_type']) || 'auto',
                featured: !!updated.featured,
                editor_notes: updated.editor_notes ?? '',
            })
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

                        <SourceField label="Stream URL" value={primaryStreamURL} />
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
                                <div className="flex flex-wrap gap-1">
                                    {currentGenreTags.map((t) => (
                                        <Badge key={`genre-${t}`} variant="default" className="text-xs">{t}</Badge>
                                    ))}
                                    {currentStyleTags.map((t) => (
                                        <Badge key={`style-${t}`} variant="default" className="text-xs">{t}</Badge>
                                    ))}
                                    {currentFormatTags.map((t) => (
                                        <Badge key={`format-${t}`} variant="default" className="text-xs">{t}</Badge>
                                    ))}
                                    {currentTextureTags.map((t) => (
                                        <Badge key={`texture-${t}`} className="text-xs">{t}</Badge>
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

                            <Separator />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between rounded-lg border p-3">
                                    <div>
                                        <p className="text-sm font-medium">Metadata polling</p>
                                        <p className="text-xs text-muted-foreground">Disable for streams that do not expose now-playing metadata</p>
                                    </div>
                                    <Switch
                                        checked={form.metadata_enabled}
                                        onCheckedChange={(checked) => setForm((prev) => ({ ...prev, metadata_enabled: !!checked }))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Metadata type</Label>
                                    <Select
                                        value={form.metadata_type}
                                        onValueChange={(v) => v && setForm((prev) => ({ ...prev, metadata_type: v as StationForm['metadata_type'] }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">Auto-detect</SelectItem>
                                            <SelectItem value="icy">ICY (in-stream)</SelectItem>
                                            <SelectItem value="icecast">Icecast status-json</SelectItem>
                                            <SelectItem value="shoutcast">Shoutcast endpoints</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">When set to a provider, only that strategy is used.</p>
                                </div>

                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Latest metadata error</p>
                                    {station.metadata_error_code && (
                                        <Badge variant="default" className="mt-2 text-[10px] uppercase tracking-wide">
                                            {station.metadata_error_code}
                                        </Badge>
                                    )}
                                    <p className="mt-1 text-sm">
                                        {station.metadata_error ? station.metadata_error : 'No metadata errors recorded'}
                                    </p>
                                    {station.metadata_last_fetched_at && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Last checked: {new Date(station.metadata_last_fetched_at).toLocaleString()}
                                        </p>
                                    )}
                                </div>
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

                            <div className="space-y-1.5">
                                <Label>Stream URLs</Label>
                                <div className="space-y-2">
                                    {form.streams.map((stream, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
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
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="mt-1 gap-1.5"
                                    onClick={() => setForm((prev) => ({
                                        ...prev,
                                        streams: [...prev.streams, { url: '', priority: prev.streams.length + 1, bitrate: '' }],
                                    }))}
                                >
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    Add stream URL
                                </Button>
                                {!hasValidStreams && (
                                    <p className="text-xs text-destructive">At least one valid absolute URL is required</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    URLs are probed on save. The first entry is primary and determines the station&apos;s canonical stream URL.
                                </p>
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

                    {station.streams && station.streams.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                    Stream Variants
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {station.streams
                                    .slice()
                                    .sort((a, b) => a.priority - b.priority)
                                    .map((stream, i) => (
                                        <div key={stream.id || i} className={`rounded-lg border p-3 ${!stream.is_active ? 'opacity-50' : ''}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-muted-foreground">#{stream.priority}</span>
                                                    <Badge variant={stream.is_active ? 'default' : 'outline'} className="text-[10px] uppercase tracking-wide">
                                                        {stream.kind}
                                                    </Badge>
                                                    {stream.codec && (
                                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                                            {stream.codec}
                                                        </Badge>
                                                    )}
                                                    {stream.lossless && (
                                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                                            Lossless
                                                        </Badge>
                                                    )}
                                                    {(stream.lossless || stream.codec.toUpperCase().includes('FLAC') || stream.bit_depth > 0 || stream.sample_rate_hz > 0 || stream.channels > 0) && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatStreamAudioDetails(stream)} · {formatSampleRateConfidenceLabel(stream)}
                                                        </span>
                                                    )}
                                                    {stream.bitrate > 0 && (
                                                        <span className="text-xs text-muted-foreground">{stream.bitrate} kbps</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {typeof stream.health_score === 'number' && (
                                                        <span className={`text-xs font-medium tabular-nums ${stream.health_score >= 0.7 ? 'text-green-600 dark:text-green-400' : stream.health_score >= 0.4 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500'}`}>
                                                            {Math.round(stream.health_score * 100)}%
                                                        </span>
                                                    )}
                                                    <a
                                                        href={stream.resolved_url || stream.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-muted-foreground transition-colors hover:text-foreground"
                                                    >
                                                        <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                                                    </a>
                                                </div>
                                            </div>
                                            <p className="mt-1.5 break-all font-mono text-[11px] text-muted-foreground">
                                                {stream.resolved_url || stream.url}
                                            </p>
                                            {stream.resolved_url && stream.resolved_url !== stream.url && (
                                                <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground/50">
                                                    via {stream.url}
                                                </p>
                                            )}
                                            {stream.last_error && (
                                                <p className="mt-1 text-xs text-destructive">{stream.last_error}</p>
                                            )}
                                        </div>
                                    ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
