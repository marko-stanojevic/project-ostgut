'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
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
import { Radio, ArrowSquareOut, CheckCircle, XCircle, Clock, ArrowLeft, FloppyDisk } from '@phosphor-icons/react'

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
  custom_logo?: string
  custom_website?: string
  custom_description?: string
  editor_notes?: string
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, className: 'text-yellow-600 dark:text-yellow-400' },
  approved: { label: 'Approved', icon: CheckCircle, className: 'text-green-600 dark:text-green-400' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'text-destructive' },
}

function SourceField({ label, value }: { label: string; value?: string }) {
  if (!value) return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-muted-foreground/50 italic mt-0.5">—</p>
    </div>
  )
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5 break-all">{value}</p>
    </div>
  )
}

export default function StationEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { session } = useAuth()

  const [station, setStation] = useState<AdminStation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Editable fields
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState('pending')
  const [featured, setFeatured] = useState(false)
  const [customLogo, setCustomLogo] = useState('')
  const [customWebsite, setCustomWebsite] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [editorNotes, setEditorNotes] = useState('')
  const accessToken = session?.accessToken
  const trimmedDisplayName = displayName.trim()
  const hasValidDisplayName = trimmedDisplayName.length > 0

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
        setDisplayName(s.name)
        setStatus(s.status)
        setFeatured(s.featured)
        setCustomLogo(s.custom_logo ?? '')
        setCustomWebsite(s.custom_website ?? '')
        setCustomDescription(s.custom_description ?? '')
        setEditorNotes(s.editor_notes ?? '')
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

  const handleSave = async () => {
    if (!accessToken) return
    if (!hasValidDisplayName) {
      setError('Display name cannot be empty')
      return
    }

    setSaving(true)
    setError('')
    setSaved(false)

    const body: Record<string, unknown> = {
      name: trimmedDisplayName,
      status,
      featured,
      custom_logo: customLogo || null,
      custom_website: customWebsite || null,
      custom_description: customDescription || null,
      editor_notes: editorNotes || null,
    }

    try {
      const updated = await fetchJSONWithAuth<AdminStation>(`${API}/admin/stations/${id}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      setStation(updated)
      setDisplayName(updated.name)
      setStatus(updated.status)
      setFeatured(updated.featured)
      setCustomLogo(updated.custom_logo ?? '')
      setCustomWebsite(updated.custom_website ?? '')
      setCustomDescription(updated.custom_description ?? '')
      setEditorNotes(updated.editor_notes ?? '')
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
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!station) {
    return <p className="text-destructive">Station not found</p>
  }

  const cfg = statusConfig[status as keyof typeof statusConfig]
  const reliabilityPct = Math.round(station.reliability_score * 100)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.back()}
            className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{trimmedDisplayName || station.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {cfg && (
                <span className={`flex items-center gap-1 text-xs font-medium ${cfg.className}`}>
                  <cfg.icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </span>
              )}
              {featured && <Badge variant="outline" className="text-xs">Staff Pick</Badge>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-green-600 dark:text-green-400">Saved</p>}
          <Button onClick={handleSave} disabled={saving || !hasValidDisplayName} className="gap-2">
            <FloppyDisk className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Radio Browser source data (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
              Source Data (Radio Browser)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Favicon preview */}
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {station.logo ? (
                  <Image src={station.logo} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <Radio className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{station.name}</p>
                <p className="text-xs text-muted-foreground">{station.genre} · {station.country}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <SourceField label="Genre" value={station.genre} />
              <SourceField label="Language" value={station.language} />
              <SourceField label="Country" value={station.country} />
              <SourceField label="Country Code" value={station.country_code} />
              <SourceField label="Bitrate" value={station.bitrate ? `${station.bitrate} kbps` : undefined} />
              <SourceField label="Codec" value={station.codec} />
            </div>

            <Separator />

            <SourceField label="Stream URL" value={station.stream_url} />
            <SourceField label="Homepage" value={station.website} />

            {station.tags?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {station.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Reliability score</p>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${reliabilityPct >= 70 ? 'bg-green-500' : reliabilityPct >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                      }`}
                    style={{ width: `${reliabilityPct}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums">{reliabilityPct}%</span>
              </div>
            </div>

            {station.stream_url && (
              <a
                href={station.stream_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowSquareOut className="h-3.5 w-3.5" />
                Open stream
              </a>
            )}
          </CardContent>
        </Card>

        {/* Right: Editorial overrides */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                Moderation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
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
                  <p className="text-xs text-muted-foreground">Appears in the Staff Picks feed and can be prioritized in discovery</p>
                </div>
                <Switch checked={featured} onCheckedChange={setFeatured} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                Editorial Enrichment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Station display name"
                />
                {!hasValidDisplayName ? (
                  <p className="text-xs text-destructive">Display name cannot be empty</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Shown publicly to listeners</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-logo">Custom Logo URL</Label>
                <Input
                  id="custom-logo"
                  placeholder="https://… (overrides Radio Browser favicon)"
                  value={customLogo}
                  onChange={(e) => setCustomLogo(e.target.value)}
                />
                {customLogo && (
                  <div className="relative h-8 w-8 rounded overflow-hidden bg-muted">
                    <Image src={customLogo} alt="" fill className="object-cover" unoptimized />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-website">Custom Website URL</Label>
                <Input
                  id="custom-website"
                  placeholder="https://… (overrides Radio Browser homepage)"
                  value={customWebsite}
                  onChange={(e) => setCustomWebsite(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-description">Description</Label>
                <Textarea
                  id="custom-description"
                  placeholder="A short editorial description shown to listeners…"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Shown publicly to listeners</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editor-notes">Editor Notes</Label>
                <Textarea
                  id="editor-notes"
                  placeholder="Internal notes — stream reliability, curation rationale…"
                  value={editorNotes}
                  onChange={(e) => setEditorNotes(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Also shown publicly to listeners</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
