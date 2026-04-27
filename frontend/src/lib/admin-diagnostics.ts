import { API_URL } from '@/lib/api'
import { requireArray, requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

const ADMIN_DIAGNOSTICS_CONTRACT = 'admin diagnostics payload'

export type AdminDiagnosticKind = 'api' | 'database' | 'jobs'
export type AdminDiagnosticStatus = 'operational' | 'attention'
export type AdminDiagnosticTone = 'neutral' | 'attention'
export type AdminJobTriggerID = 'station-sync' | 'stream-reprobe' | 'metadata-fetch'
export type AdminJobTriggerStatus = 'started' | 'already_running'

export type AdminDiagnosticResponse = {
  title: string
  description: string
  status_checks: AdminDiagnosticStatusCheck[]
  sections: AdminDiagnosticSection[]
  generated_at: string
}

export type AdminDiagnosticStatusCheck = {
  id: string
  label: string
  status: AdminDiagnosticStatus
  detail: string
  checked_at: string
}

export type AdminDiagnosticSection = {
  id: string
  title: string
  description: string
  items: AdminDiagnosticItem[]
}

export type AdminDiagnosticItem = {
  id: string
  label: string
  value: string
  tone: AdminDiagnosticTone
  detail: string
}

export type AdminJobTriggerResponse = {
  job_id: AdminJobTriggerID
  status: AdminJobTriggerStatus
  message: string
  triggered_at: string
}

const diagnosticPaths: Record<AdminDiagnosticKind, string> = {
  api: '/admin/diagnostics/api',
  database: '/admin/diagnostics/database',
  jobs: '/admin/diagnostics/jobs',
}

export async function getAdminDiagnostics(
  accessToken: string,
  kind: AdminDiagnosticKind,
): Promise<AdminDiagnosticResponse> {
  const payload = await fetchJSONWithAuth(`${API_URL}${diagnosticPaths[kind]}`, accessToken)
  return parseAdminDiagnosticResponse(payload)
}

export async function triggerAdminJob(
  accessToken: string,
  jobID: AdminJobTriggerID,
): Promise<AdminJobTriggerResponse> {
  const payload = await fetchJSONWithAuth(`${API_URL}/admin/jobs/${jobID}/trigger`, accessToken, {
    method: 'POST',
  })
  return parseAdminJobTriggerResponse(payload)
}

function parseAdminDiagnosticResponse(payload: unknown): AdminDiagnosticResponse {
  const response = requireRecord(payload, 'admin diagnostics response', ADMIN_DIAGNOSTICS_CONTRACT)
  const statusChecks = requireArray(response.status_checks, 'status_checks', ADMIN_DIAGNOSTICS_CONTRACT)
  const sections = requireArray(response.sections, 'sections', ADMIN_DIAGNOSTICS_CONTRACT)

  return {
    title: requireString(response.title, 'title', ADMIN_DIAGNOSTICS_CONTRACT),
    description: requireString(response.description, 'description', ADMIN_DIAGNOSTICS_CONTRACT),
    status_checks: statusChecks.map((statusCheck, index) => parseStatusCheck(statusCheck, index)),
    sections: sections.map((section, index) => parseSection(section, index)),
    generated_at: requireString(response.generated_at, 'generated_at', ADMIN_DIAGNOSTICS_CONTRACT),
  }
}

function parseAdminJobTriggerResponse(payload: unknown): AdminJobTriggerResponse {
  const response = requireRecord(payload, 'admin job trigger response', ADMIN_DIAGNOSTICS_CONTRACT)
  const jobID = requireJobTriggerID(response.job_id, 'job_id')
  const status = requireJobTriggerStatus(response.status, 'status')

  return {
    job_id: jobID,
    status,
    message: requireString(response.message, 'message', ADMIN_DIAGNOSTICS_CONTRACT),
    triggered_at: requireString(response.triggered_at, 'triggered_at', ADMIN_DIAGNOSTICS_CONTRACT),
  }
}

function parseStatusCheck(payload: unknown, index: number): AdminDiagnosticStatusCheck {
  const statusCheck = requireRecord(payload, `status_checks[${index}]`, ADMIN_DIAGNOSTICS_CONTRACT)

  return {
    id: requireString(statusCheck.id, `status_checks[${index}].id`, ADMIN_DIAGNOSTICS_CONTRACT),
    label: requireString(statusCheck.label, `status_checks[${index}].label`, ADMIN_DIAGNOSTICS_CONTRACT),
    status: requireStatus(statusCheck.status, `status_checks[${index}].status`),
    detail: requireString(statusCheck.detail, `status_checks[${index}].detail`, ADMIN_DIAGNOSTICS_CONTRACT),
    checked_at: requireString(statusCheck.checked_at, `status_checks[${index}].checked_at`, ADMIN_DIAGNOSTICS_CONTRACT),
  }
}

function parseSection(payload: unknown, index: number): AdminDiagnosticSection {
  const section = requireRecord(payload, `sections[${index}]`, ADMIN_DIAGNOSTICS_CONTRACT)
  const items = requireArray(section.items, `sections[${index}].items`, ADMIN_DIAGNOSTICS_CONTRACT)

  return {
    id: requireString(section.id, `sections[${index}].id`, ADMIN_DIAGNOSTICS_CONTRACT),
    title: requireString(section.title, `sections[${index}].title`, ADMIN_DIAGNOSTICS_CONTRACT),
    description: requireString(section.description, `sections[${index}].description`, ADMIN_DIAGNOSTICS_CONTRACT),
    items: items.map((item, itemIndex) => parseItem(item, index, itemIndex)),
  }
}

function parseItem(payload: unknown, sectionIndex: number, itemIndex: number): AdminDiagnosticItem {
  const itemPath = `sections[${sectionIndex}].items[${itemIndex}]`
  const item = requireRecord(payload, itemPath, ADMIN_DIAGNOSTICS_CONTRACT)

  return {
    id: requireString(item.id, `${itemPath}.id`, ADMIN_DIAGNOSTICS_CONTRACT),
    label: requireString(item.label, `${itemPath}.label`, ADMIN_DIAGNOSTICS_CONTRACT),
    value: requireString(item.value, `${itemPath}.value`, ADMIN_DIAGNOSTICS_CONTRACT),
    tone: requireTone(item.tone, `${itemPath}.tone`),
    detail: requireString(item.detail, `${itemPath}.detail`, ADMIN_DIAGNOSTICS_CONTRACT),
  }
}

function requireStatus(value: unknown, field: string): AdminDiagnosticStatus {
  if (value === 'operational' || value === 'attention') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_DIAGNOSTICS_CONTRACT}: ${field} must be operational or attention`)
}

function requireTone(value: unknown, field: string): AdminDiagnosticTone {
  if (value === 'neutral' || value === 'attention') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_DIAGNOSTICS_CONTRACT}: ${field} must be neutral or attention`)
}

function requireJobTriggerID(value: unknown, field: string): AdminJobTriggerID {
  if (value === 'station-sync' || value === 'stream-reprobe' || value === 'metadata-fetch') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_DIAGNOSTICS_CONTRACT}: ${field} must be station-sync, stream-reprobe, or metadata-fetch`)
}

function requireJobTriggerStatus(value: unknown, field: string): AdminJobTriggerStatus {
  if (value === 'started' || value === 'already_running') {
    return value
  }

  throw new Error(`Invalid ${ADMIN_DIAGNOSTICS_CONTRACT}: ${field} must be started or already_running`)
}
