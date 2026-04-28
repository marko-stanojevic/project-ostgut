'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  getAdminDiagnostics,
  triggerAdminJob,
  type AdminDiagnosticItem,
  type AdminDiagnosticKind,
  type AdminDiagnosticResponse,
  type AdminDiagnosticSection,
  type AdminDiagnosticStatusCheck,
  type AdminJobTriggerID,
} from '@/lib/admin-diagnostics'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'

const jobActions: Array<{
  id: AdminJobTriggerID
  statusCheckID: string
  title: string
  description: string
  buttonLabel: string
}> = [
  {
    id: 'station-sync',
    statusCheckID: 'station_sync',
    title: 'Station sync',
    description: 'Fetch Radio Browser updates and persist imported stations as pending editorial candidates.',
    buttonLabel: 'Run sync',
  },
  {
    id: 'stream-reprobe',
    statusCheckID: 'stream_probe',
    title: 'Stream re-probe',
    description: 'Refresh active stream resolution, audio format evidence, metadata resolver routing, and health score.',
    buttonLabel: 'Run probe',
  },
  {
    id: 'metadata-fetch',
    statusCheckID: 'metadata',
    title: 'Metadata fetch',
    description: 'Fetch now-playing metadata across approved metadata-enabled streams without opening each station.',
    buttonLabel: 'Fetch metadata',
  },
]

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function StatusCheckCard({
  check,
  action,
  actionMessage,
  triggeringJob,
  pendingJobs,
  onTrigger,
}: {
  check: AdminDiagnosticStatusCheck
  action?: (typeof jobActions)[number]
  actionMessage?: string
  triggeringJob?: AdminJobTriggerID | null
  pendingJobs?: Set<AdminJobTriggerID>
  onTrigger?: (jobID: AdminJobTriggerID) => void
}) {
  const attention = check.status === 'attention'
  const isTriggering = action ? triggeringJob === action.id : false
  // Show running state if the server reports it OR if the user triggered this job and it hasn't settled yet.
  const isRunning = check.running || (action ? (pendingJobs?.has(action.id) ?? false) : false)

  return (
    <section className="rounded-2xl border border-border/60 bg-background/60 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{check.label}</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{check.detail}</p>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isRunning ? 'animate-pulse bg-sky-500 dark:bg-sky-400' : attention ? 'bg-amber-500 dark:bg-amber-400' : 'bg-emerald-500 dark:bg-emerald-400'}`}
          aria-hidden
        />
      </div>
      {action && onTrigger ? (
        <div className="mt-4 border-t border-border/50 pt-4">
          <p className="text-xs leading-5 text-muted-foreground">{action.description}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isTriggering}
              disabled={isRunning && !isTriggering}
              leadingIcon={<ArrowsClockwiseIcon />}
              onClick={() => onTrigger(action.id)}
            >
              {action.buttonLabel}
            </Button>
            {isRunning ? (
              <p className="text-xs leading-5 text-sky-600 dark:text-sky-400 sm:text-right">Running…</p>
            ) : actionMessage ? (
              <p className="text-xs leading-5 text-muted-foreground sm:text-right">{actionMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DiagnosticItemRow({ item }: { item: AdminDiagnosticItem }) {
  const attention = item.tone === 'attention'

  return (
    <div className="grid gap-3 border-t border-border/50 px-5 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] sm:items-start">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{item.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
      </div>
      <p className={`break-words text-left text-sm font-semibold tabular-nums sm:text-right ${attention ? 'text-amber-600 dark:text-amber-300' : 'text-foreground'}`}>
        {item.value}
      </p>
    </div>
  )
}

function DiagnosticSectionPanel({ section }: { section: AdminDiagnosticSection }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-background/60">
      <header className="border-b border-border/60 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">{section.title}</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{section.description}</p>
      </header>
      <div>
        {section.items.map((item) => (
          <DiagnosticItemRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function DiagnosticsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border/60 bg-background/60 px-5 py-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, index) => (
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
    </div>
  )
}

export function AdminDiagnosticsPage({ kind }: { kind: AdminDiagnosticKind }) {
  const { session } = useAuth()
  const [diagnostics, setDiagnostics] = useState<AdminDiagnosticResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [triggeringJob, setTriggeringJob] = useState<AdminJobTriggerID | null>(null)
  const [triggerMessage, setTriggerMessage] = useState<{ jobID: AdminJobTriggerID; message: string } | null>(null)
  // Jobs the user explicitly triggered that haven't yet been confirmed idle by a post-trigger poll.
  const [pendingJobs, setPendingJobs] = useState<Set<AdminJobTriggerID>>(new Set())

  useEffect(() => {
    let cancelled = false
    if (!session?.accessToken) return

    setLoading(true)
    setError('')

    getAdminDiagnostics(session.accessToken, kind)
      .then((data) => {
        if (!cancelled) {
          setDiagnostics(data)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load diagnostics')
          setDiagnostics(null)
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
  }, [kind, session?.accessToken])

  // Poll every 2s while any job is running server-side or the user triggered one that hasn't settled yet.
  useEffect(() => {
    const token = session?.accessToken
    if (!token || !diagnostics) return
    const hasRunning = diagnostics.status_checks.some((c) => c.running)
    if (!hasRunning && pendingJobs.size === 0) return

    const timer = setInterval(() => {
      getAdminDiagnostics(token, kind)
        .then(applyDiagnostics)
        .catch(() => {/* silent — polling failure should not flash an error */})
    }, 2000)

    return () => clearInterval(timer)
  // applyDiagnostics is defined in the same render scope, no need to list it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics, pendingJobs, kind, session?.accessToken])

  const generatedAtLabel = useMemo(() => {
    if (!diagnostics?.generated_at) return ''
    return formatDateTime(diagnostics.generated_at)
  }, [diagnostics?.generated_at])

  const needsAttention = useMemo(
    () => diagnostics?.status_checks.some((check) => check.status === 'attention') ?? false,
    [diagnostics?.status_checks],
  )

  function applyDiagnostics(data: AdminDiagnosticResponse) {
    setDiagnostics(data)
    setPendingJobs((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      for (const check of data.status_checks) {
        const action = jobActions.find((a) => a.statusCheckID === check.id)
        if (action && !check.running) next.delete(action.id)
      }
      return next.size === prev.size ? prev : next
    })
    setTriggerMessage((msg) => {
      if (!msg) return null
      const action = jobActions.find((a) => a.id === msg.jobID)
      if (!action) return null
      const check = data.status_checks.find((c) => c.id === action.statusCheckID)
      return check?.running ? msg : null
    })
  }

  async function handleTriggerJob(jobID: AdminJobTriggerID) {
    if (!session?.accessToken || triggeringJob) return

    setTriggeringJob(jobID)
    setTriggerMessage(null)
    try {
      const response = await triggerAdminJob(session.accessToken, jobID)
      setTriggerMessage({ jobID, message: response.message })
      if (response.status === 'started') {
        setPendingJobs((prev) => new Set(prev).add(jobID))
      }
      const nextDiagnostics = await getAdminDiagnostics(session.accessToken, kind)
      // Use setDiagnostics directly here — applyDiagnostics would drain pendingJobs
      // in the same React batch as the setPendingJobs(add) above, cancelling it out
      // if the job finished before the diagnostics fetch returned. The polling effect
      // handles draining once the server confirms running=false.
      setDiagnostics(nextDiagnostics)
    } catch (err) {
      setTriggerMessage({ jobID, message: err instanceof Error ? err.message : 'Failed to trigger job' })
    } finally {
      setTriggeringJob(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="ui-section-title">Diagnostics</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {diagnostics?.title ?? 'Diagnostics'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {diagnostics?.description ?? 'Loading diagnostic data.'}
          </p>
          {generatedAtLabel ? <p className="mt-2 text-xs text-muted-foreground">Refreshed {generatedAtLabel}</p> : null}
        </div>
        {diagnostics ? (
          <div className="rounded-full border border-border/60 bg-background/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {needsAttention ? 'Attention needed' : 'Operational'}
          </div>
        ) : null}
      </div>

      {loading && !diagnostics ? <DiagnosticsSkeleton /> : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive-soft/30 px-5 py-4">
          <p className="text-sm font-medium text-destructive">Unable to load diagnostics</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {diagnostics ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {diagnostics.status_checks.map((check) => {
              const action = kind === 'jobs' ? jobActions.find((jobAction) => jobAction.statusCheckID === check.id) : undefined
              const actionMessage = action && triggerMessage?.jobID === action.id ? triggerMessage.message : undefined

              return (
                <StatusCheckCard
                  key={check.id}
                  check={check}
                  action={action}
                  actionMessage={actionMessage}
                  triggeringJob={triggeringJob}
                  pendingJobs={pendingJobs}
                  onTrigger={handleTriggerJob}
                />
              )
            })}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {diagnostics.sections.map((section) => (
              <DiagnosticSectionPanel key={section.id} section={section} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
