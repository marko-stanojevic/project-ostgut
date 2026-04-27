'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { useAdminSearch } from '../admin-search-context'
import { listAdminUsers, setAdminUserRole, type AdminUser, type AdminUserRole } from '@/lib/admin-users'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableSkeletonRows } from '@/components/admin/admin-table-skeleton-rows'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PAGE_SIZE = 50

const userSkeletonCells = [
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-4 w-48' },
  { tdClassName: 'px-4 py-3 hidden md:table-cell', skeletonClassName: 'h-4 w-28' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-5 w-16 rounded-full' },
  { tdClassName: 'px-4 py-3 text-right', skeletonClassName: 'h-5 w-10 ml-auto' },
]

const ROLE_OPTIONS: AdminUserRole[] = ['user', 'editor', 'admin']

interface PendingRoleChange {
  user: AdminUser
  nextRole: AdminUserRole
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
  const [pendingChange, setPendingChange] = useState<PendingRoleChange | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    if (!session?.accessToken) return
    setLoading(true)
    setError('')

    try {
      const data = await listAdminUsers(session.accessToken, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: appliedSearch,
      })
      setUsers(data.users)
      setTotal(data.total)
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

  const requestRoleChange = (user: AdminUser, nextRole: AdminUserRole) => {
    if (nextRole === user.role) return
    // Prevent self-demotion: an admin cannot change their own role.
    if (user.email === currentUser?.email && user.role === 'admin') return
    setPendingChange({ user, nextRole })
  }

  const executeRoleChange = async () => {
    if (!pendingChange || !session?.accessToken) return
    setSaving(true)
    setError('')

    try {
      await setAdminUserRole(session.accessToken, pendingChange.user.id, pendingChange.nextRole)
      setPendingChange(null)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSaving(false)
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
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('col_role')}</th>
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
                const lockSelfAdmin = isSelf && u.role === 'admin'
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
                      {u.name || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Select
                          value={u.role}
                          onValueChange={(value) => requestRoleChange(u, value as AdminUserRole)}
                          disabled={lockSelfAdmin}
                        >
                          <SelectTrigger size="sm" aria-label={`Role for ${u.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {t(`role_${role}` as 'role_user' | 'role_editor' | 'role_admin')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
      <Dialog open={!!pendingChange} onOpenChange={(open) => !open && setPendingChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('change_role_title')}</DialogTitle>
            <DialogDescription>
              {pendingChange
                ? t('change_role_description', {
                    email: pendingChange.user.email,
                    role: t(
                      `role_${pendingChange.nextRole}` as 'role_user' | 'role_editor' | 'role_admin',
                    ),
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChange(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant={pendingChange?.nextRole === 'user' ? 'destructive' : 'default'}
              onClick={executeRoleChange}
              disabled={saving}
            >
              {saving ? t('saving') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
