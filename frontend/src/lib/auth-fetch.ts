export class AuthFetchError extends Error {
    status: number

    constructor(message: string, status: number) {
        super(message)
        this.name = 'AuthFetchError'
        this.status = status
    }
}

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T
    } catch {
        return null
    }
}

export async function fetchJSONWithAuth<T>(
    url: string,
    accessToken: string,
    init?: RequestInit,
): Promise<T> {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)

    if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(url, {
        ...init,
        headers,
    })

    if (!response.ok) {
        const data = await parseJsonSafely<{ error?: string; message?: string }>(response)
        throw new AuthFetchError(
            data?.error || data?.message || `Request failed with status ${response.status}`,
            response.status,
        )
    }

    if (response.status === 204) {
        return null as T
    }

    const data = await parseJsonSafely<T>(response)
    if (data === null) {
        throw new AuthFetchError('Expected JSON response', response.status)
    }

    return data
}
