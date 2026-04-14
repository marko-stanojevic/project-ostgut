export default function ProtectedLoading() {
    return (
        <div className="space-y-6">
            <div className="flex gap-2">
                <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-8 w-28 animate-pulse rounded-full bg-muted" />
                <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-7">
                {Array.from({ length: 14 }).map((_, i) => (
                    <div key={i} className="rounded-xl p-1.5">
                        <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
                        <div className="mt-1.5 space-y-1">
                            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                            <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
