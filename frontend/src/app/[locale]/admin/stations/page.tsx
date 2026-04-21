'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { AdminSearchForm } from '@/components/admin/admin-search-form'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableSkeletonRows } from '@/components/admin/admin-table-skeleton-rows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const PAGE_SIZE = 50

const stationSkeletonCells = [
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-4 w-4' },
  { tdClassName: 'px-4 py-3', items: ['h-7 w-7 rounded shrink-0', 'h-4 w-36'] },
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
  genres: string[]
  country: string
  city: string
  reliability_score: number
  featured: boolean
  status: string
  editor_notes?: string
}

interface CreateStationForm {
  name: string
  stream_url: string
  genre: string
  country: string
  city: string
  country_code: string
  language: string
  logo: string
  homepage: string
  tags: string
  overview: string
  status: 'pending' | 'approved'
  featured: boolean
}

const statusVariants = {
  pending: { variant: 'secondary' as const, icon: ClockIcon },
  approved: { variant: 'default' as const, icon: CheckCircleIcon },
}

function normalizeModerationStatus(value: string | null | undefined): 'pending' | 'approved' {
  return value === 'approved' ? 'approved' : 'pending'
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

function isValidAbsoluteURL(value: string) {
  if (!value) return false
  try {
    const u = new URL(value)
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host)
  } catch {
    return false
  }
}

