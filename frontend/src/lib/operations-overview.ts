import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

export type OverviewScope = 'admin' | 'editor'
export type OverviewSeverity = 'critical' | 'warning' | 'notice'

export type OverviewResponse = {
  summary: OverviewSummary
  metrics: OverviewMetric[]
  sections: OverviewSection[]
  generated_at: string
}

export type OverviewSummary = {
  approved_stations: number
  featured_stations: number
  stations_needing_action: number
  healthy_stations: number
  active_streams: number
}

export type OverviewMetric = {
  id: string
  label: string
  value: number
  severity: OverviewSeverity
  description: string
}

export type OverviewSection = {
  id: string
  title: string
  description: string
  severity: OverviewSeverity
  count: number
  stations: OverviewStation[]
}

export type OverviewStation = {
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

export type OverviewIssue = {
  code: string
  label: string
  detail: string
  severity: OverviewSeverity
}

const overviewPaths: Record<OverviewScope, string> = {
  admin: '/admin/overview',
  editor: '/editor/overview',
}

export async function getOperationsOverview(accessToken: string, scope: OverviewScope): Promise<OverviewResponse> {
  const payload = await fetchJSONWithAuth<unknown>(`${API_URL}${overviewPaths[scope]}`, accessToken)
  return parseOverviewResponse(payload)
}

function parseOverviewResponse(payload: unknown): OverviewResponse {
  const response = requireRecord(payload, 'overview response')
  const summary = requireRecord(response.summary, 'overview summary')
  const metrics = requireArray(response.metrics, 'overview metrics')
  const sections = requireArray(response.sections, 'overview sections')

  return {
    summary: {
      approved_stations: requireNumber(summary.approved_stations, 'summary.approved_stations'),
      featured_stations: requireNumber(summary.featured_stations, 'summary.featured_stations'),
      stations_needing_action: requireNumber(summary.stations_needing_action, 'summary.stations_needing_action'),
      healthy_stations: requireNumber(summary.healthy_stations, 'summary.healthy_stations'),
      active_streams: requireNumber(summary.active_streams, 'summary.active_streams'),
    },
    metrics: metrics.map((metric, index) => parseOverviewMetric(metric, index)),
    sections: sections.map((section, index) => parseOverviewSection(section, index)),
    generated_at: requireString(response.generated_at, 'generated_at'),
  }
}

function parseOverviewMetric(payload: unknown, index: number): OverviewMetric {
  const metric = requireRecord(payload, `metrics[${index}]`)
  return {
    id: requireString(metric.id, `metrics[${index}].id`),
    label: requireString(metric.label, `metrics[${index}].label`),
    value: requireNumber(metric.value, `metrics[${index}].value`),
    severity: requireSeverity(metric.severity, `metrics[${index}].severity`),
    description: requireString(metric.description, `metrics[${index}].description`),
  }
}

function parseOverviewSection(payload: unknown, index: number): OverviewSection {
  const section = requireRecord(payload, `sections[${index}]`)
  const stations = requireArray(section.stations, `sections[${index}].stations`)

  return {
    id: requireString(section.id, `sections[${index}].id`),
    title: requireString(section.title, `sections[${index}].title`),
    description: requireString(section.description, `sections[${index}].description`),
    severity: requireSeverity(section.severity, `sections[${index}].severity`),
    count: requireNumber(section.count, `sections[${index}].count`),
    stations: stations.map((station, stationIndex) => parseOverviewStation(station, index, stationIndex)),
  }
}

function parseOverviewStation(payload: unknown, sectionIndex: number, stationIndex: number): OverviewStation {
  const stationPath = `sections[${sectionIndex}].stations[${stationIndex}]`
  const station = requireRecord(payload, stationPath)
  const issues = requireArray(station.issues, `${stationPath}.issues`)
  const logo = optionalString(station.logo, `${stationPath}.logo`)

  return {
    id: requireString(station.id, `${stationPath}.id`),
    name: requireString(station.name, `${stationPath}.name`),
    logo: logo || undefined,
    country: requireString(station.country, `${stationPath}.country`),
    city: requireString(station.city, `${stationPath}.city`),
    featured: requireBoolean(station.featured, `${stationPath}.featured`),
    reliability_score: requireNumber(station.reliability_score, `${stationPath}.reliability_score`),
    active_streams: requireNumber(station.active_streams, `${stationPath}.active_streams`),
    issues: issues.map((issue, issueIndex) => parseOverviewIssue(issue, stationPath, issueIndex)),
  }
}

function parseOverviewIssue(payload: unknown, stationPath: string, issueIndex: number): OverviewIssue {
  const issuePath = `${stationPath}.issues[${issueIndex}]`
  const issue = requireRecord(payload, issuePath)

  return {
    code: requireString(issue.code, `${issuePath}.code`),
    label: requireString(issue.label, `${issuePath}.label`),
    detail: requireString(issue.detail, `${issuePath}.detail`),
    severity: requireSeverity(issue.severity, `${issuePath}.severity`),
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid overview payload: ${field} must be an object`)
  }

  return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid overview payload: ${field} must be an array`)
  }

  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid overview payload: ${field} must be a string`)
  }

  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireString(value, field)
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid overview payload: ${field} must be a finite number`)
  }

  return value
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid overview payload: ${field} must be a boolean`)
  }

  return value
}

function requireSeverity(value: unknown, field: string): OverviewSeverity {
  if (value === 'critical' || value === 'warning' || value === 'notice') {
    return value
  }

  throw new Error(`Invalid overview payload: ${field} must be critical, warning, or notice`)
}
