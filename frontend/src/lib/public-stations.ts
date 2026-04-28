import { API_URL } from '@/lib/api'
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireArray,
  requireBoolean,
  requireNumber,
  requireRecord,
  requireString,
  requireStringArray,
} from '@/lib/api-contract'
import type { ApiStation, ApiStationDetail, ApiStream } from '@/types/station'

const STATION_CONTRACT = 'station payload'
const PUBLIC_STATION_REVALIDATE_SECONDS = 60

function withPublicStationCache(init?: RequestInit): RequestInit {
  return {
    ...init,
    next: {
      ...init?.next,
      revalidate: PUBLIC_STATION_REVALIDATE_SECONDS,
    },
  }
}

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
  const response = await fetch(`${API_URL}${path}`, withPublicStationCache(init))
  if (!response.ok) {
    throw new Error(`Station request failed with status ${response.status}`)
  }

  return parsePublicStationsResponse(await response.json())
}

export async function getPublicStation(id: string, init?: RequestInit): Promise<ApiStationDetail> {
  const response = await fetch(`${API_URL}/stations/${id}`, withPublicStationCache(init))
  if (!response.ok) {
    throw new Error(`Station request failed with status ${response.status}`)
  }

  return parsePublicStation(await response.json())
}

export async function getPublicStationFilters(init?: RequestInit): Promise<PublicStationFiltersResponse> {
  const response = await fetch(`${API_URL}/stations/filters`, withPublicStationCache(init))
  if (!response.ok) {
    throw new Error(`Station filters request failed with status ${response.status}`)
  }

  return parsePublicStationFiltersResponse(await response.json())
}

function parsePublicStationsResponse(payload: unknown): PublicStationsResponse {
  const response = requireRecord(payload, 'stations response', STATION_CONTRACT)
  const stations = requireArray(response.stations, 'stations', STATION_CONTRACT)

  return {
    stations: stations.map((station, index) => parsePublicStation(station, `stations[${index}]`)),
    total: requireNumber(response.total, 'total', STATION_CONTRACT),
  }
}

function parsePublicStationFiltersResponse(payload: unknown): PublicStationFiltersResponse {
  const response = requireRecord(payload, 'station filters response', STATION_CONTRACT)

  return {
    genre_tags: requireStringArray(response.genre_tags, 'genre_tags', STATION_CONTRACT),
    subgenre_tags: requireStringArray(response.subgenre_tags, 'subgenre_tags', STATION_CONTRACT),
    style_tags: requireStringArray(response.style_tags, 'style_tags', STATION_CONTRACT),
    format_tags: requireStringArray(response.format_tags, 'format_tags', STATION_CONTRACT),
    texture_tags: requireStringArray(response.texture_tags, 'texture_tags', STATION_CONTRACT),
  }
}

function parsePublicStation(payload: unknown, field = 'station'): ApiStationDetail {
  const station = requireRecord(payload, field, STATION_CONTRACT)
  const streams = requireArray(station.streams, `${field}.streams`, STATION_CONTRACT)

  return {
    id: requireString(station.id, `${field}.id`, STATION_CONTRACT),
    name: requireString(station.name, `${field}.name`, STATION_CONTRACT),
    logo: optionalString(station.logo, `${field}.logo`, STATION_CONTRACT),
    website: optionalString(station.website, `${field}.website`, STATION_CONTRACT),
    overview: optionalString(station.overview, `${field}.overview`, STATION_CONTRACT),
    description: optionalString(station.description, `${field}.description`, STATION_CONTRACT),
    editorial_review: optionalString(station.editorial_review, `${field}.editorial_review`, STATION_CONTRACT),
    genre_tags: requireStringArray(station.genre_tags, `${field}.genre_tags`, STATION_CONTRACT),
    subgenre_tags: requireStringArray(station.subgenre_tags, `${field}.subgenre_tags`, STATION_CONTRACT),
    search_tags: requireStringArray(station.search_tags, `${field}.search_tags`, STATION_CONTRACT),
    style_tags: requireStringArray(station.style_tags, `${field}.style_tags`, STATION_CONTRACT),
    format_tags: requireStringArray(station.format_tags, `${field}.format_tags`, STATION_CONTRACT),
    texture_tags: requireStringArray(station.texture_tags, `${field}.texture_tags`, STATION_CONTRACT),
    language: requireString(station.language, `${field}.language`, STATION_CONTRACT),
    country: requireString(station.country, `${field}.country`, STATION_CONTRACT),
    city: requireString(station.city, `${field}.city`, STATION_CONTRACT),
    reliability_score: requireNumber(station.reliability_score, `${field}.reliability_score`, STATION_CONTRACT),
    featured: requireBoolean(station.featured, `${field}.featured`, STATION_CONTRACT),
    streams: streams.map((stream, index) => parsePublicStream(stream, `${field}.streams[${index}]`)),
  }
}

