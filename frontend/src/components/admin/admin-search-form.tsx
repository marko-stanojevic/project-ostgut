'use client'

import { MagnifyingGlass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AdminSearchFormProps {
    placeholder: string
    value: string
    onValueChange: (value: string) => void
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    className?: string
}

export function AdminSearchForm({
    placeholder,
    value,
    onValueChange,
    onSubmit,
    className,
}: AdminSearchFormProps) {
    return (
        <form onSubmit={onSubmit} className={className || 'flex gap-2 max-w-sm'}>
            <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    className="pl-8"
                />
            </div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
    )
}
