import { API_URL } from '@/lib/api'
import type { ApiStation, ApiStationDetail, ApiStream } from '@/types/station'

export interface PublicStationsResponse {
  stations: ApiStation[]
  total: number
}

export interface PublicStationFiltersResponse {
  genre_tags: string[]
  subgenre_tags: string[]
  style_tags: string[]
  format_tags: string[]
  texture_tags: string[]
}

export async function getPublicStations(path: string, init?: RequestInit): Promise<PublicStationsResponse> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    throw new Error(`Station request failed with status ${response.status}`)
  }

  return parsePublicStationsResponse(await response.json())
}

export async function getPublicStation(id: string, init?: RequestInit): Promise<ApiStationDetail> {
  const response = await fetch(`${API_URL}/stations/${id}`, init)
  if (!response.ok) {
    throw new Error(`Station request failed with status ${response.status}`)
  }

  return parsePublicStation(await response.json())
}

export async function getPublicStationFilters(init?: RequestInit): Promise<PublicStationFiltersResponse> {
  const response = await fetch(`${API_URL}/stations/filters`, init)
  if (!response.ok) {
    throw new Error(`Station filters request failed with status ${response.status}`)
  }

  return parsePublicStationFiltersResponse(await response.json())
}

function parsePublicStationsResponse(payload: unknown): PublicStationsResponse {
  const response = requireRecord(payload, 'stations response')
  const stations = requireArray(response.stations, 'stations')

  return {
    stations: stations.map((station, index) => parsePublicStation(station, `stations[${index}]`)),
    total: requireNumber(response.total, 'total'),
  }
}

function parsePublicStationFiltersResponse(payload: unknown): PublicStationFiltersResponse {
  const response = requireRecord(payload, 'station filters response')

  return {
    genre_tags: requireStringArray(response.genre_tags, 'genre_tags'),
    subgenre_tags: requireStringArray(response.subgenre_tags, 'subgenre_tags'),
    style_tags: requireStringArray(response.style_tags, 'style_tags'),
    format_tags: requireStringArray(response.format_tags, 'format_tags'),
    texture_tags: requireStringArray(response.texture_tags, 'texture_tags'),
  }
}

function parsePublicStation(payload: unknown, field = 'station'): ApiStationDetail {
  const station = requireRecord(payload, field)
  const streams = requireArray(station.streams, `${field}.streams`)

  return {
    id: requireString(station.id, `${field}.id`),
    name: requireString(station.name, `${field}.name`),
    logo: optionalString(station.logo, `${field}.logo`),
    website: optionalString(station.website, `${field}.website`),
    overview: optionalString(station.overview, `${field}.overview`),
    description: optionalString(station.description, `${field}.description`),
    editorial_review: optionalString(station.editorial_review, `${field}.editorial_review`),
    genre_tags: requireStringArray(station.genre_tags, `${field}.genre_tags`),
    subgenre_tags: requireStringArray(station.subgenre_tags, `${field}.subgenre_tags`),
    search_tags: requireStringArray(station.search_tags, `${field}.search_tags`),
    style_tags: requireStringArray(station.style_tags, `${field}.style_tags`),
    format_tags: requireStringArray(station.format_tags, `${field}.format_tags`),
    texture_tags: requireStringArray(station.texture_tags, `${field}.texture_tags`),
    language: requireString(station.language, `${field}.language`),
    country: requireString(station.country, `${field}.country`),
    city: requireString(station.city, `${field}.city`),
    reliability_score: requireNumber(station.reliability_score, `${field}.reliability_score`),
    featured: requireBoolean(station.featured, `${field}.featured`),
    streams: streams.map((stream, index) => parsePublicStream(stream, `${field}.streams[${index}]`)),
  }
}

function parsePublicStream(payload: unknown, field: string): ApiStream {
  const stream = requireRecord(payload, field)

  return {
    id: requireString(stream.id, `${field}.id`),
    url: requireString(stream.url, `${field}.url`),
    resolved_url: requireString(stream.resolved_url, `${field}.resolved_url`),
    kind: requireString(stream.kind, `${field}.kind`),
    container: requireString(stream.container, `${field}.container`),
    transport: requireString(stream.transport, `${field}.transport`),
    mime_type: requireString(stream.mime_type, `${field}.mime_type`),
    codec: requireString(stream.codec, `${field}.codec`),
    lossless: requireBoolean(stream.lossless, `${field}.lossless`),
    bitrate: requireNumber(stream.bitrate, `${field}.bitrate`),
    bit_depth: requireNumber(stream.bit_depth, `${field}.bit_depth`),
    sample_rate_hz: requireNumber(stream.sample_rate_hz, `${field}.sample_rate_hz`),
    sample_rate_confidence: requireString(stream.sample_rate_confidence, `${field}.sample_rate_confidence`),
    channels: requireNumber(stream.channels, `${field}.channels`),
    priority: requireNumber(stream.priority, `${field}.priority`),
    is_active: requireBoolean(stream.is_active, `${field}.is_active`),
    loudness_integrated_lufs: optionalNumber(stream.loudness_integrated_lufs, `${field}.loudness_integrated_lufs`),
    loudness_peak_dbfs: optionalNumber(stream.loudness_peak_dbfs, `${field}.loudness_peak_dbfs`),
    loudness_sample_duration_seconds: optionalNumber(stream.loudness_sample_duration_seconds, `${field}.loudness_sample_duration_seconds`),
    loudness_measured_at: optionalString(stream.loudness_measured_at, `${field}.loudness_measured_at`),
    loudness_measurement_status: optionalString(stream.loudness_measurement_status, `${field}.loudness_measurement_status`),
    metadata_enabled: requireBoolean(stream.metadata_enabled, `${field}.metadata_enabled`),
    metadata_type: requireString(stream.metadata_type, `${field}.metadata_type`),
    metadata_source: optionalString(stream.metadata_source, `${field}.metadata_source`),
    metadata_url: optionalString(stream.metadata_url, `${field}.metadata_url`),
    metadata_delayed: optionalBoolean(stream.metadata_delayed, `${field}.metadata_delayed`),
    metadata_resolver: requireMetadataResolver(stream.metadata_resolver, `${field}.metadata_resolver`),
    metadata_resolver_checked_at: optionalString(stream.metadata_resolver_checked_at, `${field}.metadata_resolver_checked_at`),
    health_score: requireNumber(stream.health_score, `${field}.health_score`),
    last_checked_at: optionalString(stream.last_checked_at, `${field}.last_checked_at`),
    last_error: optionalString(stream.last_error, `${field}.last_error`),
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid station payload: ${field} must be an object`)
  }

  return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid station payload: ${field} must be an array`)
  }

  return value
}

function requireStringArray(value: unknown, field: string): string[] {
  const items = requireArray(value, field)
  return items.map((item, index) => requireString(item, `${field}[${index}]`))
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid station payload: ${field} must be a string`)
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
    throw new Error(`Invalid station payload: ${field} must be a finite number`)
  }

  return value
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireNumber(value, field)
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid station payload: ${field} must be a boolean`)
  }

  return value
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return requireBoolean(value, field)
}

function requireMetadataResolver(value: unknown, field: string): 'none' | 'server' | 'client' {
  if (value === 'none' || value === 'server' || value === 'client') {
    return value
  }

  throw new Error(`Invalid station payload: ${field} must be none, server, or client`)
}
