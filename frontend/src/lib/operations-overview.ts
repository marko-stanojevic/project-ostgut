import { API_URL } from '@/lib/api'
import {
  optionalString,
  requireArray,
  requireBoolean,
  requireNumber,
  requireRecord,
  requireString,
} from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

const OVERVIEW_CONTRACT = 'overview payload'

export type OverviewScope = 'editor'
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
  editor: '/editor/overview',
}

export async function getOperationsOverview(accessToken: string, scope: OverviewScope): Promise<OverviewResponse> {
  const payload = await fetchJSONWithAuth(`${API_URL}${overviewPaths[scope]}`, accessToken)
  return parseOverviewResponse(payload)
}

function parseOverviewResponse(payload: unknown): OverviewResponse {
  const response = requireRecord(payload, 'overview response', OVERVIEW_CONTRACT)
  const summary = requireRecord(response.summary, 'overview summary', OVERVIEW_CONTRACT)
  const metrics = requireArray(response.metrics, 'overview metrics', OVERVIEW_CONTRACT)
  const sections = requireArray(response.sections, 'overview sections', OVERVIEW_CONTRACT)

  return {
    summary: {
      approved_stations: requireNumber(summary.approved_stations, 'summary.approved_stations', OVERVIEW_CONTRACT),
      featured_stations: requireNumber(summary.featured_stations, 'summary.featured_stations', OVERVIEW_CONTRACT),
      stations_needing_action: requireNumber(summary.stations_needing_action, 'summary.stations_needing_action', OVERVIEW_CONTRACT),
      healthy_stations: requireNumber(summary.healthy_stations, 'summary.healthy_stations', OVERVIEW_CONTRACT),
      active_streams: requireNumber(summary.active_streams, 'summary.active_streams', OVERVIEW_CONTRACT),
    },
    metrics: metrics.map((metric, index) => parseOverviewMetric(metric, index)),
    sections: sections.map((section, index) => parseOverviewSection(section, index)),
    generated_at: requireString(response.generated_at, 'generated_at', OVERVIEW_CONTRACT),
  }
}

function parseOverviewMetric(payload: unknown, index: number): OverviewMetric {
  const metric = requireRecord(payload, `metrics[${index}]`, OVERVIEW_CONTRACT)
  return {
    id: requireString(metric.id, `metrics[${index}].id`, OVERVIEW_CONTRACT),
    label: requireString(metric.label, `metrics[${index}].label`, OVERVIEW_CONTRACT),
    value: requireNumber(metric.value, `metrics[${index}].value`, OVERVIEW_CONTRACT),
    severity: requireSeverity(metric.severity, `metrics[${index}].severity`),
    description: requireString(metric.description, `metrics[${index}].description`, OVERVIEW_CONTRACT),
  }
}

function parseOverviewSection(payload: unknown, index: number): OverviewSection {
  const section = requireRecord(payload, `sections[${index}]`, OVERVIEW_CONTRACT)
  const stations = requireArray(section.stations, `sections[${index}].stations`, OVERVIEW_CONTRACT)

  return {
    id: requireString(section.id, `sections[${index}].id`, OVERVIEW_CONTRACT),
    title: requireString(section.title, `sections[${index}].title`, OVERVIEW_CONTRACT),
    description: requireString(section.description, `sections[${index}].description`, OVERVIEW_CONTRACT),
    severity: requireSeverity(section.severity, `sections[${index}].severity`),
    count: requireNumber(section.count, `sections[${index}].count`, OVERVIEW_CONTRACT),
    stations: stations.map((station, stationIndex) => parseOverviewStation(station, index, stationIndex)),
  }
}

function parseOverviewStation(payload: unknown, sectionIndex: number, stationIndex: number): OverviewStation {
  const stationPath = `sections[${sectionIndex}].stations[${stationIndex}]`
  const station = requireRecord(payload, stationPath, OVERVIEW_CONTRACT)
  const issues = requireArray(station.issues, `${stationPath}.issues`, OVERVIEW_CONTRACT)
  const logo = optionalString(station.logo, `${stationPath}.logo`, OVERVIEW_CONTRACT)

  return {
    id: requireString(station.id, `${stationPath}.id`, OVERVIEW_CONTRACT),
    name: requireString(station.name, `${stationPath}.name`, OVERVIEW_CONTRACT),
    logo: logo || undefined,
    country: requireString(station.country, `${stationPath}.country`, OVERVIEW_CONTRACT),
    city: requireString(station.city, `${stationPath}.city`, OVERVIEW_CONTRACT),
    featured: requireBoolean(station.featured, `${stationPath}.featured`, OVERVIEW_CONTRACT),
    reliability_score: requireNumber(station.reliability_score, `${stationPath}.reliability_score`, OVERVIEW_CONTRACT),
    active_streams: requireNumber(station.active_streams, `${stationPath}.active_streams`, OVERVIEW_CONTRACT),
    issues: issues.map((issue, issueIndex) => parseOverviewIssue(issue, stationPath, issueIndex)),
  }
}

function parseOverviewIssue(payload: unknown, stationPath: string, issueIndex: number): OverviewIssue {
  const issuePath = `${stationPath}.issues[${issueIndex}]`
  const issue = requireRecord(payload, issuePath, OVERVIEW_CONTRACT)

  return {
    code: requireString(issue.code, `${issuePath}.code`, OVERVIEW_CONTRACT),
    label: requireString(issue.label, `${issuePath}.label`, OVERVIEW_CONTRACT),
    detail: requireString(issue.detail, `${issuePath}.detail`, OVERVIEW_CONTRACT),
    severity: requireSeverity(issue.severity, `${issuePath}.severity`),
  }
}

function requireSeverity(value: unknown, field: string): OverviewSeverity {
  if (value === 'critical' || value === 'warning' || value === 'notice') {
    return value
  }

  throw new Error(`Invalid ${OVERVIEW_CONTRACT}: ${field} must be critical, warning, or notice`)
}
