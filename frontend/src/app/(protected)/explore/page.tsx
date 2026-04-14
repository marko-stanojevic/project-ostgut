'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { CompassIcon, PlayIcon, PauseIcon, RadioIcon, SparkleIcon, XIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 24
const LIST_RETURN_KEY = 'explore:list:return'
const LIST_SCROLL_KEY = 'explore:list:scrollY'

interface ApiStation {
    id: string
    name: string
    stream_url: string
    logo?: string
    genre: string
    language: string
    country: string
    country_code: string
    bitrate: number
    codec: string
    reliability_score: number
    featured: boolean
}

interface CountryOption {
    code: string
    name: string
}

interface FiltersResponse {
    genres?: string[]
    countries?: CountryOption[]
}

function toStation(s: ApiStation): Station {
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

function StationCard({
    s,
    isActive,
    isPlaying,
    imagePriority,
    onOpen,
}: {
    s: ApiStation
    isActive: boolean
    isPlaying: boolean
    imagePriority?: boolean
    onOpen: () => void
}) {
    const { play, pause } = usePlayer()

    const handleTogglePlay = () => {
        if (isActive && isPlaying) {
            pause()
            return
        }
        play(toStation(s))
        onOpen()
    }

    return (
        <article className="group relative rounded-xl p-1.5 text-left transition-all duration-200 hover:bg-muted/50">
            <div
                onClick={onOpen}
                className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-muted"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
                aria-label={`Open ${s.name} details`}
            >
                {s.logo ? (
                    <Image
                        src={s.logo}
                        alt={s.name}
                        fill
                        priority={imagePriority}
                        sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 14vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        unoptimized
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <RadioIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleTogglePlay() }}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-lg shadow-black/30 transition-all duration-200 hover:scale-110 hover:bg-white group-hover:opacity-100"
                        aria-label={isActive && isPlaying ? `Pause ${s.name}` : `Play ${s.name}`}
                    >
                        {isActive && isPlaying
                            ? <PauseIcon weight="fill" className="h-4 w-4 text-black" />
                            : <PlayIcon weight="fill" className="ml-0.5 h-4 w-4 text-black" />}
                    </button>
                </div>
            </div>
            <div className="mt-1.5 px-0.5">
                <button onClick={onOpen} className="w-full cursor-pointer text-left" aria-label={`Open ${s.name} details`}>
                    <p className="ui-card-title">{s.name}</p>
                    <p className="ui-card-meta">{[s.genre || 'Unknown genre', s.country].filter(Boolean).join(' · ')}</p>
                </button>
            </div>
            {isActive && isPlaying && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-brand shadow-[0_0_6px_rgba(200,116,58,0.6)]" />
            )}
        </article>
    )
}

function StationCardSkeleton() {
    return (
        <div className="rounded-xl p-1.5">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="mt-1.5 space-y-1">
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-2/3" />
            </div>
        </div>
    )
}

