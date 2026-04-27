'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer } from '@/context/PlayerContext'
import { StationGrid, StationGridSkeleton } from '@/components/stations/station-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import type { ExploreFiltersState } from '@/lib/station-filters'
import { fetchStations, type StationFeedState } from '@/lib/station-feed'
import { buildStationFeedPath, getStationFilters, type StationFilterKey } from '@/lib/station-query'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'
import { CompassIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const LIST_RETURN_KEY = 'explore:list:return'
const LIST_SCROLL_KEY = 'explore:list:scrollY'

type FilterCategory = StationFilterKey

export type ExploreStationsState = StationFeedState

interface ExploreClientProps {
    initialStations: ExploreStationsState
    initialFilters: ExploreFiltersState
    initialStationsPath: string
}

function formatFilterLabel(value: string) {
    if (!value) return value
    if (value.length <= 3) return value.toUpperCase()

    return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function ExploreContent({ initialStations, initialFilters, initialStationsPath }: ExploreClientProps) {
    const t = useTranslations('explore')
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { station: activeStation, state, setQueue } = usePlayer()

    const [stations, setStations] = useState<ApiStation[]>(initialStations.stations)
    const [total, setTotal] = useState(initialStations.total)
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [stationsError, setStationsError] = useState(initialStations.error)
    const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null)

    const query = searchParams.get('q')?.trim() ?? ''
    const searchQuery = searchParams.toString()
    const filters = useMemo(() => getStationFilters(searchParams), [searchParams])
    const { genre: genreFilter, subgenre: subgenreFilter, style: styleFilter, format: formatFilter, texture: textureFilter } = filters

    const genreKey = genreFilter.join('\0')
    const subgenreKey = subgenreFilter.join('\0')
    const styleKey = styleFilter.join('\0')
    const formatKey = formatFilter.join('\0')
    const textureKey = textureFilter.join('\0')

    const stationsPath = useMemo(() => buildStationFeedPath({
        query,
        filters,
        offset: 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [query, genreKey, subgenreKey, styleKey, formatKey, textureKey])

    const categoryConfig = useMemo(() => [
        { id: 'genre' as FilterCategory, label: t('filter_genre'), options: initialFilters.genres, selected: genreFilter, getValue: (option: string) => option.toLowerCase() },
        { id: 'subgenre' as FilterCategory, label: 'Subgenre', options: initialFilters.subgenres, selected: subgenreFilter, getValue: (option: string) => option.toLowerCase() },
        { id: 'style' as FilterCategory, label: t('filter_style'), options: initialFilters.styles, selected: styleFilter, getValue: (option: string) => option },
        { id: 'format' as FilterCategory, label: t('filter_format'), options: initialFilters.formats, selected: formatFilter, getValue: (option: string) => option },
        { id: 'texture' as FilterCategory, label: t('filter_texture'), options: initialFilters.textures, selected: textureFilter, getValue: (option: string) => option },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t, initialFilters, genreKey, subgenreKey, styleKey, formatKey, textureKey])

    const activeCategoryConfig = categoryConfig.find(category => category.id === activeCategory) ?? null
    const stationsQueue = useMemo(() => stations.map(toStation), [stations])
    const loadMoreRef = useRef(false)
    const initialStationsPathRef = useRef(initialStationsPath)

    const activeChips = useMemo(() => [
        ...genreFilter.map(value => ({ key: 'genre', value })),
        ...subgenreFilter.map(value => ({ key: 'subgenre', value })),
        ...styleFilter.map(value => ({ key: 'style', value })),
        ...formatFilter.map(value => ({ key: 'format', value })),
        ...textureFilter.map(value => ({ key: 'texture', value })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [genreKey, subgenreKey, styleKey, formatKey, textureKey])

    useEffect(() => {
        if (searchParams.get('featured') !== 'true') return

        const params = new URLSearchParams(searchParams.toString())
        params.delete('featured')
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    useEffect(() => {
        const controller = new AbortController()

        if (stationsPath === initialStationsPathRef.current) {
            initialStationsPathRef.current = ''
            return () => controller.abort()
        }

        setLoading(true)
        setStationsError(false)

        fetchStations(stationsPath, { signal: controller.signal })
            .then((data) => {
                setStations(data.stations)
                setTotal(data.total)
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
    }, [stationsPath])

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
            current.filter(currentValue => currentValue !== value).forEach(currentValue => params.append(key, currentValue))
        } else {
            [...current, value].forEach(currentValue => params.append(key, currentValue))
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const loadMore = async () => {
        if (loadMoreRef.current || stationsError) return
        loadMoreRef.current = true
        setLoadingMore(true)
        try {
            const data = await fetchStations(buildStationFeedPath({
                query,
                filters,
                offset: stations.length,
            }))
            setStations((prev) => [...prev, ...data.stations])
            setTotal(data.total)
            setStationsError(false)
        } catch {
            setStationsError(true)
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

            <div className="border-y border-border/50">
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

                {initialFilters.error && (
                    <div className="border-t border-border/40 py-3">
                        <p className="text-sm text-muted-foreground">{t('filters_error')}</p>
                    </div>
                )}

                {activeChips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 py-3">
                        {activeChips.map(({ key, value }) => (
                            <button
                                key={`${key}:${value}`}
                                type="button"
                                onClick={() => toggleFilter(key, value)}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                            >
                                <span className="text-muted-foreground/60">{categoryConfig.find(category => category.id === key)?.label}:</span> {formatFilterLabel(value)} <XIcon className="h-3 w-3" />
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

            <div className="my-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <CompassIcon className="h-3.5 w-3.5" /> {t('matches', { count: total })}
            </div>

            {loading ? (
                <StationGridSkeleton count={12} />
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
                <StationGrid
                    stations={stations}
                    total={total}
                    loadingMore={loadingMore}
                    loadingLabel={t('loading')}
                    loadMoreLabel={t('load_more', { count: total - stations.length })}
                    activeStationID={activeStation?.id}
                    playerState={state}
                    showCountry
                    onLoadMore={loadMore}
                    onOpen={openStation}
                    onPlay={(index) => setQueue(stationsQueue, index)}
                />
            )}
        </div>
    )
}

export function ExploreClient(props: ExploreClientProps) {
    return (
        <Suspense fallback={<ExploreFallback />}>
            <ExploreContent {...props} />
        </Suspense>
    )
}

function ExploreFallback() {
    return (
        <div>
            <div className="mb-8">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-10 w-72" />
                <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
            </div>
            <div className="border-y border-border/50 py-3">
                <div className="flex gap-4">
                    {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-8 w-20" />)}
                </div>
            </div>
            <div className="my-4 flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
            </div>
            <StationGridSkeleton count={12} />
        </div>
    )
}
