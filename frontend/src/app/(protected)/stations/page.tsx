'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioIcon, PlayIcon, PauseIcon, XIcon, SparkleIcon, TrendUpIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface ApiStation {
  id: string
  name: string
  stream_url: string
  logo?: string
  genre: string
  country: string
  country_code: string
  bitrate: number
  codec: string
  reliability_score: number
  featured: boolean
}

type FeedView = 'for-you' | 'staff-picks' | 'trending'

const LIST_RETURN_KEY = 'stations:list:return'
const LIST_SCROLL_KEY = 'stations:list:scrollY'

function parseFeedView(value: string | null): FeedView {
  if (value === 'staff-picks' || value === 'trending' || value === 'for-you') return value
  return 'for-you'
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
    if (isActive && isPlaying) { pause(); return }
    play(toStation(s))
    onOpen()
  }

  return (
    <article className="group relative rounded-xl p-1.5 text-left transition-all duration-200 hover:bg-muted/50">
      <div
        onClick={onOpen}
        className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted cursor-pointer"
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
        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); handleTogglePlay() }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-lg shadow-black/30 transition-all duration-200 hover:scale-110 hover:bg-white group-hover:opacity-100"
            aria-label={isActive && isPlaying ? `Pause ${s.name}` : `Play ${s.name}`}
          >
            {isActive && isPlaying
              ? <PauseIcon weight="fill" className="h-4 w-4 text-black" />
              : <PlayIcon weight="fill" className="ml-0.5 h-4 w-4 text-black" />
            }
          </button>
        </div>
      </div>
      <div className="mt-1.5 px-0.5">
        <button onClick={onOpen} className="w-full cursor-pointer text-left" aria-label={`Open ${s.name} details`}>
          <p className="ui-card-title">{s.name}</p>
          <p className="ui-card-meta">{s.genre || 'Unknown genre'}</p>
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

const PAGE_SIZE = 24

function StationsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { station: activeStation, state } = usePlayer()

  const [recommended, setRecommended] = useState<ApiStation[]>([])
  const [recommendedTotal, setRecommendedTotal] = useState(0)
  const [loadingRecommended, setLoadingRecommended] = useState(true)
  const [loadingMoreRecommended, setLoadingMoreRecommended] = useState(false)

  const [mostPlayed, setMostPlayed] = useState<ApiStation[]>([])
  const [mostPlayedTotal, setMostPlayedTotal] = useState(0)
  const [loadingMostPlayed, setLoadingMostPlayed] = useState(true)
  const [loadingMoreMostPlayed, setLoadingMoreMostPlayed] = useState(false)

  const [searchResults, setSearchResults] = useState<ApiStation[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false)

  const feedView = parseFeedView(searchParams.get('view'))
  const search = searchParams.get('q')?.trim() ?? ''

  useEffect(() => {
    setLoadingRecommended(true)
    setRecommended([])
    fetch(`${API}/stations?featured=true&limit=${PAGE_SIZE}&offset=0`)
      .then((r) => r.json())
      .then((data) => { setRecommended(data.stations ?? []); setRecommendedTotal(data.total ?? data.count ?? 0) })
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false))
  }, [])

  useEffect(() => {
    setLoadingMostPlayed(true)
    setMostPlayed([])
    fetch(`${API}/stations?sort=popular&limit=${PAGE_SIZE}&offset=0`)
      .then((r) => r.json())
      .then((data) => { setMostPlayed(data.stations ?? []); setMostPlayedTotal(data.total ?? data.count ?? 0) })
      .catch(() => setMostPlayed([]))
      .finally(() => setLoadingMostPlayed(false))
  }, [])

  const loadMoreRecommended = async () => {
    setLoadingMoreRecommended(true)
    try {
      const data = await fetch(`${API}/stations?featured=true&limit=${PAGE_SIZE}&offset=${recommended.length}`).then((r) => r.json())
      setRecommended((prev) => [...prev, ...(data.stations ?? [])])
      setRecommendedTotal(data.total ?? data.count ?? 0)
    } finally {
      setLoadingMoreRecommended(false)
    }
  }

  const loadMoreMostPlayed = async () => {
    setLoadingMoreMostPlayed(true)
    try {
      const data = await fetch(`${API}/stations?sort=popular&limit=${PAGE_SIZE}&offset=${mostPlayed.length}`).then((r) => r.json())
      setMostPlayed((prev) => [...prev, ...(data.stations ?? [])])
      setMostPlayedTotal(data.total ?? data.count ?? 0)
    } finally {
      setLoadingMoreMostPlayed(false)
    }
  }

  const fetchSearch = useCallback(() => {
    if (!search) { setSearchResults([]); setSearchTotal(0); return }
    setLoadingSearch(true)
    setSearchResults([])
    fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=0`)
      .then((r) => r.json())
      .then((data) => { setSearchResults(data.stations ?? []); setSearchTotal(data.total ?? data.count ?? 0) })
      .catch(() => setSearchResults([]))
      .finally(() => setLoadingSearch(false))
  }, [search])

  const loadMoreSearch = async () => {
    if (!search) return
    setLoadingMoreSearch(true)
    try {
      const data = await fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${searchResults.length}`).then((r) => r.json())
      setSearchResults((prev) => [...prev, ...(data.stations ?? [])])
      setSearchTotal(data.total ?? data.count ?? 0)
    } finally {
      setLoadingMoreSearch(false)
    }
  }

  useEffect(() => { fetchSearch() }, [fetchSearch])

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
  }, [pathname, searchParams, loadingRecommended, loadingMostPlayed, loadingSearch])

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

    router.push(`/stations/${stationID}?from=${encodeURIComponent(from)}`)
  }

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div>
      {!search && (
        <div className="mb-7 flex items-center gap-3 border-b border-border/50 pb-0">
          {([
            { id: 'for-you', label: 'For You' },
            { id: 'staff-picks', label: 'Staff Picks' },
            { id: 'trending', label: 'Trending' },
          ] as { id: FeedView; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeedView(id)}
              className={`relative px-3 py-2 text-[18px] font-medium transition-colors ${feedView === id
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-brand'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section className="min-w-0">
        {search ? (
          <>
            <div className="mb-5 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Results for <span className="font-medium text-foreground">&ldquo;{search}&rdquo;</span></span>
              <button onClick={clearSearch} className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <XIcon className="h-3 w-3" /> Clear
              </button>
            </div>
            {loadingSearch ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-24 text-center">
                <RadioIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/25" />
                <p className="text-sm font-medium text-foreground">No stations found</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a different search term</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {searchResults.map((s, index) => (
                    <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
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
                      {loadingMoreSearch ? 'Loading…' : `Load more · ${searchTotal - searchResults.length} remaining`}
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
                    {feedView === 'staff-picks' ? 'Staff Picks' : 'Featured'}
                  </h2>
                </div>
                {loadingRecommended ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => <StationCardSkeleton key={i} />)}
                  </div>
                ) : recommended.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No featured stations yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {recommended.map((s, index) => (
                        <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
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
                          {loadingMoreRecommended ? 'Loading…' : `Load more · ${recommendedTotal - recommended.length} remaining`}
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
                    {feedView === 'trending' ? 'Trending' : 'Most Played'}
                  </h2>
                </div>
                {loadingMostPlayed ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => <StationCardSkeleton key={i} />)}
                  </div>
                ) : mostPlayed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No stations yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {mostPlayed.map((s, index) => (
                        <StationCard key={s.id} s={s} imagePriority={index < 3} onOpen={() => openStation(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
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
                          {loadingMoreMostPlayed ? 'Loading…' : `Load more · ${mostPlayedTotal - mostPlayed.length} remaining`}
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

export default function StationsPage() {
  return (
    <Suspense>
      <StationsContent />
    </Suspense>
  )
}
