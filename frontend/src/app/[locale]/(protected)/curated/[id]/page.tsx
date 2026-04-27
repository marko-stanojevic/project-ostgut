import { CuratedDetailsClient } from './curated-details-client.tsx'
import { fetchStationDetail } from '@/lib/station-detail'

export default async function CuratedDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const { station, error } = await fetchStationDetail(id)

    return (
        <CuratedDetailsClient
            initialStation={station}
            initialError={error}
        />
    )
}
