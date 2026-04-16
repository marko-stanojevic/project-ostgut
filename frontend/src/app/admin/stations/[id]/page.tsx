'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    XCircleIcon,
    ClockIcon,
    ArrowLeftIcon,
    FloppyDiskIcon,
    UploadSimpleIcon,
} from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface AdminStation {
    id: string
    name: string
    stream_url: string
    logo?: string
    website?: string
    genre: string
    language: string
    country: string
    country_code: string
    tags: string[]
    bitrate: number
    codec: string
    reliability_score: number
    featured: boolean
    status: string
    editor_notes?: string
}

interface StationForm {
    name: string
    stream_url: string
    logo: string
    website: string
    genre: string
    language: string
    country: string
    country_code: string
    tags: string
    bitrate: string
    codec: string
    reliability_score: string
    status: 'pending' | 'approved' | 'rejected'
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
    rejected: { label: 'Rejected', icon: XCircleIcon, className: 'text-destructive' },
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
        stream_url: '',
        logo: '',
        website: '',
        genre: '',
        language: '',
        country: '',
        country_code: '',
        tags: '',
        bitrate: '',
        codec: '',
        reliability_score: '',
        status: 'pending',
        featured: false,
        editor_notes: '',
    })

    const accessToken = session?.accessToken

    const trimmedName = form.name.trim()
    const streamURL = form.stream_url.trim()
    const logoURL = form.logo.trim()
    const websiteURL = form.website.trim()
    const bitrateNum = form.bitrate.trim() === '' ? 0 : Number(form.bitrate)
    const reliabilityNum = form.reliability_score.trim() === '' ? 0 : Number(form.reliability_score)

    const hasValidName = trimmedName.length > 0
    const hasValidStreamURL = isValidAbsoluteURL(streamURL)
    const hasValidLogoURL = logoURL === '' || isValidAbsoluteURL(logoURL)
    const hasValidWebsiteURL = websiteURL === '' || isValidAbsoluteURL(websiteURL)
    const hasValidBitrate = Number.isFinite(bitrateNum) && bitrateNum >= 0
    const hasValidReliability = Number.isFinite(reliabilityNum) && reliabilityNum >= 0 && reliabilityNum <= 1
    const canSave = hasValidName && hasValidStreamURL && hasValidLogoURL && hasValidWebsiteURL && hasValidBitrate && hasValidReliability

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
                    stream_url: s.stream_url,
                    logo: s.logo ?? '',
                    website: s.website ?? '',
                    genre: s.genre,
                    language: s.language,
                    country: s.country,
                    country_code: s.country_code,
                    tags: (s.tags ?? []).join(', '),
                    bitrate: String(s.bitrate ?? 0),
                    codec: s.codec ?? '',
                    reliability_score: String(s.reliability_score ?? 0),
                    status: (s.status as StationForm['status']) || 'pending',
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
            stream_url: streamURL,
            logo: logoURL,
            website: websiteURL,
            genre: form.genre.trim(),
            language: form.language.trim(),
            country: form.country.trim(),
            country_code: form.country_code.trim().toUpperCase(),
            tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
            bitrate: bitrateNum,
            codec: form.codec.trim(),
            reliability_score: reliabilityNum,
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
            setForm({
                name: updated.name,
                stream_url: updated.stream_url,
                logo: updated.logo ?? '',
                website: updated.website ?? '',
                genre: updated.genre,
                language: updated.language,
                country: updated.country,
                country_code: updated.country_code,
                tags: (updated.tags ?? []).join(', '),
                bitrate: String(updated.bitrate ?? 0),
                codec: updated.codec ?? '',
                reliability_score: String(updated.reliability_score ?? 0),
                status: (updated.status as StationForm['status']) || 'pending',
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
    const currentTags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
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
                            {form.featured && <Badge variant="outline" className="text-xs">Staff Pick</Badge>}
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
                                <p className="text-xs text-muted-foreground">{form.genre || '-'} · {form.country || '-'}</p>
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-3">
                            <SourceField label="Genre" value={form.genre} />
                            <SourceField label="Language" value={form.language} />
                            <SourceField label="Country" value={form.country} />
                            <SourceField label="Country Code" value={form.country_code.toUpperCase()} />
                            <SourceField label="Bitrate" value={hasValidBitrate ? `${bitrateNum} kbps` : undefined} />
                            <SourceField label="Codec" value={form.codec} />
                        </div>

                        <Separator />

                        <SourceField label="Stream URL" value={streamURL} />
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
                                    variant="outline"
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

                        {currentTags.length > 0 && (
                            <div>
                                <p className="mb-1.5 text-xs text-muted-foreground">Tags</p>
                                <div className="flex flex-wrap gap-1">
                                    {currentTags.map((t) => (
                                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
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

                        {streamURL && (
                            <a
                                href={streamURL}
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
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={(v) => v && setForm((prev) => ({ ...prev, status: v as StationForm['status'] }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
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

                            <div className="space-y-1.5">
                                <Label htmlFor="stream-url">Stream URL</Label>
                                <Input id="stream-url" value={form.stream_url} onChange={(e) => setForm((prev) => ({ ...prev, stream_url: e.target.value }))} />
                                {!hasValidStreamURL && <p className="text-xs text-destructive">Stream URL must be a valid absolute URL</p>}
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
                                    <Label htmlFor="country-code">Country Code</Label>
                                    <Input id="country-code" value={form.country_code} onChange={(e) => setForm((prev) => ({ ...prev, country_code: e.target.value.toUpperCase() }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="bitrate">Bitrate (kbps)</Label>
                                    <Input id="bitrate" type="number" min={0} value={form.bitrate} onChange={(e) => setForm((prev) => ({ ...prev, bitrate: e.target.value }))} />
                                    {!hasValidBitrate && <p className="text-xs text-destructive">Bitrate must be zero or greater</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="codec">Codec</Label>
                                    <Input id="codec" value={form.codec} onChange={(e) => setForm((prev) => ({ ...prev, codec: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                                    <Input id="tags" value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="reliability">Reliability score (0-1)</Label>
                                    <Input id="reliability" type="number" min={0} max={1} step="0.01" value={form.reliability_score} onChange={(e) => setForm((prev) => ({ ...prev, reliability_score: e.target.value }))} />
                                    {!hasValidReliability && <p className="text-xs text-destructive">Reliability score must be between 0 and 1</p>}
                                </div>
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
