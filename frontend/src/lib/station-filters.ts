import { getPublicStationFilters } from '@/lib/public-stations'

export interface ExploreFiltersState {
    genres: string[]
    subgenres: string[]
    styles: string[]
    formats: string[]
    textures: string[]
    error: boolean
}

export async function fetchStationFilters(revalidate = 300): Promise<ExploreFiltersState> {
    try {
        const data = await getPublicStationFilters({
            next: { revalidate },
        })

        return {
            genres: data.genre_tags,
            subgenres: data.subgenre_tags,
            styles: data.style_tags,
            formats: data.format_tags,
            textures: data.texture_tags,
            error: false,
        }
    } catch {
        return { genres: [], subgenres: [], styles: [], formats: [], textures: [], error: true }
    }
}
