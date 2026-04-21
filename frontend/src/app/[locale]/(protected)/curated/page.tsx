'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePlayer } from '@/context/PlayerContext'
import { StationCard, StationCardSkeleton } from '@/components/StationCard'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'
import { RadioIcon, XIcon, SparkleIcon, TrendUpIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

type FeedView = 'for-you' | 'staff-picks' | 'trending'

const LIST_RETURN_KEY = 'curated:list:return'
const LIST_SCROLL_KEY = 'curated:list:scrollY'

function parseFeedView(value: string | null): FeedView {
    if (value === 'staff-picks' || value === 'trending' || value === 'for-you') return value
    return 'for-you'
}

const PAGE_SIZE = 24

function CuratedContent() {
    const t = useTranslations('curated')
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { station: activeStation, state, setQueue } = usePlayer()

    const [recommended, setRecommended] = useState<ApiStation[]>([])
    const [recommendedTotal, setRecommendedTotal] = useState(0)
    const [loadingRecommended, setLoadingRecommended] = useState(true)
    const [loadingMoreRecommended, setLoadingMoreRecommended] = useState(false)
    const [recommendedError, setRecommendedError] = useState(false)

    const [mostPlayed, setMostPlayed] = useState<ApiStation[]>([])
    const [mostPlayedTotal, setMostPlayedTotal] = useState(0)
    const [loadingMostPlayed, setLoadingMostPlayed] = useState(true)
    const [loadingMoreMostPlayed, setLoadingMoreMostPlayed] = useState(false)
    const [mostPlayedError, setMostPlayedError] = useState(false)

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

    useEffect(() => {
        setLoadingRecommended(true)
        setRecommendedError(false)
        setRecommended([])
        fetch(`${API}/stations?featured=true&limit=${PAGE_SIZE}&offset=0`)
            .then((r) => r.json())
            .then((data) => { setRecommended(data.stations ?? []); setRecommendedTotal(data.total ?? data.count ?? 0) })
            .catch(() => {
                setRecommended([])
                setRecommendedError(true)
            })
            .finally(() => setLoadingRecommended(false))
    }, [])

    useEffect(() => {
        setLoadingMostPlayed(true)
        setMostPlayedError(false)
        setMostPlayed([])
        fetch(`${API}/stations?sort=popular&limit=${PAGE_SIZE}&offset=0`)
            .then((r) => r.json())
            .then((data) => { setMostPlayed(data.stations ?? []); setMostPlayedTotal(data.total ?? data.count ?? 0) })
            .catch(() => {
                setMostPlayed([])
                setMostPlayedError(true)
            })
            .finally(() => setLoadingMostPlayed(false))
    }, [])

    const loadMoreRecommended = async () => {
        if (recommendedLoadingRef.current) return
        recommendedLoadingRef.current = true
        setLoadingMoreRecommended(true)
        try {
            const data = await fetch(`${API}/stations?featured=true&limit=${PAGE_SIZE}&offset=${recommended.length}`).then((r) => r.json())
            setRecommended((prev) => [...prev, ...(data.stations ?? [])])
            setRecommendedTotal(data.total ?? data.count ?? 0)
        } finally {
            recommendedLoadingRef.current = false
            setLoadingMoreRecommended(false)
        }
    }

    const loadMoreMostPlayed = async () => {
        if (mostPlayedLoadingRef.current) return
        mostPlayedLoadingRef.current = true
        setLoadingMoreMostPlayed(true)
        try {
            const data = await fetch(`${API}/stations?sort=popular&limit=${PAGE_SIZE}&offset=${mostPlayed.length}`).then((r) => r.json())
            setMostPlayed((prev) => [...prev, ...(data.stations ?? [])])
            setMostPlayedTotal(data.total ?? data.count ?? 0)
        } finally {
            mostPlayedLoadingRef.current = false
            setLoadingMoreMostPlayed(false)
        }
    }

    const fetchSearch = useCallback(() => {
        if (!search) { setSearchResults([]); setSearchTotal(0); setSearchError(false); return }
        setLoadingSearch(true)
        setSearchError(false)
        setSearchResults([])
        fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=0`)
            .then((r) => r.json())
            .then((data) => { setSearchResults(data.stations ?? []); setSearchTotal(data.total ?? data.count ?? 0) })
            .catch(() => {
                setSearchResults([])
                setSearchError(true)
            })
            .finally(() => setLoadingSearch(false))
    }, [search])

    const loadMoreSearch = async () => {
        if (!search || searchLoadingRef.current) return
        searchLoadingRef.current = true
        setLoadingMoreSearch(true)
        try {
            const data = await fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${searchResults.length}`).then((r) => r.json())
            setSearchResults((prev) => [...prev, ...(data.stations ?? [])])
            setSearchTotal(data.total ?? data.count ?? 0)
        } finally {
            searchLoadingRef.current = false
            setLoadingMoreSearch(false)
        }
    }

    useEffect(() => { fetchSearch() }, [fetchSearch])

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
                                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-brand'
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
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                                {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
                            </div>
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
                            <>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                                    {searchResults.map((s, index) => (
                                        <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} onPlay={() => setQueue(searchQueue, index)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                                    ))}
                                    {loadingMoreSearch && Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={`more-${i}`} />)}
                                </div>
                                {searchResults.length < searchTotal && (
                                    <div className="mt-6 text-center">
                                        <button
                                            onClick={loadMoreSearch}
                                            disabled={loadingMoreSearch}
                                            className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
                                        >
                                            {loadingMoreSearch ? t('loading') : t('load_more', { count: searchTotal - searchResults.length })}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {(feedView === 'for-you' || feedView === 'staff-picks') && (
                            <div className="mb-10">
                                <div className="mb-4 flex items-center gap-2">
                                    <SparkleIcon className="h-3.5 w-3.5 text-brand" />
                                    <h2 className="ui-section-title">
                                        {feedView === 'staff-picks' ? t('section_staff_picks') : t('section_editors')}
                                    </h2>
                                </div>
                                {loadingRecommended ? (
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                                        {Array.from({ length: PAGE_SIZE }).map((_, i) => <StationCardSkeleton key={i} />)}
                                    </div>
                                ) : recommendedError ? (
                                    <p className="text-sm text-muted-foreground">{t('section_error')}</p>
                                ) : recommended.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t('no_featured')}</p>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                                            {recommended.map((s, index) => (
                                                <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} onPlay={() => setQueue(recommendedQueue, index)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                                            ))}
                                            {loadingMoreRecommended && Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={`more-${i}`} />)}
                                        </div>
                                        {recommended.length < recommendedTotal && (
                                            <div className="mt-6 text-center">
                                                <button
                                                    onClick={loadMoreRecommended}
                                                    disabled={loadingMoreRecommended}
                                                    className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
                                                >
                                                    {loadingMoreRecommended ? t('loading') : t('load_more', { count: recommendedTotal - recommended.length })}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        {(feedView === 'for-you' || feedView === 'trending') && (
                            <div>
                                <div className="mb-4 flex items-center gap-2">
                                    <TrendUpIcon className="h-3.5 w-3.5 text-brand" />
                                    <h2 className="ui-section-title">
                                        {feedView === 'trending' ? t('section_trending_now') : t('section_most_played')}
                                    </h2>
                                </div>
                                {loadingMostPlayed ? (
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                                        {Array.from({ length: PAGE_SIZE }).map((_, i) => <StationCardSkeleton key={i} />)}
                                    </div>
                                ) : mostPlayedError ? (
                                    <p className="text-sm text-muted-foreground">{t('section_error')}</p>
                                ) : mostPlayed.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t('no_stations_yet')}</p>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                                            {mostPlayed.map((s, index) => (
                                                <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} onPlay={() => setQueue(mostPlayedQueue, index)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                                            ))}
                                            {loadingMoreMostPlayed && Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={`more-${i}`} />)}
                                        </div>
                                        {mostPlayed.length < mostPlayedTotal && (
                                            <div className="mt-6 text-center">
                                                <button
                                                    onClick={loadMoreMostPlayed}
                                                    disabled={loadingMoreMostPlayed}
                                                    className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
                                                >
                                                    {loadingMoreMostPlayed ? t('loading') : t('load_more', { count: mostPlayedTotal - mostPlayed.length })}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    )
}

export default function CuratedPage() {
    return (
        <Suspense>
            <CuratedContent />
        </Suspense>
    )
}
