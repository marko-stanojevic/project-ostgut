const PLACEHOLDER_TITLES = new Set([
  '',
  '-',
  'please',
  'loading',
  'unknown',
  'untitled',
  'stream',
  'station',
  'advertisement',
  'ads',
  'n/a',
  'na',
])

export function formatMetadataLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase() === 'icy') return 'ICY'
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ')
}

export function isPlaceholderMetadataTitle(raw: string): boolean {
  const title = raw.trim()
  if (!title) return true

  const normalized = title.toLowerCase()
  if (PLACEHOLDER_TITLES.has(normalized)) return true
  if (normalized.startsWith('<html')) return true
  if (normalized.includes('access denied')) return true
  if (normalized.includes('forbidden')) return true
  if (normalized.includes('not found')) return true
  if (normalized.includes('please wait')) return true
  return false
}