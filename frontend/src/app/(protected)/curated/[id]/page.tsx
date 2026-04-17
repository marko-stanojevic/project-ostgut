'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeftIcon, GlobeIcon, PauseIcon, PlayIcon, RadioIcon } from '@phosphor-icons/react'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface ApiStationDetail {
    id: string
    name: string
    stream_url: string
    logo?: string
    website?: string
    overview?: string
    description?: string
    editor_notes?: string
    genre: string
    language: string
    country: string
    city: string
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
        logo: s.logo,
        genre: s.genre,
        country: s.country,
        city: s.city,
        countryCode: s.country_code,
        bitrate: s.bitrate,
        codec: s.codec,
    }
}

function CuratedDetailsContent() {
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
        const savedCurated = typeof window !== 'undefined' ? sessionStorage.getItem('curated:list:return') : null
        const savedExplore = typeof window !== 'undefined' ? sessionStorage.getItem('explore:list:return') : null
        const candidate = from || savedCurated || savedExplore || '/curated'
        const target = candidate.startsWith('/curated') || candidate.startsWith('/explore') ? candidate : '/curated'
        router.push(target)
    }

    useEffect(() => {
        if (!id) return
        setLoading(true)
        setError(null)
        fetch(`${API}/stations/${id}`)
            .then(async (r) => {
                if (!r.ok) throw new Error(r.status === 404 ? 'Station not found.' : 'Unable to load station.')
                return r.json()
            })
            .then((data: ApiStationDetail) => setStation(data))
            .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : 'Unable to load station.')
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
            { label: 'City', value: station.city || '—' },
            { label: 'Language', value: station.language || '—' },
            { label: 'Genre', value: station.genre || '—' },
            { label: 'Codec', value: station.codec || '—' },
            { label: 'Bitrate', value: station.bitrate ? `${station.bitrate} kbps` : '—' },
        ]
    }, [station])

    return (
        <div className="w-full max-w-5xl">
            <button
                type="button"
                onClick={handleBack}
                className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Back
            </button>

            {loading ? (
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                    <Skeleton className="aspect-square w-full rounded-2xl" />
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-3/5" />
                        <Skeleton className="h-4 w-2/5" />
                        <Skeleton className="h-12 w-36" />
                        <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                        </div>
                    </div>
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            ) : station ? (
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                    <div className="space-y-4">
                        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-lg">
                            {station.logo ? (
                                <Image
                                    src={station.logo}
                                    alt={station.name}
                                    fill
                                    priority
                                    sizes="(max-width: 1024px) 100vw, 260px"
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <RadioIcon className="h-12 w-12 text-muted-foreground/30" />
                                </div>
                            )}
                            {isPlaying && (
                                <div className="absolute inset-0 flex items-start justify-end p-3">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-sm">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                                        Live
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 lg:hidden">
                            <button
                                type="button"
                                onClick={() => isPlaying ? pause() : play(toStation(station))}
                                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${isPlaying
                                    ? 'bg-secondary text-foreground ring-1 ring-border hover:bg-secondary/80'
                                    : 'bg-foreground text-background hover:opacity-85'
                                    }`}
                            >
                                {isPlaying
                                    ? <PauseIcon weight="fill" className="h-4 w-4" />
                                    : <PlayIcon weight="fill" className="h-4 w-4" />
                                }
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>
                            {station.website && (
                                <a
                                    href={station.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                                >
                                    <GlobeIcon className="h-3.5 w-3.5" />
                                    Website
                                </a>
                            )}
                        </div>

                        <div className="hidden lg:grid grid-cols-2 gap-1.5">
                            {stats.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/50 bg-card/50 px-3 py-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{item.label}</p>
                                    <p className="mt-0.5 truncate text-xs font-medium">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {station.tags?.length ? (
                            <div className="mt-4 hidden lg:block">
                                <div className="flex flex-wrap gap-1.5">
                                    {station.tags.slice(0, 24).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border/50 bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{station.name}</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {[station.city, station.country].filter(Boolean).join(' · ') || 'Unknown station'}
                        </p>

                        <div className="mt-5 hidden items-center gap-2.5 lg:flex">
                            <button
                                type="button"
                                onClick={() => isPlaying ? pause() : play(toStation(station))}
                                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${isPlaying
                                    ? 'bg-secondary text-foreground ring-1 ring-border hover:bg-secondary/80'
                                    : 'bg-foreground text-background hover:opacity-85'
                                    }`}
                            >
                                {isPlaying
                                    ? <PauseIcon weight="fill" className="h-4 w-4" />
                                    : <PlayIcon weight="fill" className="h-4 w-4" />
                                }
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>
                            {station.website && (
                                <a
                                    href={station.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                                >
                                    <GlobeIcon className="h-3.5 w-3.5" />
                                    Website
                                </a>
                            )}
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:hidden">
                            {stats.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/50 bg-card/50 px-3.5 py-3">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{item.label}</p>
                                    <p className="mt-1 truncate text-sm font-medium">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {station.tags?.length ? (
                            <div className="mt-6 lg:hidden">
                                <div className="flex flex-wrap gap-1.5">
                                    {station.tags.slice(0, 24).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border/50 bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {station.editor_notes && (
                            <div className="mt-6 rounded-xl border border-brand/20 bg-brand/5 p-5">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand/70">Editor&apos;s Note</p>
                                <p className="text-[15px] leading-relaxed text-foreground/90 font-medium">{station.editor_notes}</p>
                            </div>
                        )}

                        {(station.overview || station.description) && (
                            <div className="mt-3 rounded-xl border border-border/50 bg-card/40 p-4">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">About</p>
                                <p className="text-sm leading-relaxed text-foreground/80">{station.overview || station.description}</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export default function CuratedDetailsPage() {
    return (
        <Suspense>
            <CuratedDetailsContent />
        </Suspense>
    )
}