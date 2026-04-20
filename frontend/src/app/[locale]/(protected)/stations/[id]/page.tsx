import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'

export default async function StationDetailsRedirectPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const [{ id }, resolvedSearchParams, locale] = await Promise.all([
        params,
        searchParams,
        getLocale(),
    ])

    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
        if (typeof value === 'string') qs.set(key, value)
        if (Array.isArray(value)) {
            for (const item of value) qs.append(key, item)
        }
    }

    const href = qs.toString() ? `/curated/${id}?${qs.toString()}` : `/curated/${id}`
    redirect({ href, locale })
}
