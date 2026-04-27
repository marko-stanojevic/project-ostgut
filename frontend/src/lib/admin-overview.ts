import { API_URL } from '@/lib/api'
import { requireArray, requireNumber, requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

const ADMIN_OVERVIEW_CONTRACT = 'admin overview payload'

export type AdminOverviewResponse = {
  status_checks: AdminStatusCheck[]
  metric_groups: AdminMetricGroup[]
  generated_at: string
}

export type AdminStatus = 'operational' | 'attention'
export type AdminMetricTone = 'neutral' | 'attention'

export type AdminStatusCheck = {
  id: string
  label: string
  status: AdminStatus
  detail: string
  checked_at: string
}

export type AdminMetricGroup = {
  id: string
  title: string
  description: string
  metrics: AdminMetric[]
}

export type AdminMetric = {
  id: string
  label: string
  value: number
  tone: AdminMetricTone
  detail: string
  unit?: string
}

export async function getAdminOverview(accessToken: string): Promise<AdminOverviewResponse> {
  const payload = await fetchJSONWithAuth(`${API_URL}/admin/overview`, accessToken)
  return parseAdminOverviewResponse(payload)
}

function parseAdminOverviewResponse(payload: unknown): AdminOverviewResponse {
  const response = requireRecord(payload, 'admin overview response', ADMIN_OVERVIEW_CONTRACT)
  const statusChecks = requireArray(response.status_checks, 'status_checks', ADMIN_OVERVIEW_CONTRACT)
  const metricGroups = requireArray(response.metric_groups, 'metric_groups', ADMIN_OVERVIEW_CONTRACT)

  return {
    status_checks: statusChecks.map((statusCheck, index) => parseStatusCheck(statusCheck, index)),
    metric_groups: metricGroups.map((group, index) => parseMetricGroup(group, index)),
    generated_at: requireString(response.generated_at, 'generated_at', ADMIN_OVERVIEW_CONTRACT),
  }
}

function parseStatusCheck(payload: unknown, index: number): AdminStatusCheck {
  const statusCheck = requireRecord(payload, `status_checks[${index}]`, ADMIN_OVERVIEW_CONTRACT)
  return {
    id: requireString(statusCheck.id, `status_checks[${index}].id`, ADMIN_OVERVIEW_CONTRACT),
    label: requireString(statusCheck.label, `status_checks[${index}].label`, ADMIN_OVERVIEW_CONTRACT),
    status: requireStatus(statusCheck.status, `status_checks[${index}].status`),
    detail: requireString(statusCheck.detail, `status_checks[${index}].detail`, ADMIN_OVERVIEW_CONTRACT),
    checked_at: requireString(statusCheck.checked_at, `status_checks[${index}].checked_at`, ADMIN_OVERVIEW_CONTRACT),
  }
}

function parseMetricGroup(payload: unknown, index: number): AdminMetricGroup {
  const group = requireRecord(payload, `metric_groups[${index}]`, ADMIN_OVERVIEW_CONTRACT)
  const metrics = requireArray(group.metrics, `metric_groups[${index}].metrics`, ADMIN_OVERVIEW_CONTRACT)

  return {
    id: requireString(group.id, `metric_groups[${index}].id`, ADMIN_OVERVIEW_CONTRACT),
    title: requireString(group.title, `metric_groups[${index}].title`, ADMIN_OVERVIEW_CONTRACT),
    description: requireString(group.description, `metric_groups[${index}].description`, ADMIN_OVERVIEW_CONTRACT),
    metrics: metrics.map((metric, metricIndex) => parseMetric(metric, index, metricIndex)),
  }
}

function parseMetric(payload: unknown, groupIndex: number, metricIndex: number): AdminMetric {
  const metricPath = `metric_groups[${groupIndex}].metrics[${metricIndex}]`
  const metric = requireRecord(payload, metricPath, ADMIN_OVERVIEW_CONTRACT)
  const unit = metric.unit === undefined || metric.unit === null
    ? undefined
    : requireString(metric.unit, `${metricPath}.unit`, ADMIN_OVERVIEW_CONTRACT)

  return {
    id: requireString(metric.id, `${metricPath}.id`, ADMIN_OVERVIEW_CONTRACT),
    label: requireString(metric.label, `${metricPath}.label`, ADMIN_OVERVIEW_CONTRACT),
    value: requireNumber(metric.value, `${metricPath}.value`, ADMIN_OVERVIEW_CONTRACT),
    tone: requireTone(metric.tone, `${metricPath}.tone`),
    detail: requireString(metric.detail, `${metricPath}.detail`, ADMIN_OVERVIEW_CONTRACT),
    unit,
  }
}

function requireStatus(value: unknown, field: string): AdminStatus {
  if (value === 'operational' || value === 'attention') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_OVERVIEW_CONTRACT}: ${field} must be operational or attention`)
}

function requireTone(value: unknown, field: string): AdminMetricTone {
  if (value === 'neutral' || value === 'attention') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_OVERVIEW_CONTRACT}: ${field} must be neutral or attention`)
}
