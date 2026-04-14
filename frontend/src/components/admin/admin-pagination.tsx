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
}

export function AdminPagination({
    total,
    page,
    totalPages,
    itemLabel,
    onPrev,
    onNext,
}: AdminPaginationProps) {
    if (totalPages <= 1) return null

    return (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total.toLocaleString()} {itemLabel} · page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
                    <CaretLeftIcon className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
                    <CaretRightIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
