import { redirect } from 'next/navigation'

export default async function StationDetailsRedirectPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const qs = new URLSearchParams()

    for (const [key, value] of Object.entries(resolvedSearchParams)) {
        if (typeof value === 'string') qs.set(key, value)
        if (Array.isArray(value)) {
            for (const item of value) qs.append(key, item)
        }
    }

    redirect(qs.toString() ? `/curated/${id}?${qs.toString()}` : `/curated/${id}`)
}
