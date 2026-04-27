import { API_URL } from '@/lib/api'

export interface ExploreFiltersState {
    genres: string[]
    subgenres: string[]
    styles: string[]
    formats: string[]
    textures: string[]
    error: boolean
}

interface FiltersResponse {
    genre_tags?: string[]
    subgenre_tags?: string[]
    style_tags?: string[]
    format_tags?: string[]
    texture_tags?: string[]
}

export async function fetchStationFilters(revalidate = 300): Promise<ExploreFiltersState> {
    try {
        const response = await fetch(`${API_URL}/stations/filters`, {
            next: { revalidate },
        })

        if (!response.ok) {
            return { genres: [], subgenres: [], styles: [], formats: [], textures: [], error: true }
        }

        const data = (await response.json()) as FiltersResponse
        return {
            genres: data.genre_tags ?? [],
            subgenres: data.subgenre_tags ?? [],
            styles: data.style_tags ?? [],
            formats: data.format_tags ?? [],
            textures: data.texture_tags ?? [],
            error: false,
        }
    } catch {
        return { genres: [], subgenres: [], styles: [], formats: [], textures: [], error: true }
    }
}
