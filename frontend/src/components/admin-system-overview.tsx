'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  getAdminOverview,
  type AdminMetric,
  type AdminMetricGroup,
  type AdminOverviewResponse,
  type AdminStatusCheck,
} from '@/lib/admin-overview'
import { Skeleton } from '@/components/ui/skeleton'

const groupLinks: Record<string, { href: string; label: string }> = {
  users_access: { href: '/admin/users', label: 'Manage users' },
  content_pipeline: { href: '/editor/stations', label: 'Open editor' },
  media_storage: { href: '/admin/media', label: 'View details' },
}

function formatMetricValue(metric: AdminMetric) {
  if (metric.unit === 'bytes') {
    return formatBytes(metric.value)
  }

  return metric.value.toLocaleString()
}

function formatBytes(value: number) {
  if (value <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)
  return `${formatted} ${units[exponent]}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function StatusCheckCard({ check }: { check: AdminStatusCheck }) {
  const attention = check.status === 'attention'

  return (
    <section className="rounded-2xl border border-border/60 bg-background/60 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{check.label}</p>
          <p className="mt-2 truncate text-sm text-muted-foreground">{check.detail}</p>
        </div>
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${attention ? 'bg-amber-500 dark:bg-amber-400' : 'bg-emerald-500 dark:bg-emerald-400'}`}
          aria-hidden
        />
      </div>
    </section>
  )
}

function MetricRow({ metric }: { metric: AdminMetric }) {
  const attention = metric.tone === 'attention'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-border/50 px-5 py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{metric.label}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
      </div>
      <p className={`text-right text-2xl font-semibold tabular-nums tracking-tight ${attention ? 'text-amber-600 dark:text-amber-300' : 'text-foreground'}`}>
        {formatMetricValue(metric)}
      </p>
    </div>
  )
}

function MetricGroupPanel({ group }: { group: AdminMetricGroup }) {
  const action = groupLinks[group.id]

  return (
    <section className="rounded-2xl border border-border/60 bg-background/60">
      <header className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">{group.title}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{group.description}</p>
        </div>
        {action ? (
          <Link href={action.href} className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">
            {action.label} →
          </Link>
        ) : null}
      </header>
      <div>
        {group.metrics.map((metric) => (
          <MetricRow key={metric.id} metric={metric} />
        ))}
      </div>
    </section>
  )
}

function StatusSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-background/60 px-5 py-4">
          <Skeleton className="mb-3 h-3 w-20" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-background/60 p-5">
          <Skeleton className="mb-5 h-4 w-36" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((__, rowIndex) => (
              <Skeleton key={rowIndex} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function AdminSystemOverview() {
  const { session } = useAuth()
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.accessToken) return

    setLoading(true)
    setError('')

    getAdminOverview(session.accessToken)
      .then((data) => {
        if (!cancelled) {
          setOverview(data)
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
    return formatDateTime(overview.generated_at)
  }, [overview?.generated_at])

  const needsAttention = useMemo(
    () => overview?.status_checks.some((check) => check.status === 'attention') ?? false,
    [overview?.status_checks],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="ui-section-title">Admin panel</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">System overview</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Platform ownership, access, billing, content pipeline, and media storage at a glance.
          </p>
          {generatedAtLabel ? <p className="mt-2 text-xs text-muted-foreground">Refreshed {generatedAtLabel}</p> : null}
        </div>
        {overview ? (
          <div className="rounded-full border border-border/60 bg-background/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {needsAttention ? 'Attention needed' : 'Operational'}
          </div>
        ) : null}
      </div>

      {loading && !overview ? <StatusSkeleton /> : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive-soft/30 px-5 py-4">
          <p className="text-sm font-medium text-destructive">Unable to load admin overview</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {overview ? (
        <div className="grid gap-3 md:grid-cols-3">
          {overview.status_checks.map((check) => (
            <StatusCheckCard key={check.id} check={check} />
          ))}
        </div>
      ) : null}

      {loading && !overview ? <MetricsSkeleton /> : null}

      {overview ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {overview.metric_groups.map((group) => (
            <MetricGroupPanel key={group.id} group={group} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
