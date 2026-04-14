'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { AdminSearchForm } from '@/components/admin/admin-search-form'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableSkeletonRows } from '@/components/admin/admin-table-skeleton-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 50

const stationSkeletonCells = [
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-4 w-4' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-4 w-40' },
  { tdClassName: 'px-4 py-3 hidden md:table-cell', skeletonClassName: 'h-4 w-20' },
  { tdClassName: 'px-4 py-3 hidden lg:table-cell', skeletonClassName: 'h-4 w-16' },
  { tdClassName: 'px-4 py-3 hidden lg:table-cell', skeletonClassName: 'h-4 w-16' },
  { tdClassName: 'px-4 py-3 hidden xl:table-cell', skeletonClassName: 'h-2 w-20' },
  { tdClassName: 'px-4 py-3 hidden xl:table-cell', skeletonClassName: 'h-5 w-10 mx-auto' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-5 w-16 rounded-full' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-7 w-16 ml-auto' },
]

interface AdminStation {
  id: string
  name: string
  logo?: string
  genre: string
  country: string
  bitrate: number
  codec: string
  reliability_score: number
  featured: boolean
  status: string
  custom_description?: string
  editor_notes?: string
}

const statusConfig = {
  pending: { label: 'Pending', variant: 'secondary' as const, icon: ClockIcon },
  approved: { label: 'Approved', variant: 'default' as const, icon: CheckCircleIcon },
  rejected: { label: 'Rejected', variant: 'destructive' as const, icon: XCircleIcon },
}

function ReliabilityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

export default function AdminStationsPage() {
  const { session } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'pending')
  const [stations, setStations] = useState<AdminStation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [updatingStaffPickIDs, setUpdatingStaffPickIDs] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const fetchStations = useCallback(async () => {
    if (!session?.accessToken) return
    setLoading(true)
    setError('')
    setSelected(new Set())

    const params = new URLSearchParams({
      status: activeTab,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    })
    if (search) params.set('q', search)

    try {
      const data = await fetchJSONWithAuth<{ stations?: AdminStation[]; count?: number }>(
        `${API}/admin/stations?${params}`,
        session.accessToken,
      )
      setStations(data.stations ?? [])
      setTotal(data.count ?? 0)
    } catch (err) {
      setStations([])
      setTotal(0)
      setError(err instanceof Error ? err.message : 'Failed to load stations')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken, activeTab, page, search])

  useEffect(() => { fetchStations() }, [fetchStations])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setPage(0)
    setSearch('')
    setSearchInput('')
    router.replace(`/admin/stations?status=${tab}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(0)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === stations.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(stations.map((s) => s.id)))
    }
  }

  const bulkAction = async (status: string) => {
    if (selected.size === 0 || !session?.accessToken) return
    setBulkLoading(true)
    setError('')

    try {
      await fetchJSONWithAuth(
        `${API}/admin/stations/bulk`,
        session.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(selected), status }),
        },
      )
      await fetchStations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const toggleStaffPick = async (stationID: string, nextValue: boolean) => {
    if (!session?.accessToken) return
    setError('')

    setUpdatingStaffPickIDs((prev) => new Set(prev).add(stationID))
    setStations((prev) => prev.map((s) => (s.id === stationID ? { ...s, featured: nextValue } : s)))

    try {
      await fetchJSONWithAuth(
        `${API}/admin/stations/${stationID}`,
        session.accessToken,
        {
          method: 'PUT',
          body: JSON.stringify({ featured: nextValue }),
        },
      )
    } catch (err) {
      setStations((prev) => prev.map((s) => (s.id === stationID ? { ...s, featured: !nextValue } : s)))
      setError(err instanceof Error ? err.message : 'Failed to update Staff Pick')
    } finally {
      setUpdatingStaffPickIDs((prev) => {
        const next = new Set(prev)
        next.delete(stationID)
        return next
      })
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage the curated station catalog</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <AdminSearchForm
          placeholder="Search stations…"
          value={searchInput}
          onValueChange={setSearchInput}
          onSubmit={handleSearch}
          className="flex gap-2 w-full sm:w-auto sm:min-w-[18rem]"
        />

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => bulkAction('approved')}
              className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
            >
              <CheckCircleIcon className="h-3.5 w-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => bulkAction('rejected')}
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              <XCircleIcon className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
          </div>
        )}

        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="w-10 px-4 py-3 text-left">
                <Checkbox
                  checked={stations.length > 0 && selected.size === stations.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Station</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Genre</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Country</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Quality</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Reliability</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden xl:table-cell">Staff Pick</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableSkeletonRows cells={stationSkeletonCells} />
            ) : stations.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  No stations found
                </td>
              </tr>
            ) : (
              stations.map((s) => {
                const cfg = statusConfig[s.status as keyof typeof statusConfig]
                return (
                  <tr
                    key={s.id}
                    className={`border-b transition-colors hover:bg-muted/30 ${selected.has(s.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={() => toggleSelect(s.id)}
                        aria-label={`Select ${s.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium leading-tight">{s.name}</span>
                        {s.custom_description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">{s.custom_description}</span>
                        )}
                        {s.featured && (
                          <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 mt-0.5">Staff Pick</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.genre || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.country || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums text-muted-foreground">{s.bitrate}k</span>
                        {s.codec && <Badge variant="outline" className="text-[10px] px-1 py-0">{s.codec}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <ReliabilityBar score={s.reliability_score} />
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex justify-center">
                        <Switch
                          checked={s.featured}
                          disabled={updatingStaffPickIDs.has(s.id)}
                          onCheckedChange={(checked) => toggleStaffPick(s.id, !!checked)}
                          aria-label={`Toggle staff pick for ${s.name}`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cfg && (
                        <Badge variant={cfg.variant} className="gap-1">
                          <cfg.icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/stations/${s.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                          Edit
                          <ArrowSquareOutIcon className="h-3 w-3" />
                        </Button>
                      </Link>
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
        itemLabel="stations"
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}
