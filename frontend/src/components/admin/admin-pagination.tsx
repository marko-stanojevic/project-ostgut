'use client'

import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface AdminPaginationProps {
    total: number
    page: number
    totalPages: number
    itemLabel: string
    onPrev: () => void
    onNext: () => void
    onGoTo?: (page: number) => void
}

function buildPageWindows(page: number, totalPages: number): (number | '…')[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i)
    }
    const pages: (number | '…')[] = [0]
    const left = Math.max(1, page - 1)
    const right = Math.min(totalPages - 2, page + 1)
    if (left > 1) pages.push('…')
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < totalPages - 2) pages.push('…')
    pages.push(totalPages - 1)
    return pages
}

export function AdminPagination({
    total,
    page,
    totalPages,
    itemLabel,
    onPrev,
    onNext,
    onGoTo,
}: AdminPaginationProps) {
    if (totalPages <= 1) return null

    const windows = buildPageWindows(page, totalPages)

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
            <span>{total.toLocaleString()} {itemLabel} · page {page + 1} of {totalPages}</span>
            <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev} aria-label="Previous page">
                    <CaretLeftIcon className="h-4 w-4" />
                </Button>
                {windows.map((w, i) =>
                    w === '…' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground/60 select-none">…</span>
                    ) : (
                        <Button
                            key={w}
                            variant={w === page ? 'default' : 'outline'}
                            size="sm"
                            className="min-w-[2rem]"
                            onClick={() => onGoTo ? onGoTo(w as number) : undefined}
                            aria-label={`Go to page ${(w as number) + 1}`}
                            aria-current={w === page ? 'page' : undefined}
                        >
                            {(w as number) + 1}
                        </Button>
                    )
                )}
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext} aria-label="Next page">
                    <CaretRightIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
