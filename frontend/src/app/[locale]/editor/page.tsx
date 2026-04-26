'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { Skeleton } from '@/components/ui/skeleton'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

type OverviewResponse = {
  summary: {
    approved_stations: number
    featured_stations: number
    stations_needing_action: number
    healthy_stations: number
    active_streams: number
  }
  metrics: OverviewMetric[]
  sections: OverviewSection[]
  generated_at: string
}

type RawOverviewResponse = {
  summary?: Partial<OverviewResponse['summary']> | null
  metrics?: OverviewMetric[] | null
  sections?: Array<Partial<OverviewSection> | null> | null
  generated_at?: string | null
}

type OverviewMetric = {
  id: string
  label: string
  value: number
  severity: 'critical' | 'warning' | 'notice'
  description: string
}

type OverviewSection = {
  id: string
  title: string
  description: string
  severity: 'critical' | 'warning' | 'notice'
  count: number
  stations: OverviewStation[]
}

type OverviewStation = {
  id: string
  name: string
  logo?: string
  country: string
  city: string
  featured: boolean
  reliability_score: number
  active_streams: number
  issues: OverviewIssue[]
}

type OverviewIssue = {
  code: string
  label: string
  detail: string
  severity: 'critical' | 'warning' | 'notice'
}

function normalizeOverviewIssue(issue: Partial<OverviewIssue> | null | undefined): OverviewIssue | null {
  if (!issue?.code || !issue?.label) return null
  return {
    code: issue.code,
    label: issue.label,
    detail: issue.detail || '',
    severity:
      issue.severity === 'critical' || issue.severity === 'warning' || issue.severity === 'notice'
        ? issue.severity
        : 'notice',
  }
}

function normalizeOverviewStation(station: Partial<OverviewStation> | null | undefined): OverviewStation | null {
  if (!station?.id || !station?.name) return null
  return {
    id: station.id,
    name: station.name,
    logo: station.logo || undefined,
    country: station.country || '',
    city: station.city || '',
    featured: Boolean(station.featured),
    reliability_score: typeof station.reliability_score === 'number' ? station.reliability_score : 0,
    active_streams: typeof station.active_streams === 'number' ? station.active_streams : 0,
    issues: Array.isArray(station.issues)
      ? station.issues
          .map((issue) => normalizeOverviewIssue(issue))
          .filter((issue): issue is OverviewIssue => issue !== null)
      : [],
  }
}

function normalizeOverviewSection(section: Partial<OverviewSection> | null | undefined): OverviewSection | null {
  if (!section?.id || !section?.title) return null
  const stations = Array.isArray(section.stations)
    ? section.stations
        .map((station) => normalizeOverviewStation(station))
        .filter((station): station is OverviewStation => station !== null)
    : []

  return {
    id: section.id,
    title: section.title,
    description: section.description || '',
    severity:
      section.severity === 'critical' || section.severity === 'warning' || section.severity === 'notice'
        ? section.severity
        : 'notice',
    count: typeof section.count === 'number' ? section.count : stations.length,
    stations,
  }
}

function normalizeOverviewResponse(payload: RawOverviewResponse): OverviewResponse {
  return {
    summary: {
      approved_stations: payload.summary?.approved_stations ?? 0,
      featured_stations: payload.summary?.featured_stations ?? 0,
      stations_needing_action: payload.summary?.stations_needing_action ?? 0,
      healthy_stations: payload.summary?.healthy_stations ?? 0,
      active_streams: payload.summary?.active_streams ?? 0,
    },
    metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
    sections: Array.isArray(payload.sections)
      ? payload.sections
          .map((section) => normalizeOverviewSection(section))
          .filter((section): section is OverviewSection => section !== null)
      : [],
    generated_at: payload.generated_at || '',
  }
}

