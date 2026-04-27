'use client'

import { Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer } from '@/context/PlayerContext'
import { StationGrid, StationGridSkeleton } from '@/components/stations/station-grid'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { fetchStations, STATION_FEED_PAGE_SIZE, type StationFeedState } from '@/lib/station-feed'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'
import type { PlayerState } from '@/types/player'
import { RadioIcon, XIcon, SparkleIcon, TrendUpIcon } from '@phosphor-icons/react'

type FeedView = 'for-you' | 'staff-picks' | 'trending'

const CURATED_PAGE_SIZE = STATION_FEED_PAGE_SIZE

const LIST_RETURN_KEY = 'curated:list:return'
const LIST_SCROLL_KEY = 'curated:list:scrollY'

type CuratedFeedState = StationFeedState

interface CuratedClientProps {
    initialRecommended: CuratedFeedState
    initialMostPlayed: CuratedFeedState
}

function parseFeedView(value: string | null): FeedView {
    if (value === 'staff-picks' || value === 'trending' || value === 'for-you') return value
    return 'for-you'
}

interface CuratedFeedSectionProps {
    title: string
    icon: ReactNode
    stations: ApiStation[]
    total: number
    loading: boolean
    loadingMore: boolean
    error: boolean
    errorLabel: string
    emptyLabel: string
    loadingLabel: string
    loadMoreLabel: string
    activeStationID?: string
    playerState: PlayerState
    className?: string
    onLoadMore: () => void
    onOpen: (stationID: string) => void
    onPlay: (index: number) => void
}

function CuratedFeedSection({
    title,
    icon,
    stations,
    total,
    loading,
    loadingMore,
    error,
    errorLabel,
    emptyLabel,
    loadingLabel,
    loadMoreLabel,
    activeStationID,
    playerState,
    className,
    onLoadMore,
    onOpen,
    onPlay,
}: CuratedFeedSectionProps) {
    return (
        <div className={className}>
            <div className="mb-4 flex items-center gap-2">
                {icon}
                <h2 className="ui-section-title">{title}</h2>
            </div>
            {loading ? (
                <StationGridSkeleton count={CURATED_PAGE_SIZE} />
            ) : error ? (
                <p className="text-sm text-muted-foreground">{errorLabel}</p>
            ) : stations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
                <StationGrid
                    stations={stations}
                    total={total}
                    loadingMore={loadingMore}
                    loadingLabel={loadingLabel}
                    loadMoreLabel={loadMoreLabel}
                    activeStationID={activeStationID}
                    playerState={playerState}
                    onLoadMore={onLoadMore}
                    onOpen={onOpen}
                    onPlay={onPlay}
                />
            )}
        </div>
    )
}

