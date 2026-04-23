'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer } from '@/context/PlayerContext'
import { StationCard, StationCardSkeleton } from '@/components/StationCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'
import { CompassIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 24
const LIST_RETURN_KEY = 'explore:list:return'
const LIST_SCROLL_KEY = 'explore:list:scrollY'

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
    const [loadingFilters, setLoadingFilters] = useState(true)
    const [stationsError, setStationsError] = useState(false)
    const [filtersError, setFiltersError] = useState(false)
    const [genres, setGenres] = useState<string[]>([])
    const [styles, setStyles] = useState<string[]>([])
    const [formats, setFormats] = useState<string[]>([])
    const [textures, setTextures] = useState<string[]>([])

    const query = searchParams.get('q')?.trim() ?? ''
    const searchQuery = searchParams.toString()
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
    const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null)

    const categoryConfig = useMemo(() => [
        { id: 'genre' as FilterCategory, label: t('filter_genre'), options: genres, selected: genreFilter, getValue: (o: string) => o.toLowerCase() },
        { id: 'style' as FilterCategory, label: t('filter_style'), options: styles, selected: styleFilter, getValue: (o: string) => o },
        { id: 'format' as FilterCategory, label: t('filter_format'), options: formats, selected: formatFilter, getValue: (o: string) => o },
        { id: 'texture' as FilterCategory, label: t('filter_texture'), options: textures, selected: textureFilter, getValue: (o: string) => o },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t, genres, genreKey, styles, styleKey, formats, formatKey, textures, textureKey])

    const activeCategoryConfig = categoryConfig.find(c => c.id === activeCategory) ?? null
    const stationsQueue = useMemo(() => stations.map(toStation), [stations])
    const loadMoreRef = useRef(false)

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
        setLoadingFilters(true)
        setFiltersError(false)
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
                setFiltersError(true)
            })
            .finally(() => setLoadingFilters(false))
    }, [])

    useEffect(() => {
        setLoading(true)
        setStationsError(false)
        const params = new URLSearchParams()
        params.set('limit', String(PAGE_SIZE))
        params.set('offset', '0')
        if (query) params.set('q', query)
        genreFilter.forEach(v => params.append('genre', v))
        styleFilter.forEach(v => params.append('style', v))
        formatFilter.forEach(v => params.append('format', v))
        textureFilter.forEach(v => params.append('texture', v))

        const controller = new AbortController()

        fetch(`${API}/stations?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((r) => r.json())
            .then((data) => {
                setStations(data.stations ?? [])
                setTotal(data.total ?? data.count ?? 0)
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setStations([])
                setTotal(0)
                setStationsError(true)
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            })

        return () => {
            controller.abort()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, genreKey, styleKey, formatKey, textureKey])

    useScrollRestoration({
        pathname,
        search: searchQuery,
        returnKey: LIST_RETURN_KEY,
        scrollKey: LIST_SCROLL_KEY,
        ready: !loading,
    })

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
        if (loadMoreRef.current) return
        loadMoreRef.current = true
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
            loadMoreRef.current = false
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
                            className={`relative px-3 py-2 text-base font-medium transition-colors ${
                                activeCategory === id
                                    ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:ui-nav-underline'
                                    : selected.length > 0
                                        ? 'ui-nav-live-text hover:text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {label}
                            {selected.length > 0 && (
                                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-nav-accent-surface px-1 text-[10px] font-semibold text-nav-accent-text">
                                    {selected.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tag pills for active category */}
                {loadingFilters && (
                    <div className="flex flex-wrap gap-1.5 border-t border-border/40 py-3">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <Skeleton key={index} className="h-9 w-20 rounded-full" />
                        ))}
                    </div>
                )}

                {!loadingFilters && activeCategoryConfig && activeCategoryConfig.options.length > 0 && (
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
                                        'border px-4 py-1.5 text-sm transition-colors',
                                        isSelected
                                            ? 'border-brand bg-nav-accent-text font-medium text-brand-foreground'
                                            : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                                    )}
                                >
                                    {formatFilterLabel(option)}
                                </button>
                            )
                        })}
                    </div>
                )}

                {!loadingFilters && filtersError && (
                    <div className="border-t border-border/40 py-3">
                        <p className="text-sm text-muted-foreground">{t('filters_error')}</p>
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
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                            >
                                <span className="text-muted-foreground/60">{categoryConfig.find(c => c.id === key)?.label}:</span> {formatFilterLabel(value)} <XIcon className="h-3 w-3" />
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="px-1 text-xs text-muted-foreground underline transition-colors hover:text-foreground"
                        >
                            {t('filter_clear_all')}
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
            ) : stationsError ? (
                <div className="py-24 text-center">
                    <CompassIcon className="mx-auto mb-4 h-10 w-10 text-destructive/40" />
                    <p className="text-sm font-medium text-foreground">{t('results_error')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('results_error_hint')}</p>
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
                                showCountry
                                onOpen={() => openStation(s.id)}
                                onPlay={() => setQueue(stationsQueue, index)}
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
