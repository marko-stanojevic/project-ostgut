import { Skeleton } from '@/components/ui/skeleton'

interface SkeletonCell {
    tdClassName: string
    /** Single skeleton class — used when the cell has one item */
    skeletonClassName?: string
    /** Multiple skeleton classes rendered side-by-side in a flex row */
    items?: string[]
}

interface AdminTableSkeletonRowsProps {
    rowCount?: number
    cells: SkeletonCell[]
}

export function AdminTableSkeletonRows({
    rowCount = 8,
    cells,
}: AdminTableSkeletonRowsProps) {
    return (
        <>
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b">
                    {cells.map((cell, cellIdx) => (
                        <td key={`${rowIdx}-${cellIdx}`} className={cell.tdClassName}>
                            {cell.items ? (
                                <div className="flex items-center gap-2">
                                    {cell.items.map((cls, i) => (
                                        <Skeleton key={i} className={cls} />
                                    ))}
                                </div>
                            ) : (
                                <Skeleton className={cell.skeletonClassName ?? 'h-4 w-24'} />
                            )}
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}