function CuratedContent({ initialRecommended, initialMostPlayed }: CuratedClientProps) {
    const t = useTranslations('curated')
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { station: activeStation, state, setQueue } = usePlayer()

    const [recommended, setRecommended] = useState<ApiStation[]>(initialRecommended.stations)
    const [recommendedTotal, setRecommendedTotal] = useState(initialRecommended.total)
    const [loadingRecommended] = useState(false)
    const [loadingMoreRecommended, setLoadingMoreRecommended] = useState(false)
    const [recommendedError, setRecommendedError] = useState(initialRecommended.error)

    const [mostPlayed, setMostPlayed] = useState<ApiStation[]>(initialMostPlayed.stations)
    const [mostPlayedTotal, setMostPlayedTotal] = useState(initialMostPlayed.total)
    const [loadingMostPlayed] = useState(false)
    const [loadingMoreMostPlayed, setLoadingMoreMostPlayed] = useState(false)
    const [mostPlayedError, setMostPlayedError] = useState(initialMostPlayed.error)

    const [searchResults, setSearchResults] = useState<ApiStation[]>([])
    const [searchTotal, setSearchTotal] = useState(0)
    const [loadingSearch, setLoadingSearch] = useState(false)
    const [loadingMoreSearch, setLoadingMoreSearch] = useState(false)
    const [searchError, setSearchError] = useState(false)

    const feedView = parseFeedView(searchParams.get('view'))
    const search = searchParams.get('q')?.trim() ?? ''
    const searchQuery = searchParams.toString()
    const recommendedLoadingRef = useRef(false)
    const mostPlayedLoadingRef = useRef(false)
    const searchLoadingRef = useRef(false)

    const recommendedQueue = useMemo(() => recommended.map(toStation), [recommended])
    const mostPlayedQueue = useMemo(() => mostPlayed.map(toStation), [mostPlayed])
    const searchQueue = useMemo(() => searchResults.map(toStation), [searchResults])

    const loadMoreRecommended = async () => {
        if (recommendedLoadingRef.current || recommendedError) return
        recommendedLoadingRef.current = true
        setLoadingMoreRecommended(true)
        try {
            const data = await fetchStations(`/stations?featured=true&limit=${CURATED_PAGE_SIZE}&offset=${recommended.length}`)
            setRecommended((prev) => [...prev, ...data.stations])
            setRecommendedTotal(data.total)
            setRecommendedError(false)
        } catch {
            setRecommendedError(true)
        } finally {
            recommendedLoadingRef.current = false
            setLoadingMoreRecommended(false)
        }
    }

    const loadMoreMostPlayed = async () => {
        if (mostPlayedLoadingRef.current || mostPlayedError) return
        mostPlayedLoadingRef.current = true
        setLoadingMoreMostPlayed(true)
        try {
            const data = await fetchStations(`/stations?sort=popular&limit=${CURATED_PAGE_SIZE}&offset=${mostPlayed.length}`)
            setMostPlayed((prev) => [...prev, ...data.stations])
            setMostPlayedTotal(data.total)
            setMostPlayedError(false)
        } catch {
            setMostPlayedError(true)
        } finally {
            mostPlayedLoadingRef.current = false
            setLoadingMoreMostPlayed(false)
        }
    }

    const loadMoreSearch = async () => {
        if (!search || searchLoadingRef.current) return
        searchLoadingRef.current = true
        setLoadingMoreSearch(true)
        try {
            const data = await fetchStations(`/search?q=${encodeURIComponent(search)}&limit=${CURATED_PAGE_SIZE}&offset=${searchResults.length}`)
            setSearchResults((prev) => [...prev, ...data.stations])
            setSearchTotal(data.total)
            setSearchError(false)
        } catch {
            setSearchError(true)
        } finally {
            searchLoadingRef.current = false
            setLoadingMoreSearch(false)
        }
    }

    useEffect(() => {
        if (!search) {
            setSearchResults([])
            setSearchTotal(0)
            setSearchError(false)
            setLoadingSearch(false)
            return
        }

        const controller = new AbortController()

        setLoadingSearch(true)
        setSearchError(false)
        setSearchResults([])

        fetchStations(`/search?q=${encodeURIComponent(search)}&limit=${CURATED_PAGE_SIZE}&offset=0`, {
            signal: controller.signal,
        })
            .then((data) => {
                setSearchResults(data.stations)
                setSearchTotal(data.total)
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setSearchResults([])
                setSearchError(true)
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoadingSearch(false)
                }
            })

        return () => {
            controller.abort()
        }
    }, [search])

    useScrollRestoration({
        pathname,
        search: searchQuery,
        returnKey: LIST_RETURN_KEY,
        scrollKey: LIST_SCROLL_KEY,
        ready: !loadingRecommended && !loadingMostPlayed && !loadingSearch,
    })

    const setFeedView = (next: FeedView) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === 'for-you') {
            params.delete('view')
        } else {
            params.set('view', next)
        }
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const openStation = (stationID: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (feedView === 'for-you') {
            params.delete('view')
        } else {
            params.set('view', feedView)
        }

        const from = params.toString() ? `${pathname}?${params.toString()}` : pathname

        if (typeof window !== 'undefined') {
            sessionStorage.setItem(LIST_RETURN_KEY, from)
            sessionStorage.setItem(LIST_SCROLL_KEY, String(window.scrollY))
        }

        router.push(`/curated/${stationID}?from=${encodeURIComponent(from)}`)
    }

    const clearSearch = () => {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('q')
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    return (
        <div>
            <div className="mb-8 max-w-3xl">
                <p className="ui-section-title">{t('section_label')}</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {t('heading')}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {t('description')}
                </p>
            </div>
            <div className="mb-7 flex items-center gap-3 border-b border-border/50 pb-0">
                {([
                    { id: 'for-you', label: t('feed_for_you') },
                    { id: 'staff-picks', label: t('feed_staff_picks') },
                    { id: 'trending', label: t('feed_trending') },
                ] as { id: FeedView; label: string }[]).map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => {
                            if (search) return
                            setFeedView(id)
                        }}
                        aria-disabled={Boolean(search)}
                        className={`relative px-3 py-2 text-[18px] font-medium transition-colors ${
                            feedView === id
                                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:ui-nav-underline'
                                : search
                                    ? 'cursor-not-allowed text-muted-foreground/50'
                                    : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <section className="min-w-0">
                {search ? (
                    <>
                        <div className="mb-5 flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{t('search_results_for')} <span className="font-medium text-foreground">&ldquo;{search}&rdquo;</span></span>
                            <button onClick={clearSearch} className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                                <XIcon className="h-3 w-3" /> {t('search_clear')}
                            </button>
                        </div>
                        {loadingSearch ? (
                            <StationGridSkeleton count={12} className="sm:grid-cols-4 lg:grid-cols-5" />
                        ) : searchError ? (
                            <div className="py-24 text-center">
                                <RadioIcon className="mx-auto mb-4 h-10 w-10 text-destructive/40" />
                                <p className="text-sm font-medium text-foreground">{t('search_error')}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{t('search_error_hint')}</p>
                            </div>
                        ) : searchResults.length === 0 ? (
                            <div className="py-24 text-center">
                                <RadioIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/25" />
                                <p className="text-sm font-medium text-foreground">{t('no_stations')}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{t('no_stations_hint')}</p>
                            </div>
                        ) : (
                            <StationGrid
                                stations={searchResults}
                                total={searchTotal}
                                loadingMore={loadingMoreSearch}
                                loadingLabel={t('loading')}
                                loadMoreLabel={t('load_more', { count: searchTotal - searchResults.length })}
                                activeStationID={activeStation?.id}
                                playerState={state}
                                className="sm:grid-cols-4 lg:grid-cols-5"
                                onLoadMore={loadMoreSearch}
                                onOpen={openStation}
                                onPlay={(index) => setQueue(searchQueue, index)}
                            />
                        )}
                    </>
                ) : (
                    <>
                        {(feedView === 'for-you' || feedView === 'staff-picks') && (
                            <CuratedFeedSection
                                className="mb-10"
                                title={feedView === 'staff-picks' ? t('section_staff_picks') : t('section_editors')}
                                icon={<SparkleIcon className="h-3.5 w-3.5 ui-editorial-text" />}
                                stations={recommended}
                                total={recommendedTotal}
                                loading={loadingRecommended}
                                loadingMore={loadingMoreRecommended}
                                error={recommendedError}
                                errorLabel={t('section_error')}
                                emptyLabel={t('no_featured')}
                                loadingLabel={t('loading')}
                                loadMoreLabel={t('load_more', { count: recommendedTotal - recommended.length })}
                                activeStationID={activeStation?.id}
                                playerState={state}
                                onLoadMore={loadMoreRecommended}
                                onOpen={openStation}
                                onPlay={(index) => setQueue(recommendedQueue, index)}
                            />
                        )}
                        {(feedView === 'for-you' || feedView === 'trending') && (
                            <CuratedFeedSection
                                title={feedView === 'trending' ? t('section_trending_now') : t('section_most_played')}
                                icon={<TrendUpIcon className="h-3.5 w-3.5 ui-editorial-text" />}
                                stations={mostPlayed}
                                total={mostPlayedTotal}
                                loading={loadingMostPlayed}
                                loadingMore={loadingMoreMostPlayed}
                                error={mostPlayedError}
                                errorLabel={t('section_error')}
                                emptyLabel={t('no_stations_yet')}
                                loadingLabel={t('loading')}
                                loadMoreLabel={t('load_more', { count: mostPlayedTotal - mostPlayed.length })}
                                activeStationID={activeStation?.id}
                                playerState={state}
                                onLoadMore={loadMoreMostPlayed}
                                onOpen={openStation}
                                onPlay={(index) => setQueue(mostPlayedQueue, index)}
                            />
                        )}
                    </>
                )}
            </section>
        </div>
    )
}

export function CuratedClient(props: CuratedClientProps) {
    return (
        <Suspense>
            <CuratedContent {...props} />
        </Suspense>
    )
}