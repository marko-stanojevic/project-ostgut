'use client'

import { Suspense, useMemo, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, GlobeIcon, HeartIcon, LinkSimpleIcon, PauseIcon, PlayIcon, RadioIcon, ShareNetworkIcon } from '@phosphor-icons/react'
import { usePlayer } from '@/context/PlayerContext'
import { Skeleton } from '@/components/ui/skeleton'
import { toStation } from '@/lib/station'
import type { ApiStationDetail } from '@/types/station'

interface CuratedDetailsClientProps {
    initialStation: ApiStationDetail | null
    initialError: string | null
}

function DetailSkeleton() {
    return (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-4">
                <Skeleton className="h-8 w-3/5" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-12 w-36" />
                <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
                </div>
            </div>
        </div>
    )
}

function CuratedDetailsContent({ initialStation, initialError }: CuratedDetailsClientProps) {
    const t = useTranslations('station_detail')
    const router = useRouter()
    const searchParams = useSearchParams()
    const { station: activeStation, state, play, pause } = usePlayer()

    const [isFavourited, setIsFavourited] = useState(false)
    const [copied, setCopied] = useState<'page' | 'stream' | null>(null)

    const primaryStreamURL = useMemo(() => {
        if (!initialStation?.streams?.length) return ''

        return [...initialStation.streams]
            .filter((stream) => stream.is_active)
            .sort((a, b) => a.priority - b.priority)
            .map((stream) => (stream.resolved_url || stream.url || '').trim())
            .find((url) => url !== '') || ''
    }, [initialStation])

    const handleShare = () => {
        const url = window.location.href
        if (navigator.share) {
            navigator.share({ title: initialStation?.name, url }).catch(() => {})
        } else {
            navigator.clipboard.writeText(url).then(() => {
                setCopied('page')
                setTimeout(() => setCopied(null), 2000)
            })
        }
    }

    const handleCopyStream = () => {
        if (!primaryStreamURL) return
        navigator.clipboard.writeText(primaryStreamURL).then(() => {
            setCopied('stream')
            setTimeout(() => setCopied(null), 2000)
        })
    }

    const handleBack = () => {
        const from = searchParams.get('from')
        const savedCurated = typeof window !== 'undefined' ? sessionStorage.getItem('curated:list:return') : null
        const savedExplore = typeof window !== 'undefined' ? sessionStorage.getItem('explore:list:return') : null
        const candidate = from || savedCurated || savedExplore || '/curated'
        const target = candidate.startsWith('/curated') || candidate.startsWith('/explore') ? candidate : '/curated'
        router.push(target)
    }

    const isActive = Boolean(initialStation && activeStation?.id === initialStation.id)
    const isPlaying = isActive && state === 'playing'

    const stats = useMemo(() => {
        if (!initialStation) return []
        return [
            { label: t('stat_country'), value: initialStation.country || 'Unknown' },
            { label: t('stat_city'), value: initialStation.city || '—' },
            { label: t('stat_language'), value: initialStation.language || '—' },
            { label: t('stat_genre'), value: (initialStation.genre_tags ?? []).join(', ') || '—' },
        ]
    }, [initialStation, t])

    return (
        <div className="w-full max-w-5xl">
            <button
                type="button"
                onClick={handleBack}
                className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                {t('back')}
            </button>

            {initialError ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
                    <p className="text-sm text-destructive">{initialError}</p>
                </div>
            ) : initialStation ? (
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                    <div className="space-y-4">
                        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-lg">
                            {initialStation.logo ? (
                                <Image
                                    src={initialStation.logo}
                                    alt={initialStation.name}
                                    fill
                                    priority
                                    sizes="(max-width: 1024px) 100vw, 260px"
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <RadioIcon className="h-12 w-12 text-muted-foreground/30" />
                                </div>
                            )}
                            {isPlaying && (
                                <div className="absolute inset-0 flex items-start justify-end p-3">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-sm">
                                        <span className="ui-nav-live-dot h-1.5 w-1.5 animate-pulse rounded-full" />
                                        {t('live')}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 lg:hidden">
                            <button
                                type="button"
                                onClick={() => isPlaying ? pause() : play(toStation(initialStation))}
                                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${isPlaying
                                    ? 'bg-secondary text-foreground ring-1 ring-border hover:bg-secondary/80'
                                    : 'bg-foreground text-background hover:opacity-85'
                                    }`}
                            >
                                {isPlaying
                                    ? <PauseIcon weight="fill" className="h-5 w-5" />
                                    : <PlayIcon weight="fill" className="h-5 w-5" />
                                }
                                {isPlaying ? t('pause') : t('play')}
                            </button>
                            {initialStation.website && (
                                <a
                                    href={initialStation.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                                >
                                    <GlobeIcon className="h-3.5 w-3.5" />
                                    {t('website')}
                                </a>
                            )}
                        </div>

                        <div className="hidden lg:grid grid-cols-2 gap-1.5">
                            {stats.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/50 bg-card/50 px-3 py-2.5">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{item.label}</p>
                                    <p className="mt-0.5 truncate text-xs font-medium">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {initialStation.search_tags?.length ? (
                            <div className="mt-4 hidden lg:block">
                                <div className="flex flex-wrap gap-1.5">
                                    {initialStation.search_tags.slice(0, 24).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border/50 bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{initialStation.name}</h1>
                                <p className="mt-1.5 text-sm text-muted-foreground">
                                    {[initialStation.city, initialStation.country].filter(Boolean).join(' · ') || t('unknown_station')}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 pt-1">
                                <button
                                    type="button"
                                    title={isFavourited ? t('favourite_remove') : t('favourite_add')}
                                    onClick={() => setIsFavourited((value) => !value)}
                                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${isFavourited ? 'border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/15' : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'}`}
                                >
                                    <HeartIcon weight={isFavourited ? 'fill' : 'regular'} className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    title={copied === 'page' ? t('copied') : t('share')}
                                    onClick={handleShare}
                                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${copied === 'page' ? 'ui-editorial-badge' : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'}`}
                                >
                                    <ShareNetworkIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    title={copied === 'stream' ? t('copied') : t('copy_stream')}
                                    onClick={handleCopyStream}
                                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${copied === 'stream' ? 'ui-editorial-badge' : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'}`}
                                >
                                    <LinkSimpleIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 hidden items-center gap-2.5 lg:flex">
                            <button
                                type="button"
                                onClick={() => isPlaying ? pause() : play(toStation(initialStation))}
                                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${isPlaying
                                    ? 'bg-secondary text-foreground ring-1 ring-border hover:bg-secondary/80'
                                    : 'bg-foreground text-background hover:opacity-85'
                                    }`}
                            >
                                {isPlaying
                                    ? <PauseIcon weight="fill" className="h-5 w-5" />
                                    : <PlayIcon weight="fill" className="h-5 w-5" />
                                }
                                {isPlaying ? t('pause') : t('play')}
                            </button>
                            {initialStation.website && (
                                <a
                                    href={initialStation.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                                >
                                    <GlobeIcon className="h-3.5 w-3.5" />
                                    {t('website')}
                                </a>
                            )}
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:hidden">
                            {stats.map((item) => (
                                <div key={item.label} className="rounded-xl border border-border/50 bg-card/50 px-3.5 py-3">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{item.label}</p>
                                    <p className="mt-1 truncate text-sm font-medium">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {initialStation.search_tags?.length ? (
                            <div className="mt-6 lg:hidden">
                                <div className="flex flex-wrap gap-1.5">
                                    {initialStation.search_tags.slice(0, 24).map((tag) => (
                                        <span key={tag} className="rounded-full border border-border/50 bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {initialStation.editorial_review && (
                            <div className="ui-editorial-callout mt-6 rounded-xl p-5">
                                <p className="ui-editorial-eyebrow mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]">Editorial Review</p>
                                <p className="ui-editorial-text text-[15px] leading-relaxed font-medium">{initialStation.editorial_review}</p>
                            </div>
                        )}

                        {(initialStation.overview || initialStation.description) && (
                            <div className="mt-3 rounded-xl border border-border/50 bg-card/40 p-4">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{t('about')}</p>
                                <p className="text-sm leading-relaxed text-foreground/80">{initialStation.overview || initialStation.description}</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export function CuratedDetailsClient(props: CuratedDetailsClientProps) {
    return (
        <Suspense fallback={<DetailSkeleton />}>
            <CuratedDetailsContent {...props} />
        </Suspense>
    )
}
