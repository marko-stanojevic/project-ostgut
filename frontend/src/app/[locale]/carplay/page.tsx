import { CarPlayClient } from './carplay-client.tsx'
import { fetchCachedStationFeed } from '@/lib/station-feed-cache'

const CARPLAY_STATION_LIMIT = 6

export default async function CarPlayPage() {
  const initialFeed = await fetchCachedStationFeed(`/stations?featured=true&limit=${CARPLAY_STATION_LIMIT}&offset=0`)

  return (
    <CarPlayClient
      initialStations={initialFeed.stations.slice(0, CARPLAY_STATION_LIMIT)}
    />
  )
}
