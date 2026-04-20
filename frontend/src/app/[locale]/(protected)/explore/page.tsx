'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { CompassIcon, PlayIcon, PauseIcon, RadioIcon, XIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 24
const LIST_RETURN_KEY = 'explore:list:return'
const LIST_SCROLL_KEY = 'explore:list:scrollY'

interface ApiStation {
    id: string
    name: string
    stream_url: string
    logo?: string
    genres: string[]
    language: string
    country: string
    city: string
    country_code: string
    bitrate: number
    codec: string
    reliability_score: number
    featured: boolean
}

interface FiltersResponse {
    genres?: string[]
    styles?: string[]
    formats?: string[]
    textures?: string[]
}

function formatFilterLabel(value: string) {
    if (!value) return value
    if (value.length <= 3) return value.toUpperCase()

    return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function toStation(s: ApiStation): Station {
    return {
        id: s.id,
        name: s.name,
        streamUrl: s.stream_url,
        logo: s.logo,
        genres: s.genres ?? [],
        country: s.country,
        city: s.city,
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
    onPlay,
}: {
    s: ApiStation
    isActive: boolean
    isPlaying: boolean
    imagePriority?: boolean
    onOpen: () => void
    onPlay?: () => void
}) {
    const { play, pause } = usePlayer()

    const handleTogglePlay = () => {
        if (isActive && isPlaying) {
            pause()
            return
        }
        if (onPlay) {
            onPlay()
        } else {
            play(toStation(s))
        }
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
                    <p className="ui-card-meta">{[(s.genres ?? []).join(', ') || 'Unknown genre', s.country].filter(Boolean).join(' · ')}</p>
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
    const t = useTranslations('explore')
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { station: activeStation, state, setQueue } = usePlayer()

    const [stations, setStations] = useState<ApiStation[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [genres, setGenres] = useState<string[]>([])
    const [styles, setStyles] = useState<string[]>([])
    const [formats, setFormats] = useState<string[]>([])
    const [textures, setTextures] = useState<string[]>([])

    const query = searchParams.get('q')?.trim() ?? ''
    const genre = searchParams.get('genre') ?? ''
    const style = searchParams.get('style') ?? ''
    const format = searchParams.get('format') ?? ''
    const texture = searchParams.get('texture') ?? ''
    const sort = searchParams.get('sort') === 'popular' ? 'popular' : 'recommended'

    const activeFilters = useMemo(
        () => [query, genre, style, format, texture, sort === 'popular' ? 'popular' : ''].filter(Boolean).length,
        [query, genre, style, format, texture, sort]
    )

    useEffect(() => {
        if (searchParams.get('featured') !== 'true') return

        const params = new URLSearchParams(searchParams.toString())
        params.delete('featured')
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    useEffect(() => {
        fetch(`${API}/stations/filters`)
            .then((r) => r.json())
            .then((data: FiltersResponse) => {
                setGenres(data.genres ?? [])
                setStyles(data.styles ?? [])
                setFormats(data.formats ?? [])
                setTextures(data.textures ?? [])
            })
            .catch(() => {
                setGenres([])
                setStyles([])
                setFormats([])
                setTextures([])
            })
    }, [])

    useEffect(() => {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('limit', String(PAGE_SIZE))
        params.set('offset', '0')
        if (query) params.set('q', query)
        if (genre) params.set('genre', genre)
        if (style) params.set('style', style)
        if (format) params.set('format', format)
        if (texture) params.set('texture', texture)
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
    }, [query, genre, style, format, texture, sort])

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
            if (style) params.set('style', style)
            if (format) params.set('format', format)
            if (texture) params.set('texture', texture)
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

        router.push(`/curated/${stationID}?from=${encodeURIComponent(from)}`)
    }

    const clearFilters = () => {
        router.replace(pathname, { scroll: false })
    }

    return (
        <div className="max-w-5xl">
            <div className="mb-8 max-w-3xl">
                <p className="ui-section-title">{t('section_label')}</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {t('heading')}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t('description')}
                </p>
            </div>

            <div className="mb-6 rounded-2xl border border-border/60 bg-card/55 px-4 py-3 backdrop-blur-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t('filters_label')}</p>
                        <span className="text-[11px] font-medium text-muted-foreground">{t('active_filters', { count: activeFilters })}</span>
                    </div>
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <XIcon className="h-3.5 w-3.5" /> {t('filter_clear')}
                    </button>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t('filter_genre')}</span>
                        <select
                            value={genre}
                            onChange={(e) => updateParams({ genre: e.target.value || null })}
                            className="explore-filter-select h-10 rounded-xl border border-border/90 bg-background/90 px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                        >
                            <option value="">{t('all_genres')}</option>
                            {genres.map((option) => (
                                <option key={option} value={option.toLowerCase()}>{formatFilterLabel(option)}</option>
                            ))}
                        </select>
                    </label>

                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t('filter_style')}</span>
                        <select
                            value={style}
                            onChange={(e) => updateParams({ style: e.target.value || null })}
                            className="explore-filter-select h-10 rounded-xl border border-border/90 bg-background/90 px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                        >
                            <option value="">{t('any_style')}</option>
                            {styles.map((option) => (
                                <option key={option} value={option}>{formatFilterLabel(option)}</option>
                            ))}
                        </select>
                    </label>

                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t('filter_format')}</span>
                        <select
                            value={format}
                            onChange={(e) => updateParams({ format: e.target.value || null })}
                            className="explore-filter-select h-10 rounded-xl border border-border/90 bg-background/90 px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                        >
                            <option value="">{t('any_format')}</option>
                            {formats.map((option) => (
                                <option key={option} value={option}>{formatFilterLabel(option)}</option>
                            ))}
                        </select>
                    </label>

                    <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t('filter_texture')}</span>
                        <select
                            value={texture}
                            onChange={(e) => updateParams({ texture: e.target.value || null })}
                            className="explore-filter-select h-10 rounded-xl border border-border/90 bg-background/90 px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                        >
                            <option value="">{t('any_texture')}</option>
                            {textures.map((option) => (
                                <option key={option} value={option}>{formatFilterLabel(option)}</option>
                            ))}
                        </select>
                    </label>

                </div>
            </div>

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="hidden">
                    <p className="text-sm text-muted-foreground">
                        {query
                            ? <>Results for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span></>
                            : 'Browse across the catalog with more control than Curated.'}
                    </p>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        <CompassIcon className="h-3.5 w-3.5" /> {t('matches', { count: total })}
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="explore-sort" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            {t('sort_label')}
                        </label>
                        <select
                            id="explore-sort"
                            value={sort}
                            onChange={(e) => updateParams({ sort: e.target.value === 'recommended' ? null : e.target.value })}
                            className="h-9 rounded-full border border-border/90 bg-background/90 px-3 text-sm text-foreground outline-none transition-colors focus:border-border/80"
                        >
                            <option value="recommended">{t('sort_recommended')}</option>
                            <option value="popular">{t('sort_popular')}</option>
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
                </div>
            ) : stations.length === 0 ? (
                <div className="py-24 text-center">
                    <CompassIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/25" />
                    <p className="text-sm font-medium text-foreground">{t('no_results')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('no_results_hint')}</p>
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
                                onPlay={() => setQueue(stations.map(toStation), index)}
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
                                {loadingMore ? t('loading') : t('load_more', { count: total - stations.length })}
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