export default function AdminStationsPage() {
  const t = useTranslations('admin')
  const { session } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const statusConfig = {
    pending: { label: t('status_pending'), ...statusVariants.pending },
    approved: { label: t('status_approved'), ...statusVariants.approved },
  }

  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>(
    normalizeModerationStatus(searchParams.get('status')),
  )
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
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createForm, setCreateForm] = useState<CreateStationForm>({
    name: '',
    stream_url: '',
    genre: '',
    country: '',
    city: '',
    country_code: '',
    language: '',
    logo: '',
    homepage: '',
    tags: '',
    overview: '',
    status: 'approved',
    featured: false,
  })

  const streamURL = createForm.stream_url.trim()
  const logoURL = createForm.logo.trim()
  const homepageURL = createForm.homepage.trim()

  const isStreamURLValid = isValidAbsoluteURL(streamURL)
  const isLogoURLValid = logoURL === '' || isValidAbsoluteURL(logoURL)
  const isHomepageURLValid = homepageURL === '' || isValidAbsoluteURL(homepageURL)
  const canCreateStation = createForm.name.trim() !== '' && isStreamURLValid && isLogoURLValid && isHomepageURLValid

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
    const normalized = normalizeModerationStatus(tab)
    setActiveTab(normalized)
    setPage(0)
    setSearch('')
    setSearchInput('')
    router.replace(`/admin/stations?status=${normalized}`)
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

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.accessToken) return

    if (!canCreateStation) {
      setCreateError(t('fix_urls_error'))
      return
    }

    setCreateLoading(true)
    setCreateError('')

    try {
      const created = await fetchJSONWithAuth<AdminStation>(
        `${API}/admin/stations`,
        session.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            name: createForm.name.trim(),
            stream_url: createForm.stream_url.trim(),
            genres: createForm.genre.split(',').map((g) => g.trim()).filter(Boolean),
            country: createForm.country.trim(),
            city: createForm.city.trim(),
            country_code: createForm.country_code.trim().toUpperCase(),
            language: createForm.language.trim(),
            logo: createForm.logo.trim(),
            homepage: createForm.homepage.trim(),
            tags: createForm.tags
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
            overview: createForm.overview.trim() || null,
            status: createForm.status,
            featured: createForm.featured,
          }),
        },
      )

      setCreateOpen(false)
      setCreateForm({
        name: '',
        stream_url: '',
        genre: '',
        country: '',
        city: '',
        country_code: '',
        language: '',
        logo: '',
        homepage: '',
        tags: '',
        overview: '',
        status: 'approved',
        featured: false,
      })

      const nextStatus = normalizeModerationStatus(created.status || createForm.status)
      if (nextStatus !== activeTab) {
        setActiveTab(nextStatus)
        setPage(0)
        setSearch('')
        setSearchInput('')
        router.replace(`/admin/stations?status=${nextStatus}`)
      } else {
        await fetchStations()
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create station')
    } finally {
      setCreateLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('stations_title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('stations_description')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>{t('add_station')}</Button>
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
          placeholder={t('search_stations')}
          value={searchInput}
          onValueChange={setSearchInput}
          onSubmit={handleSearch}
          className="flex gap-2 w-full sm:w-auto sm:min-w-[18rem]"
        />

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{t('selected', { count: selected.size })}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => bulkAction('approved')}
              className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
            >
              <CheckCircleIcon className="h-3.5 w-3.5 mr-1.5" />
              {t('bulk_approve')}
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('col_station')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t('col_genre')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t('col_country')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t('col_quality')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">{t('col_reliability')}</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden xl:table-cell">{t('col_staff_pick')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableSkeletonRows cells={stationSkeletonCells} />
            ) : stations.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  {t('no_stations')}
                </td>
              </tr>
            ) : (
              stations.map((s) => {
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
                      <div className="flex items-center gap-2.5">
                        {s.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.logo}
                            alt=""
                            className="h-7 w-7 rounded shrink-0 object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded shrink-0 bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase select-none">
                            {s.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium leading-tight truncate">{s.name}</span>
                          {s.editor_notes && (
                            <span className="text-xs text-muted-foreground line-clamp-1">{s.editor_notes}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{(s.genres ?? []).join(', ') || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.country || '—'}</td>
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
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/stations/${s.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                          {t('edit')}
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
        itemLabel={t('stations_label')}
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
        onGoTo={(p) => setPage(p)}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('create_title')}</DialogTitle>
            <DialogDescription>
              {t('create_description')}
            </DialogDescription>
          </DialogHeader>

          <form id="create-station-form" onSubmit={handleCreateStation} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_name')}</label>
                <Input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_stream_url')}</label>
                <Input
                  required
                  type="url"
                  value={createForm.stream_url}
                  onChange={(e) => setCreateForm((p) => ({ ...p, stream_url: e.target.value }))}
                />
                {streamURL && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isStreamURLValid ? 'text-muted-foreground' : 'text-destructive'}>
                      {isStreamURLValid ? t('valid_url') : t('invalid_url')}
                    </span>
                    {isStreamURLValid && (
                      <a href={streamURL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {t('open_link')}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_genre')}</label>
                <Input value={createForm.genre} onChange={(e) => setCreateForm((p) => ({ ...p, genre: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_language')}</label>
                <Input value={createForm.language} onChange={(e) => setCreateForm((p) => ({ ...p, language: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_country')}</label>
                <Input value={createForm.country} onChange={(e) => setCreateForm((p) => ({ ...p, country: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_city')}</label>
                <Input value={createForm.city} onChange={(e) => setCreateForm((p) => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_country_code')}</label>
                <Input value={createForm.country_code} onChange={(e) => setCreateForm((p) => ({ ...p, country_code: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('field_logo')}</label>
                <Input type="url" value={createForm.logo} onChange={(e) => setCreateForm((p) => ({ ...p, logo: e.target.value }))} />
                {logoURL && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isLogoURLValid ? 'text-muted-foreground' : 'text-destructive'}>
                      {isLogoURLValid ? t('valid_url') : t('invalid_url')}
                    </span>
                    {isLogoURLValid && (
                      <a href={logoURL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {t('open_link')}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('field_homepage')}</label>
                <Input type="url" value={createForm.homepage} onChange={(e) => setCreateForm((p) => ({ ...p, homepage: e.target.value }))} />
                {homepageURL && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isHomepageURLValid ? 'text-muted-foreground' : 'text-destructive'}>
                      {isHomepageURLValid ? t('valid_url') : t('invalid_url')}
                    </span>
                    {isHomepageURLValid && (
                      <a href={homepageURL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {t('open_link')}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('field_tags')}</label>
                <Input value={createForm.tags} onChange={(e) => setCreateForm((p) => ({ ...p, tags: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('field_overview')}</label>
                <Textarea
                  rows={3}
                  value={createForm.overview}
                  onChange={(e) => setCreateForm((p) => ({ ...p, overview: e.target.value }))}
                  placeholder={t('field_overview_placeholder')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('field_status')}</label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value as CreateStationForm['status'] }))}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring"
                >
                  <option value="approved">{t('status_approved')}</option>
                  <option value="pending">{t('status_pending')}</option>
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={createForm.featured}
                  onCheckedChange={(checked) => setCreateForm((p) => ({ ...p, featured: !!checked }))}
                  aria-label="Set as staff pick"
                />
                <span className="text-xs text-muted-foreground">{t('staff_pick_label')}</span>
              </div>
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createLoading}>{t('cancel')}</Button>
            <Button type="submit" form="create-station-form" disabled={createLoading || !canCreateStation}>
              {createLoading ? t('creating') : t('create_station')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
