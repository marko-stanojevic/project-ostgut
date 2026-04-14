'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Globe, Pause, Play, Radio } from '@phosphor-icons/react'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface ApiStationDetail {
    id: string
    name: string
    stream_url: string
    logo?: string
    website?: string
    description?: string
    editor_notes?: string
    genre: string
    language: string
    country: string
    country_code: string
    tags: string[]
    bitrate: number
    codec: string
    reliability_score: number
    featured: boolean
}

function toStation(s: ApiStationDetail): Station {
    return {
        id: s.id,
        name: s.name,
        streamUrl: s.stream_url,
        favicon: s.logo,
        genre: s.genre,
        country: s.country,
        countryCode: s.country_code,
        bitrate: s.bitrate,
        codec: s.codec,
    }
}

export default function StationDetailsPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const id = typeof params.id === 'string' ? params.id : ''

    const { station: activeStation, state, play, pause } = usePlayer()

    const [station, setStation] = useState<ApiStationDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const handleBack = () => {
        const from = searchParams.get('from')
        const saved = typeof window !== 'undefined' ? sessionStorage.getItem('stations:list:return') : null
        const target = (from || saved || '/stations').startsWith('/stations')
            ? (from || saved || '/stations')
            : '/stations'
        router.push(target)
    }

    useEffect(() => {
        if (!id) return

        setLoading(true)
        setError(null)

        fetch(`${API}/stations/${id}`)
            .then(async (r) => {
                if (!r.ok) {
                    throw new Error(r.status === 404 ? 'Station not found.' : 'Unable to load station.')
                }
                return r.json()
            })
            .then((data: ApiStationDetail) => setStation(data))
            .catch((e: unknown) => {
                const message = e instanceof Error ? e.message : 'Unable to load station.'
                setError(message)
                setStation(null)
            })
            .finally(() => setLoading(false))
    }, [id])

    const isActive = Boolean(station && activeStation?.id === station.id)
    const isPlaying = isActive && state === 'playing'

    const stats = useMemo(() => {
        if (!station) return []
        return [
            { label: 'Country', value: station.country || 'Unknown' },
            { label: 'Country code', value: station.country_code || '—' },
            { label: 'Language', value: station.language || '—' },
            { label: 'Genre', value: station.genre || '—' },
            { label: 'Codec', value: station.codec || '—' },
            { label: 'Bitrate', value: station.bitrate ? `${station.bitrate} kbps` : '—' },
            {
                label: 'Reliability',
                value: typeof station.reliability_score === 'number'
                    ? `${Math.round(station.reliability_score * 100)}%`
                    : '—',
            },
            { label: 'Featured', value: station.featured ? 'Yes' : 'No' },
        ]
    }, [station])

    return (
        <div className="mx-auto w-full max-w-7xl">
            <button
                type="button"
                onClick={handleBack}
                className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-5"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to stations
            </button>

            {loading ? (
                <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(240px,320px)_1fr]">
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <div className="space-y-3">
                        <Skeleton className="h-9 w-3/5" />
                        <Skeleton className="h-4 w-2/5" />
                        <Skeleton className="h-11 w-40" />
                        <Skeleton className="h-28 w-full" />
                    </div>
                </div>
            ) : error ? (
                <div className="rounded-xl border border-border/60 bg-card/60 p-6">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            ) : station ? (
                <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(240px,320px)_1fr]">
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                        {station.logo ? (
                            <Image
                                src={station.logo}
                                alt={station.name}
                                fill
                                priority
                                sizes="(max-width: 1024px) 100vw, 320px"
                                className="object-cover"
                                unoptimized
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <Radio className="h-12 w-12 text-muted-foreground" />
                            </div>
                        )}
                        {isPlaying ? (
                            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-100">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                                Live
                            </span>
                        ) : null}
                    </div>

                    <div>
                        <h1 className="ui-page-title">{station.name}</h1>
                        <p className="ui-page-subtitle">
                            {[station.genre, station.country].filter(Boolean).join(' · ') || 'Unknown station'}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5 sm:gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isPlaying) {
                                        pause()
                                        return
                                    }
                                    play(toStation(station))
                                }}
                                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:px-5"
                            >
                                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>

                            {station.website ? (
                                <a
                                    href={station.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3.5 py-2 text-sm transition-colors hover:bg-muted sm:px-4"
                                >
                                    <Globe className="h-4 w-4" />
                                    Website
                                </a>
                            ) : null}
                        </div>

                        <div className="mt-5 grid max-w-3xl gap-2 sm:mt-6 sm:grid-cols-2 xl:grid-cols-3">
                            {stats.map((item) => (
                                <div key={item.label} className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                                    <p className="mt-1 truncate font-medium">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {station.tags?.length ? (
                            <div className="mt-6 max-w-3xl">
                                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Tags</p>
                                <div className="flex flex-wrap gap-2">
                                    {station.tags.slice(0, 24).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {station.description ? (
                            <div className="mt-6 rounded-xl border border-border/60 bg-card/50 p-4">
                                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Description</p>
                                <p className="text-sm leading-relaxed text-foreground/90">{station.description}</p>
                            </div>
                        ) : null}

                        {station.editor_notes ? (
                            <div className="mt-4 rounded-xl border border-border/60 bg-card/50 p-4">
                                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Editor notes</p>
                                <p className="text-sm leading-relaxed text-foreground/90">{station.editor_notes}</p>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
