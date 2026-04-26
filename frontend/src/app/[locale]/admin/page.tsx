'use client'

import { useEffect, useMemo, useState, type ElementType } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CheckCircleIcon,
  ClockIcon,
  RadioIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'

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

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
  subtitle,
}: {
  title: string
  value: number | null
  icon: ElementType
  tone: 'default' | 'critical' | 'success' | 'muted'
  subtitle: string
}) {
  const toneClass = {
    default: 'text-foreground bg-muted/60',
    critical: 'text-destructive bg-destructive-soft',
    success: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15',
    muted: 'text-muted-foreground bg-muted',
  }[tone]

  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardDescription className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</CardDescription>
          {value === null ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <CardTitle className="text-3xl font-semibold tracking-[-0.04em]">{value.toLocaleString()}</CardTitle>
          )}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
          <Icon className="h-5 w-5" weight="fill" />
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function MetricCard({ metric }: { metric: OverviewMetric }) {
  const badgeVariant = metric.severity === 'critical' ? 'destructive' : metric.severity === 'warning' ? 'secondary' : 'outline'
  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-medium">{metric.label}</CardTitle>
          <Badge variant={badgeVariant}>{metric.severity}</Badge>
        </div>
        <div className="text-3xl font-semibold tracking-[-0.04em]">{metric.value.toLocaleString()}</div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm leading-6 text-muted-foreground">{metric.description}</p>
      </CardContent>
    </Card>
  )
}

function issueBadgeVariant(severity: OverviewIssue['severity']): 'destructive' | 'secondary' | 'outline' {
  if (severity === 'critical') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
}

function StationWatchRow({ station }: { station: OverviewStation }) {
  const reliabilityPercent = Math.round(Math.max(0, Math.min(1, station.reliability_score || 0)) * 100)
  const location = [station.city || undefined, station.country || undefined].filter(Boolean).join(', ')

  return (
    <Link href={`/admin/stations/${station.id}`} className="block rounded-2xl border border-border/60 bg-background/70 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5">
            {station.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={station.logo} alt="" className="h-10 w-10 rounded-xl object-cover bg-muted" loading="lazy" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-sm font-semibold uppercase text-muted-foreground">
                {station.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-medium text-foreground">{station.name}</p>
                {station.featured ? <Badge variant="outline">featured</Badge> : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">{location || 'Location not set'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {station.issues.map((issue) => (
              <Badge key={`${station.id}-${issue.code}`} variant={issueBadgeVariant(issue.severity)}>
                {issue.label}
              </Badge>
            ))}
          </div>
          <div className="space-y-1">
            {station.issues.slice(0, 2).map((issue) => (
              <p key={`${station.id}-${issue.code}-detail`} className="text-sm leading-6 text-muted-foreground">
                {issue.detail}
              </p>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reliability</p>
          <p className="text-xl font-semibold tracking-[-0.03em]">{reliabilityPercent}%</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Active streams</p>
          <p className="text-sm font-medium text-foreground">{station.active_streams}</p>
        </div>
      </div>
    </Link>
  )
}

function WatchSection({ section }: { section: OverviewSection }) {
  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl tracking-[-0.03em]">{section.title}</CardTitle>
            <CardDescription className="mt-1 max-w-xl text-sm leading-6">{section.description}</CardDescription>
          </div>
          <Badge variant={section.count > 0 ? 'secondary' : 'outline'}>{section.count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.stations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
            No approved stations currently fall into this watchlist.
          </div>
        ) : (
          section.stations.map((station) => <StationWatchRow key={station.id} station={station} />)
        )}
        {section.count > section.stations.length ? (
          <p className="text-sm text-muted-foreground">
            Showing the highest-priority {section.stations.length} stations in this bucket. Open the station catalog for the full list.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function AdminOverviewPage() {
  const t = useTranslations('admin')
  const { session } = useAuth()
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.accessToken) return

    setLoading(true)
    setError('')

    fetchJSONWithAuth<RawOverviewResponse>(`${API}/admin/overview`, session.accessToken)
      .then((data) => {
        if (!cancelled) {
          setOverview(normalizeOverviewResponse(data))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load admin overview')
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

  return (
    <div className="space-y-8">
      <div className="ui-admin-hero rounded-3xl border border-border/60 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">{t('panel_label')}</p>
            <h1 className="text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">{t('overview_title')}</h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Approved-station operations view. Every metric and watchlist below is computed from approved stations only, so the page stays focused on catalog health, breakage, and editorial gaps that need action.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">Approved only</Badge>
            <Link href="/admin/stations?status=approved" className="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
              Open approved stations
            </Link>
          </div>
        </div>
        {generatedAtLabel ? (
          <p className="mt-5 text-sm text-muted-foreground">Last refreshed {generatedAtLabel}</p>
        ) : null}
      </div>

      {loading ? <OverviewSkeleton /> : null}

      {!loading && error ? (
        <Card className="border-destructive/30 bg-destructive-soft/30">
          <CardHeader>
            <CardTitle className="text-lg">Unable to load overview</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!loading && overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Approved stations"
              value={overview.summary.approved_stations}
              icon={RadioIcon}
              tone="default"
              subtitle="The live curated catalog currently visible to listeners."
            />
            <SummaryCard
              title="Need action"
              value={overview.summary.stations_needing_action}
              icon={WarningCircleIcon}
              tone="critical"
              subtitle="Approved stations with at least one operational, metadata, or editorial issue."
            />
            <SummaryCard
              title="Healthy stations"
              value={overview.summary.healthy_stations}
              icon={CheckCircleIcon}
              tone="success"
              subtitle="Approved stations with no current issues detected by this overview."
            />
            <SummaryCard
              title="Active streams"
              value={overview.summary.active_streams}
              icon={ClockIcon}
              tone="muted"
              subtitle="Configured active stream variants across the approved catalog."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overview.metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>

          <div className="grid gap-6 2xl:grid-cols-3">
            {overview.sections.map((section) => (
              <WatchSection key={section.id} section={section} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
