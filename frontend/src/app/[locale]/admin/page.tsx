'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioIcon, CheckCircleIcon, ClockIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface Stats {
  pending: number
  approved: number
  total: number
}

function StatCard({
  title,
  value,
  icon: Icon,
  variant,
  href,
}: {
  title: string
  value: number | null
  icon: React.ElementType
  variant: 'default' | 'pending' | 'success' | 'destructive'
  href: string
}) {
  const colorMap = {
    default: 'text-muted-foreground',
    pending: 'text-warning',
    success: 'text-success',
    destructive: 'text-destructive',
  }
  return (
    <Link href={href}>
      <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className={`h-4 w-4 ${colorMap[variant]}`} />
        </CardHeader>
        <CardContent>
          {value === null ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export default function AdminOverviewPage() {
  const t = useTranslations('admin')
  const { session } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!session?.accessToken) return
    fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => { })
  }, [session?.accessToken])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('overview_title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('overview_description')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title={t('total_stations')} value={stats?.total ?? null} icon={RadioIcon} variant="default" href="/admin/stations" />
        <StatCard title={t('pending_review')} value={stats?.pending ?? null} icon={ClockIcon} variant="pending" href="/admin/stations?status=pending" />
        <StatCard title={t('approved_count')} value={stats?.approved ?? null} icon={CheckCircleIcon} variant="success" href="/admin/stations?status=approved" />
      </div>
    </div>
  )
}
