import { optionalString, requireRecord } from '@/lib/api-contract'

const AUTH_FETCH_ERROR_CONTRACT = 'authenticated error response'

export class AuthFetchError extends Error {
    status: number

    constructor(message: string, status: number) {
        super(message)
        this.name = 'AuthFetchError'
        this.status = status
    }
}

async function parseJsonSafely(response: Response): Promise<unknown | null> {
    try {
        return await response.json()
    } catch {
        return null
    }
}

export async function fetchJSONWithAuth(
    url: string,
    accessToken: string,
    init?: RequestInit,
): Promise<unknown> {
    const response = await fetchWithAuth(url, accessToken, init)

    if (response.status === 204) {
        throw new AuthFetchError('Expected JSON response', response.status)
    }

    const data = await parseJsonSafely(response)
    if (data === null) {
        throw new AuthFetchError('Expected JSON response', response.status)
    }

    return data
}

export async function fetchNoContentWithAuth(
    url: string,
    accessToken: string,
    init?: RequestInit,
): Promise<void> {
    const response = await fetchWithAuth(url, accessToken, init)
    if (response.status !== 204) {
        throw new AuthFetchError(`Expected empty response, got status ${response.status}`, response.status)
    }
}

async function fetchWithAuth(
    url: string,
    accessToken: string,
    init?: RequestInit,
): Promise<Response> {
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
        const data = await parseAuthFetchError(response)
        throw new AuthFetchError(
            data?.error || data?.message || `Request failed with status ${response.status}`,
            response.status,
        )
    }

    return response
}

async function parseAuthFetchError(response: Response): Promise<{ error?: string; message?: string } | null> {
    const payload = await parseJsonSafely(response)
    if (payload === null) {
        return null
    }

    try {
        const error = requireRecord(payload, 'response', AUTH_FETCH_ERROR_CONTRACT)
        return {
            error: optionalString(error.error, 'error', AUTH_FETCH_ERROR_CONTRACT),
            message: optionalString(error.message, 'message', AUTH_FETCH_ERROR_CONTRACT),
        }
    } catch {
        return null
    }
}
