import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

export type AdminUserRole = 'user' | 'editor' | 'admin'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: AdminUserRole
}

export interface ListAdminUsersParams {
  limit: number
  offset: number
  query?: string
}

export interface ListAdminUsersResponse {
  users: AdminUser[]
  total: number
}

export interface SetAdminUserRoleResponse {
  user_id: string
  role: AdminUserRole
}

export function listAdminUsers(accessToken: string, params: ListAdminUsersParams) {
  const searchParams = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })

  if (params.query) {
    searchParams.set('q', params.query)
  }

  return fetchJSONWithAuth<ListAdminUsersResponse>(`${API_URL}/admin/users?${searchParams}`, accessToken)
}

export function setAdminUserRole(accessToken: string, userID: string, role: AdminUserRole) {
  return fetchJSONWithAuth<SetAdminUserRoleResponse>(`${API_URL}/admin/users/${userID}/role`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  })
}
