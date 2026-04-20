'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { AdminSearchForm } from '@/components/admin/admin-search-form'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableSkeletonRows } from '@/components/admin/admin-table-skeleton-rows'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 50

const userSkeletonCells = [
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-4 w-48' },
  { tdClassName: 'px-4 py-3 hidden md:table-cell', skeletonClassName: 'h-4 w-28' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-5 w-16 rounded-full' },
  { tdClassName: 'px-4 py-3 text-right', skeletonClassName: 'h-5 w-10 ml-auto' },
]

interface AdminUser {
  id: string
  email: string
  name: string | null
  is_admin: boolean
}

export default function AdminUsersPage() {
  const { session, user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [error, setError] = useState('')

  // Confirmation dialog state
  const [pendingToggle, setPendingToggle] = useState<AdminUser | null>(null)
  const [toggling, setToggling] = useState(false)

  const fetchUsers = useCallback(async () => {
    if (!session?.accessToken) return
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    })
    if (search) {
      params.set('q', search)
    }

    try {
      const data = await fetchJSONWithAuth<{ users?: AdminUser[]; total?: number }>(
        `${API}/admin/users?${params}`,
        session.accessToken,
      )
      const usersList = data.users ?? []
      setUsers(usersList)
      setTotal(data.total ?? usersList.length)
    } catch (err) {
      setUsers([])
      setTotal(0)
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken, page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(0)
  }

  const confirmToggle = (user: AdminUser) => {
    // Prevent self-demotion
    if (user.email === currentUser?.email && user.is_admin) return
    setPendingToggle(user)
  }

  const executeToggle = async () => {
    if (!pendingToggle || !session?.accessToken) return
    setToggling(true)
    setError('')

    try {
      await fetchJSONWithAuth(
        `${API}/admin/users/${pendingToggle.id}/admin`,
        session.accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({ is_admin: !pendingToggle.is_admin }),
        },
      )
      setPendingToggle(null)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin access')
    } finally {
      setToggling(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage user accounts and admin privileges
        </p>
      </div>

      {/* Search */}
      <AdminSearchForm
        placeholder="Filter by email or name…"
        value={searchInput}
        onValueChange={setSearchInput}
        onSubmit={handleSearch}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Name</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Admin</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableSkeletonRows cells={userSkeletonCells} />
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.email === currentUser?.email
                return (
                  <tr key={u.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                          {(u.name || u.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{u.email}</p>
                          {isSelf && (
                            <p className="text-xs text-muted-foreground">You</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      {u.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Switch
                        checked={u.is_admin}
                        onCheckedChange={() => confirmToggle(u)}
                        disabled={isSelf && u.is_admin}
                        aria-label={`Toggle admin for ${u.email}`}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <AdminPagination
        total={total}
        page={page}
        totalPages={totalPages}
        itemLabel="users"
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />

      {/* Confirmation dialog */}
      <Dialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.is_admin ? 'Remove admin access' : 'Grant admin access'}
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.is_admin
                ? `${pendingToggle.email} will lose access to the admin panel immediately.`
                : `${pendingToggle?.email} will be able to manage stations and users. Make sure you trust this person.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingToggle(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingToggle?.is_admin ? 'destructive' : 'default'}
              onClick={executeToggle}
              disabled={toggling}
            >
              {toggling ? 'Saving…' : pendingToggle?.is_admin ? 'Remove access' : 'Grant access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
