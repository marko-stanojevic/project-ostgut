'use client'

import { optionalString, requireBoolean, requireDateString, requireNumber, requireRecord, requireString } from '@/lib/api-contract'
import type { NowPlaying } from '@/lib/now-playing'

const TAB_ID_STORAGE_KEY = 'metadata:client-tab-id:v1'
const LEASE_MS = 45_000
const SNAPSHOT_TTL_MS = 90_000
const CLIENT_METADATA_COORDINATION_CONTRACT = 'client metadata coordination payload'

type LeaseRecord = {
  tabId: string
  expiresAt: number
}

type SnapshotRecord = {
  writtenAt: string
  nowPlaying: NowPlaying | null
}

let cachedTabId: string | null = null

export function claimClientMetadataLease(streamId: string): boolean {
  if (typeof window === 'undefined' || !streamId) return true

  const key = getClientMetadataLeaseStorageKey(streamId)
  const tabId = getClientMetadataTabId()
  const existing = readLeaseRecord(key)
  const now = Date.now()
  if (existing && existing.tabId !== tabId && existing.expiresAt > now) {
    return false
  }

  writeLeaseRecord(key, { tabId, expiresAt: now + LEASE_MS })
  const confirmed = readLeaseRecord(key)
  return confirmed?.tabId === tabId && confirmed.expiresAt > now
}

export function releaseClientMetadataLease(streamId: string): void {
  if (typeof window === 'undefined' || !streamId) return

  const key = getClientMetadataLeaseStorageKey(streamId)
  const existing = readLeaseRecord(key)
  if (existing?.tabId === getClientMetadataTabId()) {
    window.localStorage.removeItem(key)
  }
}

export function publishClientMetadataSnapshot(streamId: string, nowPlaying: NowPlaying | null): void {
  if (typeof window === 'undefined' || !streamId) return

  const payload: SnapshotRecord = {
    writtenAt: new Date().toISOString(),
    nowPlaying,
  }
  window.localStorage.setItem(getClientMetadataSnapshotStorageKey(streamId), JSON.stringify(payload))
}

export function readClientMetadataSnapshot(streamId: string): NowPlaying | null | undefined {
  if (typeof window === 'undefined' || !streamId) return undefined

  const raw = window.localStorage.getItem(getClientMetadataSnapshotStorageKey(streamId))
  if (!raw) return undefined

  try {
    const snapshot = parseSnapshotRecord(JSON.parse(raw))
    if (Date.now() - Date.parse(snapshot.writtenAt) > SNAPSHOT_TTL_MS) {
      return undefined
    }
    return snapshot.nowPlaying
  } catch {
    return undefined
  }
}

export function getClientMetadataLeaseStorageKey(streamId: string): string {
  return `metadata:client-owner:v1:${streamId}`
}

export function getClientMetadataSnapshotStorageKey(streamId: string): string {
  return `metadata:client-snapshot:v1:${streamId}`
}

function getClientMetadataTabId(): string {
  if (cachedTabId) return cachedTabId
  if (typeof window === 'undefined') return 'server'

  try {
    const existing = window.sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (existing) {
      cachedTabId = existing
      return existing
    }
  } catch {
    // Ignore sessionStorage failures and fall back to an in-memory ID.
  }

  const next = createTabId()
  cachedTabId = next
  try {
    window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, next)
  } catch {
    // Ignore sessionStorage failures and keep the in-memory ID.
  }
  return next
}

function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function readLeaseRecord(key: string): LeaseRecord | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    const payload = requireRecord(JSON.parse(raw), 'lease', CLIENT_METADATA_COORDINATION_CONTRACT)
    return {
      tabId: requireString(payload.tabId, 'lease.tabId', CLIENT_METADATA_COORDINATION_CONTRACT),
      expiresAt: requireNumber(payload.expiresAt, 'lease.expiresAt', CLIENT_METADATA_COORDINATION_CONTRACT),
    }
  } catch {
    return null
  }
}

function writeLeaseRecord(key: string, lease: LeaseRecord): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(lease))
}

function parseSnapshotRecord(value: unknown): SnapshotRecord {
  const payload = requireRecord(value, 'snapshot', CLIENT_METADATA_COORDINATION_CONTRACT)
  return {
    writtenAt: requireDateString(payload.writtenAt, 'snapshot.writtenAt', CLIENT_METADATA_COORDINATION_CONTRACT),
    nowPlaying: parseNowPlayingSnapshot(payload.nowPlaying),
  }
}

function parseNowPlayingSnapshot(value: unknown): NowPlaying | null {
  if (value === null) {
    return null
  }

  const payload = requireRecord(value, 'snapshot.nowPlaying', CLIENT_METADATA_COORDINATION_CONTRACT)
  return {
    title: requireString(payload.title, 'snapshot.nowPlaying.title', CLIENT_METADATA_COORDINATION_CONTRACT),
    artist: optionalString(payload.artist, 'snapshot.nowPlaying.artist', CLIENT_METADATA_COORDINATION_CONTRACT),
    song: optionalString(payload.song, 'snapshot.nowPlaying.song', CLIENT_METADATA_COORDINATION_CONTRACT),
    source: requireString(payload.source, 'snapshot.nowPlaying.source', CLIENT_METADATA_COORDINATION_CONTRACT),
    metadataUrl: optionalString(payload.metadataUrl, 'snapshot.nowPlaying.metadataUrl', CLIENT_METADATA_COORDINATION_CONTRACT),
    supported: requireBoolean(payload.supported, 'snapshot.nowPlaying.supported', CLIENT_METADATA_COORDINATION_CONTRACT),
    status: requireNowPlayingStatus(payload.status),
    errorCode: optionalString(payload.errorCode, 'snapshot.nowPlaying.errorCode', CLIENT_METADATA_COORDINATION_CONTRACT),
    error: optionalString(payload.error, 'snapshot.nowPlaying.error', CLIENT_METADATA_COORDINATION_CONTRACT),
    fetchedAt: optionalString(payload.fetchedAt, 'snapshot.nowPlaying.fetchedAt', CLIENT_METADATA_COORDINATION_CONTRACT),
    resolver: requireNowPlayingResolver(payload.resolver),
  }
}

function requireNowPlayingStatus(value: unknown): NowPlaying['status'] {
  if (value === 'ok' || value === 'unsupported' || value === 'disabled' || value === 'error') {
    return value
  }
  throw new Error(`Invalid ${CLIENT_METADATA_COORDINATION_CONTRACT}: snapshot.nowPlaying.status must be ok, unsupported, disabled, or error`)
}

function requireNowPlayingResolver(value: unknown): NowPlaying['resolver'] {
  if (value === undefined || value === null) {
    return undefined
  }
  if (value === 'none' || value === 'server' || value === 'client') {
    return value
  }
  throw new Error(`Invalid ${CLIENT_METADATA_COORDINATION_CONTRACT}: snapshot.nowPlaying.resolver must be none, server, or client`)
}
