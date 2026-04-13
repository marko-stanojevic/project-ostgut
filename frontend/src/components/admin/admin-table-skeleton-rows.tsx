import { Skeleton } from '@/components/ui/skeleton'

interface SkeletonCell {
    tdClassName: string
    skeletonClassName: string
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
                            <Skeleton className={cell.skeletonClassName} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}
