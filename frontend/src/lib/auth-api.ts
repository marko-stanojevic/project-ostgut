import { API_URL } from '@/lib/api'

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
    return (await response.json()) as ErrorResponse
  } catch {
    return null
  }
}
