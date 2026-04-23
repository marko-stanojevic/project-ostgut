'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { useAdminSearch } from '../admin-search-context'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
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
  const t = useTranslations('admin')
  const { session, user: currentUser } = useAuth()
  const { query: search } = useAdminSearch()
  const [appliedSearch, setAppliedSearch] = useState(search)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
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
    if (appliedSearch) {
      params.set('q', appliedSearch)
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
  }, [session?.accessToken, page, appliedSearch])

  useEffect(() => {
    setPage(0)
    setAppliedSearch(search)
  }, [search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

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
        <h1 className="text-2xl font-semibold tracking-tight">{t('users_title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('users_description')}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('col_user')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t('col_name')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('col_admin')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableSkeletonRows cells={userSkeletonCells} />
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  {t('no_users')}
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
                            <p className="text-xs text-muted-foreground">{t('you')}</p>
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
        itemLabel={t('users_label')}
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />

      {/* Confirmation dialog */}
      <Dialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.is_admin ? t('remove_admin_title') : t('grant_admin_title')}
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.is_admin
                ? t('remove_admin_description', { email: pendingToggle.email })
                : t('grant_admin_description', { email: pendingToggle?.email ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingToggle(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant={pendingToggle?.is_admin ? 'destructive' : 'default'}
              onClick={executeToggle}
              disabled={toggling}
            >
              {toggling ? t('saving') : pendingToggle?.is_admin ? t('remove_access') : t('grant_access')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
