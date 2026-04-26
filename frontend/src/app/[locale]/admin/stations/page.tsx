'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { useAdminSearch } from '../admin-search-context'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableSkeletonRows } from '@/components/admin/admin-table-skeleton-rows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { TagInput } from '@/components/ui/tag-input'
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
  { tdClassName: 'px-4 py-3 hidden lg:table-cell', skeletonClassName: 'h-4 w-20' },
  { tdClassName: 'px-4 py-3', skeletonClassName: 'h-7 w-16 ml-auto' },
]

interface AdminStation {
  id: string
  name: string
  logo?: string
  genre_tags: string[]
  country: string
  city: string
  featured: boolean
  status: string
  editorial_review?: string
}

interface CreateStationForm {
  name: string
  primary_stream_url: string
  genre_tags: string[]
  subgenre_tags: string[]
  country: string
  city: string
  language: string
  logo: string
  homepage: string
  style_tags: string[]
  format_tags: string[]
  texture_tags: string[]
  overview: string
  editorial_review: string
  internal_notes: string
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
  const { query: search } = useAdminSearch()
  const [appliedSearch, setAppliedSearch] = useState(search)
  const [stations, setStations] = useState<AdminStation[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createForm, setCreateForm] = useState<CreateStationForm>({
    name: '',
    primary_stream_url: '',
    genre_tags: [],
    subgenre_tags: [],
    country: '',
    city: '',
    language: '',
    logo: '',
    homepage: '',
    style_tags: [],
    format_tags: [],
    texture_tags: [],
    overview: '',
    editorial_review: '',
    internal_notes: '',
    status: 'pending',
    featured: false,
  })

  const streamURL = createForm.primary_stream_url.trim()
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
    if (appliedSearch) params.set('q', appliedSearch)

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
  }, [session?.accessToken, activeTab, page, appliedSearch])

  useEffect(() => {
    setPage(0)
    setAppliedSearch(search)
  }, [search])

  useEffect(() => { fetchStations() }, [fetchStations])

  const handleTabChange = (tab: string) => {
    const normalized = normalizeModerationStatus(tab)
    setActiveTab(normalized)
    setPage(0)
    router.replace(`/admin/stations?status=${normalized}`)
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
            streams: [{
              url: createForm.primary_stream_url.trim(),
              priority: 1,
              metadata_enabled: true,
            }],
            genre_tags: createForm.genre_tags,
            subgenre_tags: createForm.subgenre_tags,
            country: createForm.country.trim(),
            city: createForm.city.trim(),
            language: createForm.language.trim(),
            logo: createForm.logo.trim(),
            homepage: createForm.homepage.trim(),
            style_tags: createForm.style_tags,
            format_tags: createForm.format_tags,
            texture_tags: createForm.texture_tags,
            overview: createForm.overview.trim() || null,
            editorial_review: createForm.editorial_review.trim() || null,
            internal_notes: createForm.internal_notes.trim() || null,
            status: createForm.status,
            featured: createForm.featured,
          }),
        },
      )

      setCreateOpen(false)
      setCreateForm({
        name: '',
        primary_stream_url: '',
        genre_tags: [],
        subgenre_tags: [],
        country: '',
        city: '',
        language: '',
        logo: '',
        homepage: '',
        style_tags: [],
        format_tags: [],
        texture_tags: [],
        overview: '',
        editorial_review: '',
        internal_notes: '',
        status: 'pending',
        featured: false,
      })

      const nextStatus = normalizeModerationStatus(created.status || createForm.status)
      if (nextStatus !== activeTab) {
        setActiveTab(nextStatus)
        setPage(0)
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

      {/* Status selector */}
      <div className="flex items-center gap-4">
        {Object.entries(statusConfig).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabChange(key)}
            className={`relative px-3 py-2 text-base font-medium transition-colors ${
              activeTab === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {activeTab === key && (
              <span className="ui-nav-underline absolute bottom-0 left-0 right-0 h-[2px] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{t('selected', { count: selected.size })}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => bulkAction('approved')}
              className="ui-admin-status-success-badge hover:brightness-[1.03]"
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t('field_city')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t('col_country')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <AdminTableSkeletonRows cells={stationSkeletonCells} />
            ) : stations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-sm">
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
                      <Link
                        href={`/admin/stations/${s.id}`}
                        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
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
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground select-none">
                              {s.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="truncate font-medium leading-tight transition-colors hover:text-foreground/80">{s.name}</span>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{(s.genre_tags ?? []).join(', ') || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.city || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.country || '—'}</td>
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
                  value={createForm.primary_stream_url}
                  onChange={(e) => setCreateForm((p) => ({ ...p, primary_stream_url: e.target.value }))}
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
                <label className="text-xs text-muted-foreground">Genre tags</label>
                <TagInput value={createForm.genre_tags} onChange={(next) => setCreateForm((p) => ({ ...p, genre_tags: next }))} placeholder="Add genre, press Enter" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Subgenre tags</label>
                <TagInput value={createForm.subgenre_tags} onChange={(next) => setCreateForm((p) => ({ ...p, subgenre_tags: next }))} placeholder="Add subgenre, press Enter" />
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
                <label className="text-xs text-muted-foreground">Style tags</label>
                <TagInput value={createForm.style_tags} onChange={(next) => setCreateForm((p) => ({ ...p, style_tags: next }))} placeholder="Add style, press Enter" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Format tags</label>
                <TagInput value={createForm.format_tags} onChange={(next) => setCreateForm((p) => ({ ...p, format_tags: next }))} placeholder="Add format, press Enter" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Texture tags</label>
                <TagInput value={createForm.texture_tags} onChange={(next) => setCreateForm((p) => ({ ...p, texture_tags: next }))} placeholder="Add texture, press Enter" />
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
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Editorial review</label>
                <Textarea
                  rows={3}
                  value={createForm.editorial_review}
                  onChange={(e) => setCreateForm((p) => ({ ...p, editorial_review: e.target.value }))}
                  placeholder="Public editorial review shown on station details"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Internal notes</label>
                <Textarea
                  rows={3}
                  value={createForm.internal_notes}
                  onChange={(e) => setCreateForm((p) => ({ ...p, internal_notes: e.target.value }))}
                  placeholder="Private editorial notes for internal use"
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
            <Button type="submit" form="create-station-form" loading={createLoading} disabled={!canCreateStation}>
              {createLoading ? t('creating') : t('create_station')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
