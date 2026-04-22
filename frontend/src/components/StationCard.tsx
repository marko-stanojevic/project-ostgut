'use client'

import Image from 'next/image'
import { PlayIcon, PauseIcon, RadioIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlayer } from '@/context/PlayerContext'
import { toStation } from '@/lib/station'
import type { ApiStation } from '@/types/station'

export function StationCard({
    s,
    isActive,
    isPlaying,
    imagePriority,
    showCountry,
    onOpen,
    onPlay,
}: {
    s: ApiStation
    isActive: boolean
    isPlaying: boolean
    imagePriority?: boolean
    showCountry?: boolean
    onOpen: () => void
    onPlay?: () => void
}) {
    const { play, pause } = usePlayer()

    const handleTogglePlay = () => {
        if (isActive && isPlaying) { pause(); return }
        if (onPlay) {
            onPlay()
        } else {
            play(toStation(s))
        }
    }

    const meta = showCountry
        ? [(s.genres ?? []).join(', ') || 'Unknown genre', s.country].filter(Boolean).join(' · ')
        : (s.genres ?? []).join(', ') || 'Unknown genre'

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
                    <p className="ui-card-meta">{meta}</p>
                </button>
            </div>
            {isActive && isPlaying && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-brand shadow-[0_0_6px_rgba(200,116,58,0.6)]" />
            )}
        </article>
    )
}

export function StationCardSkeleton() {
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
