import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

type SiteHeaderProps = {
    centerSlot?: React.ReactNode
    rightSlot?: React.ReactNode
    className?: string
    containerClassName?: string
    brandClassName?: string
    rightSlotClassName?: string
}

export function SiteHeader({
    centerSlot,
    rightSlot,
    className,
    containerClassName,
    brandClassName,
    rightSlotClassName,
}: SiteHeaderProps) {
    return (
        <header className={cn('bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 shrink-0', className)}>
            <div className={cn('flex w-full items-center gap-4 pl-2 pr-4 py-3 sm:pl-3 sm:pr-6', containerClassName)}>
                <Link href="/" className={cn('ui-wordmark shrink-0 text-2xl sm:text-3xl', brandClassName)}>
                    OSTGUT
                </Link>
                {centerSlot ? <div className="flex flex-1 justify-center">{centerSlot}</div> : <div className="flex-1" />}
                {rightSlot ? <div className={cn('flex min-w-0 shrink-0 items-center justify-end gap-3', rightSlotClassName)}>{rightSlot}</div> : null}
            </div>
        </header>
    )
}
