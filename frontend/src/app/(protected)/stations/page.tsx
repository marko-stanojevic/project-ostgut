'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { Radio, Play, Pause, X, Sparkles, TrendingUp } from 'lucide-react'

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
  isSelected,
  onSelect,
}: {
  s: ApiStation
  isActive: boolean
  isPlaying: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const { play, pause } = usePlayer()

  const handleTogglePlay = () => {
    if (isActive && isPlaying) { pause(); return }
    play(toStation(s))
  }

  return (
    <article className={`group relative rounded-xl p-1.5 text-left transition-all ${isSelected ? 'bg-muted/70' : 'hover:bg-muted/40'}`}>
      <div
        onClick={onSelect}
        className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
        aria-label={`Open ${s.name} details`}
      >
        {s.logo ? (
          <Image src={s.logo} alt="" fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Radio className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/20">
          <button
            onClick={(e) => { e.stopPropagation(); handleTogglePlay() }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 opacity-0 transition-opacity duration-200 hover:scale-110 hover:bg-white group-hover:opacity-100"
            aria-label={isActive && isPlaying ? `Pause ${s.name}` : `Play ${s.name}`}
          >
            {isActive && isPlaying ? <Pause className="h-3.5 w-3.5 text-black" /> : <Play className="h-3.5 w-3.5 ml-0.5 text-black" />}
          </button>
        </div>
      </div>
      <div className="mt-1.5">
        <button onClick={onSelect} className="w-full cursor-pointer text-left" aria-label={`Open ${s.name} details`}>
          <p className="truncate text-[15px] font-medium leading-tight tracking-tight">{s.name}</p>
          <p className="mt-0.5 truncate text-[10px] font-light text-muted-foreground">
            {[s.genre, s.country].filter(Boolean).join(' · ')}
          </p>
        </button>
      </div>
      {isActive && isPlaying && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />}
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

function StationsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { station: activeStation, state } = usePlayer()

  const [recommended, setRecommended] = useState<ApiStation[]>([])
  const [mostPlayed, setMostPlayed] = useState<ApiStation[]>([])
  const [searchResults, setSearchResults] = useState<ApiStation[]>([])

  const [loadingRecommended, setLoadingRecommended] = useState(true)
  const [loadingMostPlayed, setLoadingMostPlayed] = useState(true)
  const [loadingSearch, setLoadingSearch] = useState(false)

  const [feedView, setFeedView] = useState<FeedView>('for-you')
  const [selectedStationID, setSelectedStationID] = useState<string | null>(null)

  const search = searchParams.get('q')?.trim() ?? ''

  useEffect(() => {
    setLoadingRecommended(true)
    fetch(`${API}/stations?featured=true&limit=8`)
      .then((r) => r.json())
      .then((data) => setRecommended(data.stations ?? []))
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false))
  }, [])

  useEffect(() => {
    setLoadingMostPlayed(true)
    fetch(`${API}/stations?sort=popular&limit=5`)
      .then((r) => r.json())
      .then((data) => setMostPlayed(data.stations ?? []))
      .catch(() => setMostPlayed([]))
      .finally(() => setLoadingMostPlayed(false))
  }, [])

  const fetchSearch = useCallback(() => {
    if (!search) { setSearchResults([]); return }
    setLoadingSearch(true)
    fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=60`)
      .then((r) => r.json())
      .then((data) => setSearchResults(data.stations ?? []))
      .catch(() => setSearchResults([]))
      .finally(() => setLoadingSearch(false))
  }, [search])

  useEffect(() => { fetchSearch() }, [fetchSearch])

  const allStations = useMemo(
    () => (search ? searchResults : [...recommended, ...mostPlayed]),
    [search, searchResults, recommended, mostPlayed]
  )

  useEffect(() => {
    if (allStations.length === 0) { setSelectedStationID(null); return }
    if (activeStation?.id && allStations.some((s) => s.id === activeStation.id)) {
      setSelectedStationID(activeStation.id); return
    }
    if (!selectedStationID || !allStations.some((s) => s.id === selectedStationID)) {
      setSelectedStationID(allStations[0].id)
    }
  }, [allStations, activeStation?.id, selectedStationID])

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div>
      {!search && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {([
            { id: 'for-you', label: 'For You' },
            { id: 'staff-picks', label: 'Staff Picks' },
            { id: 'trending', label: 'Trending' },
          ] as { id: FeedView; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeedView(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${feedView === id ? 'bg-primary text-primary-foreground' : 'bg-secondary/70 text-foreground hover:bg-secondary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section>
        {search ? (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>Results for &ldquo;{search}&rdquo;</span>
              <button onClick={clearSearch} className="flex items-center gap-1 text-xs transition-colors hover:text-foreground">
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
            {loadingSearch ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-7">
                {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <Radio className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">No stations found. Try a different search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-7">
                {searchResults.map((s) => (
                  <StationCard key={s.id} s={s} isSelected={selectedStationID === s.id} onSelect={() => setSelectedStationID(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {(feedView === 'for-you' || feedView === 'staff-picks') && (
              <div className="mb-10">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-medium uppercase tracking-[0.18em]">
                    {feedView === 'staff-picks' ? 'Staff Picks' : 'Featured'}
                  </h2>
                </div>
                {loadingRecommended ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
                    {Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={i} />)}
                  </div>
                ) : recommended.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No featured stations yet.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
                    {recommended.map((s) => (
                      <StationCard key={s.id} s={s} isSelected={selectedStationID === s.id} onSelect={() => setSelectedStationID(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {(feedView === 'for-you' || feedView === 'trending') && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-medium uppercase tracking-[0.18em]">
                    {feedView === 'trending' ? 'Trending' : 'Most Played'}
                  </h2>
                </div>
                {loadingMostPlayed ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
                    {Array.from({ length: 5 }).map((_, i) => <StationCardSkeleton key={i} />)}
                  </div>
                ) : mostPlayed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No stations yet.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
                    {mostPlayed.map((s) => (
                      <StationCard key={s.id} s={s} isSelected={selectedStationID === s.id} onSelect={() => setSelectedStationID(s.id)} isActive={activeStation?.id === s.id} isPlaying={activeStation?.id === s.id && state === 'playing'} />
                    ))}
                  </div>
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
