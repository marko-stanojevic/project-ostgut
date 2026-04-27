import { API_URL } from '@/lib/api'
import { requireArray, requireNumber, requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

const ADMIN_USERS_CONTRACT = 'admin users payload'

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

  return fetchJSONWithAuth(`${API_URL}/admin/users?${searchParams}`, accessToken).then(parseListAdminUsersResponse)
}

export function setAdminUserRole(accessToken: string, userID: string, role: AdminUserRole) {
  return fetchJSONWithAuth(`${API_URL}/admin/users/${userID}/role`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  }).then(parseSetAdminUserRoleResponse)
}

function parseListAdminUsersResponse(payload: unknown): ListAdminUsersResponse {
  const response = requireRecord(payload, 'list admin users response', ADMIN_USERS_CONTRACT)
  const users = requireArray(response.users, 'users', ADMIN_USERS_CONTRACT)

  return {
    users: users.map((user, index) => parseAdminUser(user, index)),
    total: requireNumber(response.total, 'total', ADMIN_USERS_CONTRACT),
  }
}

function parseAdminUser(payload: unknown, index: number): AdminUser {
  const user = requireRecord(payload, `users[${index}]`, ADMIN_USERS_CONTRACT)

  return {
    id: requireString(user.id, `users[${index}].id`, ADMIN_USERS_CONTRACT),
    email: requireString(user.email, `users[${index}].email`, ADMIN_USERS_CONTRACT),
    name: requireString(user.name, `users[${index}].name`, ADMIN_USERS_CONTRACT),
    role: requireAdminUserRole(user.role, `users[${index}].role`),
  }
}

function parseSetAdminUserRoleResponse(payload: unknown): SetAdminUserRoleResponse {
  const response = requireRecord(payload, 'set admin user role response', ADMIN_USERS_CONTRACT)

  return {
    user_id: requireString(response.user_id, 'user_id', ADMIN_USERS_CONTRACT),
    role: requireAdminUserRole(response.role, 'role'),
  }
}

function requireAdminUserRole(value: unknown, field: string): AdminUserRole {
  if (value === 'user' || value === 'editor' || value === 'admin') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_USERS_CONTRACT}: ${field} must be user, editor, or admin`)
}
