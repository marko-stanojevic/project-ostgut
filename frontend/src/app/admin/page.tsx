'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from '@phosphor-icons/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface Stats {
  pending: number
  approved: number
  rejected: number
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
    default:     'text-muted-foreground',
    pending:     'text-yellow-600 dark:text-yellow-400',
    success:     'text-green-600 dark:text-green-400',
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
  const { session } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ updated: number } | null>(null)

  const headers = {
    Authorization: `Bearer ${session?.accessToken}`,
    'Content-Type': 'application/json',
  }

  useEffect(() => {
    if (!session?.accessToken) return
    fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
  }, [session?.accessToken])

  // Quick-approve: approve all pending stations above a reliability threshold
  const handleQuickApprove = async (threshold: number) => {
    if (!session?.accessToken) return
    setBulkLoading(true)
    setBulkResult(null)

    try {
      // Fetch pending stations
      const r = await fetch(`${API}/admin/stations?status=pending&limit=500`, { headers })
      const data = await r.json()
      const stations = data.stations ?? []
      const eligible = stations
        .filter((s: { reliability_score: number }) => s.reliability_score >= threshold)
        .map((s: { id: string }) => s.id)

      if (eligible.length === 0) {
        setBulkResult({ updated: 0 })
        return
      }

      const res = await fetch(`${API}/admin/stations/bulk`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: eligible, status: 'approved' }),
      })
      const result = await res.json()
      setBulkResult(result)

      // Refresh stats
      const statsRes = await fetch(`${API}/admin/stats`, { headers })
      setStats(await statsRes.json())
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Station catalog health at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Stations"  value={stats?.total ?? null}    icon={RadioIcon}        variant="default"     href="/admin/stations" />
        <StatCard title="Pending Review"  value={stats?.pending ?? null}   icon={ClockIcon}        variant="pending"     href="/admin/stations?status=pending" />
        <StatCard title="Approved"        value={stats?.approved ?? null}  icon={CheckCircleIcon}  variant="success"     href="/admin/stations?status=approved" />
        <StatCard title="Rejected"        value={stats?.rejected ?? null}  icon={XCircleIcon}      variant="destructive" href="/admin/stations?status=rejected" />
      </div>

      {/* Quick Approve */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Quick Approve</CardTitle>
          <p className="text-sm text-muted-foreground">
            Approve all pending stations above a reliability threshold. Higher is safer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {bulkResult && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              {bulkResult.updated > 0
                ? `Approved ${bulkResult.updated} station${bulkResult.updated !== 1 ? 's' : ''}`
                : 'No stations matched the threshold'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Conservative (≥ 0.8)', threshold: 0.8 },
              { label: 'Balanced (≥ 0.6)',     threshold: 0.6 },
              { label: 'Inclusive (≥ 0.4)',    threshold: 0.4 },
            ].map(({ label, threshold }) => (
              <Button
                key={threshold}
                variant="outline"
                size="sm"
                disabled={bulkLoading || !stats?.pending}
                onClick={() => handleQuickApprove(threshold)}
              >
                {label}
              </Button>
            ))}
          </div>

          {stats?.pending === 0 && (
            <p className="text-xs text-muted-foreground">No pending stations to review.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
