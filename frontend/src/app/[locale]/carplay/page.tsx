import { CarPlayClient } from './carplay-client.tsx'
import { fetchStationFeed } from '@/lib/station-feed'

const CARPLAY_STATION_LIMIT = 6

export default async function CarPlayPage() {
  const initialFeed = await fetchStationFeed(`/stations?featured=true&limit=${CARPLAY_STATION_LIMIT}&offset=0`)

  return (
    <CarPlayClient
      initialStations={initialFeed.stations.slice(0, CARPLAY_STATION_LIMIT)}
    />
  )
}