function parsePublicStream(payload: unknown, field: string): ApiStream {
  const stream = requireRecord(payload, field, STATION_CONTRACT)

  return {
    id: requireString(stream.id, `${field}.id`, STATION_CONTRACT),
    url: requireString(stream.url, `${field}.url`, STATION_CONTRACT),
    resolved_url: requireString(stream.resolved_url, `${field}.resolved_url`, STATION_CONTRACT),
    kind: requireString(stream.kind, `${field}.kind`, STATION_CONTRACT),
    container: requireString(stream.container, `${field}.container`, STATION_CONTRACT),
    transport: requireString(stream.transport, `${field}.transport`, STATION_CONTRACT),
    mime_type: requireString(stream.mime_type, `${field}.mime_type`, STATION_CONTRACT),
    codec: requireString(stream.codec, `${field}.codec`, STATION_CONTRACT),
    lossless: requireBoolean(stream.lossless, `${field}.lossless`, STATION_CONTRACT),
    bitrate: requireNumber(stream.bitrate, `${field}.bitrate`, STATION_CONTRACT),
    bit_depth: requireNumber(stream.bit_depth, `${field}.bit_depth`, STATION_CONTRACT),
    sample_rate_hz: requireNumber(stream.sample_rate_hz, `${field}.sample_rate_hz`, STATION_CONTRACT),
    sample_rate_confidence: requireString(stream.sample_rate_confidence, `${field}.sample_rate_confidence`, STATION_CONTRACT),
    channels: requireNumber(stream.channels, `${field}.channels`, STATION_CONTRACT),
    priority: requireNumber(stream.priority, `${field}.priority`, STATION_CONTRACT),
    is_active: requireBoolean(stream.is_active, `${field}.is_active`, STATION_CONTRACT),
    loudness_integrated_lufs: optionalNumber(stream.loudness_integrated_lufs, `${field}.loudness_integrated_lufs`, STATION_CONTRACT),
    loudness_peak_dbfs: optionalNumber(stream.loudness_peak_dbfs, `${field}.loudness_peak_dbfs`, STATION_CONTRACT),
    loudness_sample_duration_seconds: optionalNumber(stream.loudness_sample_duration_seconds, `${field}.loudness_sample_duration_seconds`, STATION_CONTRACT),
    loudness_measured_at: optionalString(stream.loudness_measured_at, `${field}.loudness_measured_at`, STATION_CONTRACT),
    loudness_measurement_status: optionalString(stream.loudness_measurement_status, `${field}.loudness_measurement_status`, STATION_CONTRACT),
    metadata_enabled: requireBoolean(stream.metadata_enabled, `${field}.metadata_enabled`, STATION_CONTRACT),
    metadata_type: requireString(stream.metadata_type, `${field}.metadata_type`, STATION_CONTRACT),
    metadata_source: optionalString(stream.metadata_source, `${field}.metadata_source`, STATION_CONTRACT),
    metadata_url: optionalString(stream.metadata_url, `${field}.metadata_url`, STATION_CONTRACT),
    metadata_delayed: optionalBoolean(stream.metadata_delayed, `${field}.metadata_delayed`, STATION_CONTRACT),
    metadata_resolver: requireMetadataResolver(stream.metadata_resolver, `${field}.metadata_resolver`),
    metadata_resolver_checked_at: optionalString(stream.metadata_resolver_checked_at, `${field}.metadata_resolver_checked_at`, STATION_CONTRACT),
    health_score: requireNumber(stream.health_score, `${field}.health_score`, STATION_CONTRACT),
    last_checked_at: optionalString(stream.last_checked_at, `${field}.last_checked_at`, STATION_CONTRACT),
    last_error: optionalString(stream.last_error, `${field}.last_error`, STATION_CONTRACT),
  }
}

function requireMetadataResolver(value: unknown, field: string): 'none' | 'server' | 'client' {
  if (value === 'none' || value === 'server' || value === 'client') {
    return value
  }

  throw new Error(`Invalid ${STATION_CONTRACT}: ${field} must be none, server, or client`)
}
