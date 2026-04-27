import { API_URL } from '@/lib/api'
import { optionalString, requireRecord } from '@/lib/api-contract'

const AUTH_ERROR_CONTRACT = 'auth error response'

interface ErrorResponse {
  error?: string
  message?: string
}

export async function signUpWithEmail(email: string, password: string) {
  await postAuthJSON('/auth/register', { email, password }, 'Signup failed')
}

export async function requestPasswordReset(email: string) {
  await postAuthJSON('/auth/forgot-password', { email }, 'Failed to send reset email')
}

export async function resetPassword(token: string, password: string) {
  await postAuthJSON('/auth/reset-password', { token, password }, 'Failed to reset password')
}

async function postAuthJSON(path: string, body: unknown, fallbackMessage: string) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const data = await parseErrorResponse(response)
    throw new Error(data?.error || data?.message || fallbackMessage)
  }
}

async function parseErrorResponse(response: Response): Promise<ErrorResponse | null> {
  try {
    return parseErrorResponsePayload(await response.json())
  } catch {
    return null
  }
}

function parseErrorResponsePayload(payload: unknown): ErrorResponse {
  const response = requireRecord(payload, 'response', AUTH_ERROR_CONTRACT)

  return {
    error: optionalString(response.error, 'error', AUTH_ERROR_CONTRACT),
    message: optionalString(response.message, 'message', AUTH_ERROR_CONTRACT),
  }
}
