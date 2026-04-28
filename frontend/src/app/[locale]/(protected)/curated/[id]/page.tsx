import { Suspense } from 'react'
import { CuratedDetailsClient } from './curated-details-client.tsx'
import { fetchStationDetail } from '@/lib/station-detail'

type Params = Promise<{ id: string }>

export default async function CuratedDetailsPage({
    params,
}: {
    params: Params
}) {
    return (
        <Suspense fallback={null}>
            <CuratedDetailsContent params={params} />
        </Suspense>
    )
}

async function CuratedDetailsContent({ params }: { params: Params }) {
    const { id } = await params
    const { station, error } = await fetchStationDetail(id)

    return (
        <CuratedDetailsClient
            initialStation={station}
            initialError={error}
        />
    )
}