function ExploreContent() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { station: activeStation, state } = usePlayer()

    const [stations, setStations] = useState<ApiStation[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [genres, setGenres] = useState<string[]>([])
    const [countries, setCountries] = useState<CountryOption[]>([])

    const query = searchParams.get('q')?.trim() ?? ''
    const genre = searchParams.get('genre') ?? ''
    const country = searchParams.get('country') ?? ''
    const sort = searchParams.get('sort') === 'popular' ? 'popular' : 'recommended'
    const featuredOnly = searchParams.get('featured') === 'true'

    const activeFilters = useMemo(
        () => [query, genre, country, featuredOnly ? 'featured' : '', sort === 'popular' ? 'popular' : ''].filter(Boolean).length,
        [query, genre, country, featuredOnly, sort]
    )

    useEffect(() => {
        fetch(`${API}/stations/filters`)
            .then((r) => r.json())
            .then((data: FiltersResponse) => {
                setGenres(data.genres ?? [])
                setCountries(data.countries ?? [])
            })
            .catch(() => {
                setGenres([])
                setCountries([])
            })
    }, [])

    useEffect(() => {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('limit', String(PAGE_SIZE))
        params.set('offset', '0')
        if (query) params.set('q', query)
        if (genre) params.set('genre', genre)
        if (country) params.set('country', country)
        if (featuredOnly) params.set('featured', 'true')
        if (sort === 'popular') params.set('sort', 'popular')

        fetch(`${API}/stations?${params.toString()}`)
            .then((r) => r.json())
            .then((data) => {
                setStations(data.stations ?? [])
                setTotal(data.total ?? data.count ?? 0)
            })
            .catch(() => {
                setStations([])
                setTotal(0)
            })
            .finally(() => setLoading(false))
    }, [query, genre, country, featuredOnly, sort])

    useEffect(() => {
        if (typeof window === 'undefined') return

        const savedReturn = sessionStorage.getItem(LIST_RETURN_KEY)
        const savedScrollY = sessionStorage.getItem(LIST_SCROLL_KEY)
        const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

        if (!savedReturn || !savedScrollY || savedReturn !== current) return

        const y = Number(savedScrollY)
        if (!Number.isFinite(y)) return

        const rafID = window.requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: 'auto' })
            sessionStorage.removeItem(LIST_RETURN_KEY)
            sessionStorage.removeItem(LIST_SCROLL_KEY)
        })

        return () => window.cancelAnimationFrame(rafID)
    }, [pathname, searchParams, loading])

    const updateParams = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())
        for (const [key, value] of Object.entries(updates)) {
            if (!value) params.delete(key)
            else params.set(key, value)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const params = new URLSearchParams()
            params.set('limit', String(PAGE_SIZE))
            params.set('offset', String(stations.length))
            if (query) params.set('q', query)
            if (genre) params.set('genre', genre)
            if (country) params.set('country', country)
            if (featuredOnly) params.set('featured', 'true')
            if (sort === 'popular') params.set('sort', 'popular')

            const data = await fetch(`${API}/stations?${params.toString()}`).then((r) => r.json())
            setStations((prev) => [...prev, ...(data.stations ?? [])])
            setTotal(data.total ?? data.count ?? 0)
        } finally {
            setLoadingMore(false)
        }
    }

    const openStation = (stationID: string) => {
        const from = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname

        if (typeof window !== 'undefined') {
            sessionStorage.setItem(LIST_RETURN_KEY, from)
            sessionStorage.setItem(LIST_SCROLL_KEY, String(window.scrollY))
        }

        router.push(`/stations/${stationID}?from=${encodeURIComponent(from)}`)
    }

    const clearFilters = () => {
        router.replace(pathname, { scroll: false })
    }

    return (
        <div>
            <div className="mb-8 max-w-3xl">
                <p className="ui-section-title">Explore</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Explore by mood, geography, and taste.
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    A more deliberate way to browse the catalog. Filter by genre or country, surface editor picks, and follow whatever sound you want next.
                </p>
            </div>

            <div className="mb-6 rounded-2xl border border-border/60 bg-background/75 p-4 shadow-sm backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Genre</span>
                            <select
                                value={genre}
                                onChange={(e) => updateParams({ genre: e.target.value || null })}
                                className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                            >
                                <option value="">All genres</option>
                                {genres.map((option) => (
                                    <option key={option} value={option.toLowerCase()}>{option}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Country</span>
                            <select
                                value={country}
                                onChange={(e) => updateParams({ country: e.target.value || null })}
                                className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                            >
                                <option value="">Any country</option>
                                {countries.map((option) => (
                                    <option key={option.code} value={option.code}>{option.name}</option>
                                ))}
                            </select>
                        </label>

                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Sort</span>
                            <div className="flex h-11 rounded-xl border border-border bg-background p-1">
                                <button
                                    type="button"
                                    onClick={() => updateParams({ sort: null })}
                                    className={`flex-1 rounded-lg px-3 text-sm transition-colors ${sort === 'recommended' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Recommended
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateParams({ sort: 'popular' })}
                                    className={`flex-1 rounded-lg px-3 text-sm transition-colors ${sort === 'popular' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Popular
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Editorial</span>
                            <button
                                type="button"
                                onClick={() => updateParams({ featured: featuredOnly ? null : 'true' })}
                                className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors ${featuredOnly ? 'border-brand/35 bg-brand/8 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                            >
                                <SparkleIcon className="h-4 w-4" />
                                Editor picks only
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 lg:pl-4">
                        <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Active filters</p>
                            <p className="mt-1 text-sm text-foreground">{activeFilters}</p>
                        </div>
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <XIcon className="h-4 w-4" /> Clear
                        </button>
                    </div>
                </div>
            </div>

            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {query
                            ? <>Results for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span></>
                            : 'Browse across the catalog with a lighter editorial touch.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    <CompassIcon className="h-3.5 w-3.5" /> {total} matches
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
                </div>
            ) : stations.length === 0 ? (
                <div className="py-24 text-center">
                    <CompassIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/25" />
                    <p className="text-sm font-medium text-foreground">No stations matched this view</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try a different filter combination or clear the search.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                        {stations.map((s, index) => (
                            <StationCard
                                key={s.id}
                                s={s}
                                imagePriority={index < 3}
                                onOpen={() => openStation(s.id)}
                                isActive={activeStation?.id === s.id}
                                isPlaying={activeStation?.id === s.id && state === 'playing'}
                            />
                        ))}
                        {loadingMore && Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={`more-${i}`} />)}
                    </div>
                    {stations.length < total && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
                            >
                                {loadingMore ? 'Loading…' : `Load more · ${total - stations.length} remaining`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default function ExplorePage() {
    return (
        <Suspense>
            <ExploreContent />
        </Suspense>
    )
}