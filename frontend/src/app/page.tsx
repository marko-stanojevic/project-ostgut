'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { AccountMenu } from '@/components/account-menu'
import { usePlayer, type Station } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Radio, Play, Pause, X, Sparkles, Search, TrendingUp } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface ApiStation {
  id: string
  name: string
  stream_url: string
  logo?: string
  website?: string
  description?: string
  editor_notes?: string
  genre: string
  language: string
  country: string
  country_code: string
  tags: string[]
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
    if (isActive && isPlaying) {
      pause()
      return
    }
    play(toStation(s))
  }

  return (
    <article
      className={`group relative rounded-xl p-1.5 text-left transition-all ${isSelected
        ? 'bg-muted/70'
        : 'hover:bg-muted/40'
        }`}
    >
      <div
        onClick={onSelect}
        className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect()
        }}
        aria-label={`Open ${s.name} details`}
      >
        {s.logo ? (
          <Image src={s.logo} alt="" fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Radio className="h-6 w-6 text-muted-foreground" />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleTogglePlay()
            }}
            className="h-8 w-8 rounded-full bg-white/90 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:scale-110"
            aria-label={isActive && isPlaying ? `Pause ${s.name}` : `Play ${s.name}`}
          >
            {isActive && isPlaying ? (
              <Pause className="h-3.5 w-3.5 text-black" />
            ) : (
              <Play className="h-3.5 w-3.5 text-black ml-0.5" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-1.5">
        <button onClick={onSelect} className="cursor-pointer text-left w-full" aria-label={`Open ${s.name} details`}>
          <p className="truncate text-xs font-semibold leading-tight">{s.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {[s.genre, s.country].filter(Boolean).join(' \u00b7 ')}
          </p>
        </button>
      </div>

      {isActive && isPlaying && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
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

// Public landing page
function PublicLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation */}
      <header className="border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight text-white sm:text-lg">bouji.fm</Link>
          <nav className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Login</Link>
            <Link href="/auth/signup" className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-red-500 transition-colors">Sign Up Free</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-32 gap-8 relative overflow-hidden">
        {/* Gradient background accent */}
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-600 rounded-full blur-3xl" />
        </div>

        <div className="space-y-6 max-w-2xl relative z-10">
          <div className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Radio className="h-4 w-4 text-primary mr-2" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Premium Curated Radio</span>
          </div>

          <h1 className="text-6xl font-bold tracking-tight leading-tight">
            The Listening Room
          </h1>
          <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Discover the world&apos;s finest live radio. Premium stations, carefully curated. No clutter. No noise. Just music.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link
            href="/auth/signup"
            className="font-semibold bg-primary text-white px-8 py-3 rounded-lg hover:bg-red-500 transition-colors"
          >
            Start Listening Free
          </Link>
          <Link
            href="/pricing"
            className="font-semibold border border-border/50 px-8 py-3 rounded-lg hover:bg-muted/30 transition-colors"
          >
            See Plans
          </Link>
        </div>

        {/* Extra info */}
        <p className="text-sm text-muted-foreground mt-4">
          Thousands of stations · Live radio · Premium experience
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} bouji.fm. All rights reserved.</span>
          <nav className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

// Authenticated listening room
function ListeningRoom() {
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

  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const search = searchParams.get('q')?.trim() ?? ''
  const [feedView, setFeedView] = useState<FeedView>('for-you')

  const [selectedStationID, setSelectedStationID] = useState<string | null>(null)

  useEffect(() => {
    setSearchInput(searchParams.get('q') ?? '')
  }, [searchParams])

  useEffect(() => {
    const timeoutID = window.setTimeout(() => {
      const trimmed = searchInput.trim()
      const current = searchParams.get('q')?.trim() ?? ''
      if (trimmed === current) return

      const params = new URLSearchParams(searchParams.toString())
      if (trimmed) {
        params.set('q', trimmed)
      } else {
        params.delete('q')
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 180)
    return () => window.clearTimeout(timeoutID)
  }, [pathname, router, searchInput, searchParams])

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
    if (!search) {
      setSearchResults([])
      return
    }
    setLoadingSearch(true)
    fetch(`${API}/search?q=${encodeURIComponent(search)}&limit=60`)
      .then((r) => r.json())
      .then((data) => setSearchResults(data.stations ?? []))
      .catch(() => setSearchResults([]))
      .finally(() => setLoadingSearch(false))
  }, [search])

  useEffect(() => {
    fetchSearch()
  }, [fetchSearch])

  const allStations = useMemo(
    () => (search ? searchResults : [...recommended, ...mostPlayed]),
    [search, searchResults, recommended, mostPlayed]
  )

  useEffect(() => {
    if (allStations.length === 0) {
      setSelectedStationID(null)
      return
    }
    if (activeStation?.id && allStations.some((s) => s.id === activeStation.id)) {
      setSelectedStationID(activeStation.id)
      return
    }
    if (!selectedStationID || !allStations.some((s) => s.id === selectedStationID)) {
      setSelectedStationID(allStations[0].id)
    }
  }, [allStations, activeStation?.id, selectedStationID])

  const clearSearch = () => {
    setSearchInput('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0 text-base font-bold tracking-tight text-white sm:text-lg">bouji.fm</Link>

          <div className="relative mx-auto w-full max-w-3xl">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search stations, genres, countries"
              className="h-11 rounded-full border-border/50 bg-muted/30 pl-14 pr-14 text-base placeholder:text-muted-foreground/80 focus-visible:ring-1"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/pricing" className="hidden rounded-full border border-border/50 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-muted/40 sm:block">
              Upgrade
            </Link>
            <AccountMenu />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {!search && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedView('for-you')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${feedView === 'for-you'
                ? 'bg-white text-black'
                : 'bg-muted/35 text-white hover:bg-muted/50'
                }`}
            >
              For You
            </button>
            <button
              type="button"
              onClick={() => setFeedView('staff-picks')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${feedView === 'staff-picks'
                ? 'bg-white text-black'
                : 'bg-muted/35 text-white hover:bg-muted/50'
                }`}
            >
              Staff Picks
            </button>
            <button
              type="button"
              onClick={() => setFeedView('trending')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${feedView === 'trending'
                ? 'bg-white text-black'
                : 'bg-muted/35 text-white hover:bg-muted/50'
                }`}
            >
              Trending
            </button>
          </div>
        )}

        <section>
          {search ? (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <span>Results for &ldquo;{search}&rdquo;</span>
                <button onClick={clearSearch} className="flex items-center gap-1 text-xs hover:text-white transition-colors">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
              {loadingSearch ? (
                <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
                  {Array.from({ length: 12 }).map((_, i) => <StationCardSkeleton key={i} />)}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No stations found. Try a different search.</p>
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
                  {searchResults.map((s) => (
                    <StationCard
                      key={s.id}
                      s={s}
                      isSelected={selectedStationID === s.id}
                      onSelect={() => setSelectedStationID(s.id)}
                      isActive={activeStation?.id === s.id}
                      isPlaying={activeStation?.id === s.id && state === 'playing'}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {(feedView === 'for-you' || feedView === 'staff-picks') && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white">
                      {feedView === 'staff-picks' ? 'Staff Picks' : 'Featured'}
                    </h2>
                  </div>
                  {loadingRecommended ? (
                    <div className="grid gap-3 grid-cols-3 sm:grid-cols-5">
                      {Array.from({ length: 8 }).map((_, i) => <StationCardSkeleton key={i} />)}
                    </div>
                  ) : recommended.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No featured stations yet.</p>
                  ) : (
                    <div className="grid gap-3 grid-cols-3 sm:grid-cols-5">
                      {recommended.map((s) => (
                        <StationCard
                          key={s.id}
                          s={s}
                          isSelected={selectedStationID === s.id}
                          onSelect={() => setSelectedStationID(s.id)}
                          isActive={activeStation?.id === s.id}
                          isPlaying={activeStation?.id === s.id && state === 'playing'}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(feedView === 'for-you' || feedView === 'trending') && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white">
                      {feedView === 'trending' ? 'Trending' : 'Most Played'}
                    </h2>
                  </div>
                  {loadingMostPlayed ? (
                    <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
                      {Array.from({ length: 5 }).map((_, i) => <StationCardSkeleton key={i} />)}
                    </div>
                  ) : mostPlayed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stations yet.</p>
                  ) : (
                    <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
                      {mostPlayed.map((s) => (
                        <StationCard
                          key={s.id}
                          s={s}
                          isSelected={selectedStationID === s.id}
                          onSelect={() => setSelectedStationID(s.id)}
                          isActive={activeStation?.id === s.id}
                          isPlaying={activeStation?.id === s.id && state === 'playing'}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// Main component - show landing for public, listening room for authenticated
export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse">
          <Radio className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <PublicLanding />
  }

  return (
    <div className="min-h-screen bg-background">
      <ListeningRoom />
    </div>
  )
}