const severityMeta: Record<OverviewSection['severity'], { glyph: string; label: string; toneClass: string; dotClass: string }> = {
  critical: {
    glyph: '▲',
    label: 'Critical',
    toneClass: 'text-destructive',
    dotClass: 'bg-destructive',
  },
  warning: {
    glyph: '●',
    label: 'Warning',
    toneClass: 'text-foreground',
    dotClass: 'bg-amber-500 dark:bg-amber-400',
  },
  notice: {
    glyph: '○',
    label: 'Notice',
    toneClass: 'text-muted-foreground',
    dotClass: 'bg-muted-foreground/60',
  },
}

function StatusStat({
  label,
  value,
  hint,
  emphasize = false,
  loading,
}: {
  label: string
  value: number | string
  hint?: string
  emphasize?: boolean
  loading?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span
          className={`text-2xl font-semibold tracking-tight tabular-nums ${
            emphasize ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {value}
        </span>
      )}
      {hint ? (
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

function StationRow({ station }: { station: OverviewStation }) {
  const reliabilityPercent = Math.round(Math.max(0, Math.min(1, station.reliability_score || 0)) * 100)
  const location = [station.city || undefined, station.country || undefined].filter(Boolean).join(', ')
  const dominantIssue = station.issues[0]

  return (
    <Link
      href={`/editor/stations/${station.id}`}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40"
    >
      {station.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={station.logo} alt="" className="h-8 w-8 rounded-md bg-muted object-cover" loading="lazy" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-semibold uppercase text-muted-foreground">
          {station.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{station.name}</span>
          {station.featured ? (
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">featured</span>
          ) : null}
        </div>
        <span className="block truncate text-xs text-muted-foreground">{location || 'Location not set'}</span>
      </div>
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
        {dominantIssue?.label ?? ''}
      </span>
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
        {station.active_streams}{' '}
        <span className="text-muted-foreground/70">str</span>
      </span>
      <span className="text-xs font-medium tabular-nums text-foreground">{reliabilityPercent}%</span>
    </Link>
  )
}

function SeverityQueuePanel({
  section,
}: {
  section: OverviewSection | null
}) {
  if (!section) {
    return (
      <section className="rounded-2xl border border-border/60 bg-background/60">
        <header className="flex items-baseline justify-between gap-4 border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">Queue</h2>
          <span className="text-xs text-muted-foreground">0 items</span>
        </header>
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No stations in this bucket.
        </p>
      </section>
    )
  }

  const meta = severityMeta[section.severity]
  const visibleStations = section.stations.slice(0, 6)

  return (
    <section className="rounded-2xl border border-border/60 bg-background/60">
      <header className="flex items-baseline justify-between gap-4 border-b border-border/60 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <div className={`flex items-center gap-2 ${meta.toneClass}`}>
            <span className="text-[10px]">{meta.glyph}</span>
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">{meta.label}</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {section.count.toLocaleString()} {section.count === 1 ? 'item' : 'items'}
          </span>
        </div>
        <Link
          href="/editor/stations?status=approved"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          See all →
        </Link>
      </header>
      <div className="border-b border-border/60 px-5 py-3">
        <p className="text-xs leading-5 text-muted-foreground">{section.title}</p>
      </div>
      <div>
        {visibleStations.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No stations in this bucket.
          </p>
        ) : (
          <div className="pb-1">
            {visibleStations.map((station) => (
              <StationRow key={station.id} station={station} />
            ))}
            {section.count > visibleStations.length ? (
              <p className="px-5 py-1.5 text-[11px] text-muted-foreground">
                +{section.count - visibleStations.length} more in this bucket
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

function SystemHealthPanel({ metrics }: { metrics: OverviewMetric[] }) {
  const max = useMemo(() => metrics.reduce((acc, m) => Math.max(acc, m.value), 0), [metrics])
  const total = useMemo(() => metrics.reduce((acc, m) => acc + m.value, 0), [metrics])

  return (
    <section className="rounded-2xl border border-border/60 bg-background/60">
      <header className="flex items-baseline justify-between gap-4 border-b border-border/60 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">System health</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total.toLocaleString()} open
        </span>
      </header>
      <div className="space-y-3 px-5 py-4">
        {metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No metric signals reported.</p>
        ) : (
          metrics.map((metric) => {
            const pct = max > 0 ? Math.max(2, Math.round((metric.value / max) * 100)) : 0
            const meta = severityMeta[(metric.severity as OverviewSection['severity']) ?? 'notice'] ?? severityMeta.notice
            return (
              <div key={metric.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden />
                    <span className="font-medium text-foreground">{metric.label}</span>
                  </div>
                  <span className="font-semibold tabular-nums text-foreground">{metric.value.toLocaleString()}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${meta.dotClass}`}
                    style={{ width: metric.value > 0 ? `${pct}%` : '0%' }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function StatusBarSkeleton() {
  return (
    <div className="grid grid-cols-2 divide-x divide-border/60 rounded-2xl border border-border/60 bg-background/60 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatusStat key={i} label="" value="" loading />
      ))}
    </div>
  )
}

function CockpitSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border/60 bg-background/60 p-5 lg:col-span-2">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-background/60 p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function EditorOverviewPage() {
  const t = useTranslations('editor')
  const { session } = useAuth()
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.accessToken) return

    setLoading(true)
    setError('')

    fetchJSONWithAuth<RawOverviewResponse>(`${API}/editor/overview`, session.accessToken)
      .then((data) => {
        if (!cancelled) {
          setOverview(normalizeOverviewResponse(data))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load editor overview')
          setOverview(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session?.accessToken])

  const generatedAtLabel = useMemo(() => {
    if (!overview?.generated_at) return ''
    const date = new Date(overview.generated_at)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }, [overview?.generated_at])

  const healthyPercent = useMemo(() => {
    if (!overview) return null
    const approved = overview.summary.approved_stations
    if (approved <= 0) return 0
    return Math.round((overview.summary.healthy_stations / approved) * 100)
  }, [overview])

  const criticalSection = useMemo(
    () => overview?.sections.find((section) => section.severity === 'critical') ?? null,
    [overview],
  )

  const warningSection = useMemo(
    () => overview?.sections.find((section) => section.severity === 'warning') ?? null,
    [overview],
  )

  const noticeSection = useMemo(
    () => overview?.sections.find((section) => section.severity === 'notice') ?? null,
    [overview],
  )

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <p className="ui-section-title">{t('panel_label')}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('overview_title')}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {generatedAtLabel ? <span>Refreshed {generatedAtLabel}</span> : null}
        </div>
      </div>

      {loading && !overview ? (
        <StatusBarSkeleton />
      ) : (
        <div className="grid grid-cols-2 divide-x divide-border/60 rounded-2xl border border-border/60 bg-background/60 sm:grid-cols-4">
          <StatusStat
            label="Approved"
            value={(overview?.summary.approved_stations ?? 0).toLocaleString()}
            hint="live in catalog"
          />
          <StatusStat
            label="Healthy"
            value={(overview?.summary.healthy_stations ?? 0).toLocaleString()}
            hint={healthyPercent !== null ? `${healthyPercent}% of approved` : undefined}
          />
          <StatusStat
            label="Need action"
            value={(overview?.summary.stations_needing_action ?? 0).toLocaleString()}
            hint="open issues"
            emphasize={(overview?.summary.stations_needing_action ?? 0) > 0}
          />
          <StatusStat
            label="Active streams"
            value={(overview?.summary.active_streams ?? 0).toLocaleString()}
            hint="across catalog"
          />
        </div>
      )}

      {!loading && error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive-soft/30 px-5 py-4">
          <p className="text-sm font-medium text-destructive">Unable to load overview</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {loading && !overview ? <CockpitSkeleton /> : null}

      {!loading && overview ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <SeverityQueuePanel section={criticalSection} />
          </div>
          <div>
            <SeverityQueuePanel section={warningSection} />
          </div>
          <div>
            <SystemHealthPanel metrics={overview.metrics} />
          </div>
          {noticeSection ? (
            <div className="lg:col-span-2">
              <SeverityQueuePanel section={noticeSection} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
