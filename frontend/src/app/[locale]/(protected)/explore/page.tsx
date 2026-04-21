'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { CompassIcon, PlayIcon, PauseIcon, RadioIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 24
const LIST_RETURN_KEY = 'explore:list:return'
const LIST_SCROLL_KEY = 'explore:list:scrollY'

interface ApiStream {
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

interface ApiStation {
    id: string
    name: string
    stream_url: string
    streams?: ApiStream[]
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
        streams: s.streams?.map((st) => ({
            id: st.id,
            url: st.url,
            resolvedUrl: st.resolved_url,
            kind: st.kind,
            container: st.container,
            transport: st.transport,
            mimeType: st.mime_type,
            codec: st.codec,
            lossless: st.lossless,
            bitrate: st.bitrate,
            bitDepth: st.bit_depth,
            sampleRateHz: st.sample_rate_hz,
            sampleRateConfidence: st.sample_rate_confidence,
            channels: st.channels,
            priority: st.priority,
            isActive: st.is_active,
            healthScore: st.health_score,
            lastCheckedAt: st.last_checked_at,
            lastError: st.last_error,
        })),
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
    const genreFilter = searchParams.getAll('genre')
    const styleFilter = searchParams.getAll('style')
    const formatFilter = searchParams.getAll('format')
    const textureFilter = searchParams.getAll('texture')

    // Stable string keys for effect dependencies — array refs change every render
    const genreKey = genreFilter.join('\0')
    const styleKey = styleFilter.join('\0')
    const formatKey = formatFilter.join('\0')
    const textureKey = textureFilter.join('\0')

    type FilterCategory = 'genre' | 'style' | 'format' | 'texture'
    const [activeCategory, setActiveCategory] = useState<FilterCategory | null>('genre')

    const categoryConfig = useMemo(() => [
        { id: 'genre' as FilterCategory, label: t('filter_genre'), options: genres, selected: genreFilter, getValue: (o: string) => o.toLowerCase() },
        { id: 'style' as FilterCategory, label: t('filter_style'), options: styles, selected: styleFilter, getValue: (o: string) => o },
        { id: 'format' as FilterCategory, label: t('filter_format'), options: formats, selected: formatFilter, getValue: (o: string) => o },
        { id: 'texture' as FilterCategory, label: t('filter_texture'), options: textures, selected: textureFilter, getValue: (o: string) => o },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t, genres, genreKey, styles, styleKey, formats, formatKey, textures, textureKey])

    const activeCategoryConfig = categoryConfig.find(c => c.id === activeCategory) ?? null

    const activeChips = useMemo(() => [
        ...genreFilter.map(v => ({ key: 'genre', value: v })),
        ...styleFilter.map(v => ({ key: 'style', value: v })),
        ...formatFilter.map(v => ({ key: 'format', value: v })),
        ...textureFilter.map(v => ({ key: 'texture', value: v })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [genreKey, styleKey, formatKey, textureKey])

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
        genreFilter.forEach(v => params.append('genre', v))
        styleFilter.forEach(v => params.append('style', v))
        formatFilter.forEach(v => params.append('format', v))
        textureFilter.forEach(v => params.append('texture', v))


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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, genreKey, styleKey, formatKey, textureKey])

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

    const toggleFilter = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        const current = params.getAll(key)
        params.delete(key)
        if (current.includes(value)) {
            current.filter(v => v !== value).forEach(v => params.append(key, v))
        } else {
            [...current, value].forEach(v => params.append(key, v))
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
            genreFilter.forEach(v => params.append('genre', v))
            styleFilter.forEach(v => params.append('style', v))
            formatFilter.forEach(v => params.append('format', v))
            textureFilter.forEach(v => params.append('texture', v))
    

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
        <div>
            <div className="mb-8">
                <p className="ui-section-title">{t('section_label')}</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {t('heading')}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t('description')}
                </p>
            </div>

            {/* Filters section */}
            <div className="border-y border-border/50">
                {/* Category tab bar */}
                <div className="flex items-center gap-4">
                    {categoryConfig.map(({ id, label, selected }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveCategory(prev => prev === id ? null : id)}
                            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                                activeCategory === id
                                    ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-brand'
                                    : selected.length > 0
                                        ? 'text-brand/80 hover:text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {label}
                            {selected.length > 0 && (
                                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand/15 px-1 text-[10px] font-semibold text-brand">
                                    {selected.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tag pills for active category */}
                {activeCategoryConfig && activeCategoryConfig.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 border-t border-border/40 py-3">
                        {activeCategoryConfig.options.map((option) => {
                            const value = activeCategoryConfig.getValue(option)
                            const isSelected = activeCategoryConfig.selected.includes(value)
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => toggleFilter(activeCategoryConfig.id, value)}
                                    className={cn(
                                        'rounded-full border px-4 py-1.5 text-sm transition-colors',
                                        isSelected
                                            ? 'border-brand bg-brand font-medium text-black'
                                            : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                                    )}
                                >
                                    {formatFilterLabel(option)}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Active filter chips */}
                {activeChips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 py-3">
                        {activeChips.map(({ key, value }) => (
                            <button
                                key={`${key}:${value}`}
                                type="button"
                                onClick={() => toggleFilter(key, value)}
                                className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-brand/20"
                            >
                                {formatFilterLabel(value)} <XIcon className="h-3 w-3" />
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            {t('filter_clear')}
                        </button>
                    </div>
                )}
            </div>

            {/* Count */}
            <div className="my-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <CompassIcon className="h-3.5 w-3.5" /> {t('matches', { count: total })}
            </div>

            {loading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
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
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
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
