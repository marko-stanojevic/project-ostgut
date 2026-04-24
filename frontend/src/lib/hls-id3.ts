export const HLS_ID3_EVENT = 'ostgut:stream-id3'

export type HlsNowPlayingDetail = {
  streamUrl: string
  title: string
  artist?: string
  song?: string
  source: 'id3'
  resolver: 'client'
}

const PLACEHOLDER_TITLES = new Set([
  '',
  '-',
  'loading',
  'unknown',
  'untitled',
  'advertisement',
  'ads',
  'n/a',
  'na',
])

export function emitHlsID3NowPlaying(streamUrl: string, samples: Array<{ data?: Uint8Array }>): void {
  if (typeof window === 'undefined' || !streamUrl || samples.length === 0) {
    return
  }

  const parsed = parseHlsID3Samples(samples)
  if (!parsed?.title || isPlaceholderTitle(parsed.title)) {
    return
  }

  window.dispatchEvent(
    new CustomEvent<HlsNowPlayingDetail>(HLS_ID3_EVENT, {
      detail: {
        streamUrl,
        title: parsed.title,
        artist: parsed.artist,
        song: parsed.song,
        source: 'id3',
        resolver: 'client',
      },
    }),
  )
}

function parseHlsID3Samples(samples: Array<{ data?: Uint8Array }>): { title: string; artist?: string; song?: string } | null {
  for (const sample of samples) {
    const data = sample.data
    if (!data || data.byteLength < 10) {
      continue
    }
    const parsed = parseSingleID3Tag(data)
    if (parsed?.title) {
      return parsed
    }
  }
  return null
}

function parseSingleID3Tag(data: Uint8Array): { title: string; artist?: string; song?: string } | null {
  if (toASCII(data.slice(0, 3)) !== 'ID3') {
    return null
  }

  const version = data[3] ?? 4
  const tagSize = readSynchsafe(data, 6)
  const tagEnd = Math.min(data.length, 10 + tagSize)

  let title = ''
  let artist = ''
  let song = ''

  for (let offset = 10; offset+10 <= tagEnd; ) {
    const frameID = toASCII(data.slice(offset, offset + 4)).replace(/\0+$/, '')
    if (!frameID.trim()) {
      break
    }

    const frameSize = version === 4
      ? readSynchsafe(data, offset + 4)
      : readUint32BE(data, offset + 4)
    if (frameSize <= 0 || offset + 10 + frameSize > tagEnd) {
      break
    }

    const frame = data.slice(offset + 10, offset + 10 + frameSize)
    switch (frameID) {
      case 'TIT2': {
        const value = decodeTextFrame(frame)
        if (value) {
          title = value
        }
        break
      }
      case 'TPE1': {
        const value = decodeTextFrame(frame)
        if (value) {
          artist = value
        }
        break
      }
      case 'TXXX': {
        const { description, value } = decodeTXXXFrame(frame)
        if (!value) {
          break
        }
        const normalized = description.toLowerCase()
        if (!title && (normalized.includes('title') || normalized.includes('song') || normalized.includes('stream'))) {
          title = value
        }
        if (!artist && normalized.includes('artist')) {
          artist = value
        }
        break
      }
    }

    offset += 10 + frameSize
  }

  if (!title && artist && song) {
    title = `${artist} - ${song}`
  }
  if (!title && artist) {
    title = artist
  }
  if (!title || isPlaceholderTitle(title)) {
    return null
  }

  const split = splitArtistTitle(title)
  if (!artist && split.artist) {
    artist = split.artist
  }
  if (!song && split.song) {
    song = split.song
  }

  return {
    title,
    artist: artist || undefined,
    song: song || undefined,
  }
}

function decodeTextFrame(frame: Uint8Array): string {
  if (frame.length <= 1) {
    return ''
  }
  return decodeEncodedText(frame[0] ?? 0, frame.slice(1)).trim().replace(/\0+/g, '')
}

function decodeTXXXFrame(frame: Uint8Array): { description: string; value: string } {
  if (frame.length <= 1) {
    return { description: '', value: '' }
  }
  const encoding = frame[0] ?? 0
  const body = frame.slice(1)
  const separator = encoding === 1 || encoding === 2 ? [0, 0] : [0]
  const index = findSeparator(body, separator)
  if (index === -1) {
    return { description: '', value: decodeEncodedText(encoding, body).trim() }
  }
  return {
    description: decodeEncodedText(encoding, body.slice(0, index)).trim(),
    value: decodeEncodedText(encoding, body.slice(index + separator.length)).trim(),
  }
}

function decodeEncodedText(encoding: number, body: Uint8Array): string {
  try {
    if (encoding === 1) {
      return new TextDecoder('utf-16').decode(body)
    }
    if (encoding === 2) {
      return new TextDecoder('utf-16be').decode(body)
    }
    if (encoding === 3) {
      return new TextDecoder('utf-8').decode(body)
    }
  } catch {
    // fall through to latin1-style decoding below
  }

  return Array.from(body, (byte) => String.fromCharCode(byte)).join('')
}

function findSeparator(body: Uint8Array, separator: number[]): number {
  outer: for (let index = 0; index <= body.length - separator.length; index += 1) {
    for (let offset = 0; offset < separator.length; offset += 1) {
      if (body[index + offset] !== separator[offset]) {
        continue outer
      }
    }
    return index
  }
  return -1
}

function readSynchsafe(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) << 21) |
    ((data[offset + 1] ?? 0) << 14) |
    ((data[offset + 2] ?? 0) << 7) |
    (data[offset + 3] ?? 0)
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) << 24) |
    ((data[offset + 1] ?? 0) << 16) |
    ((data[offset + 2] ?? 0) << 8) |
    (data[offset + 3] ?? 0)
}

function toASCII(data: Uint8Array): string {
  return Array.from(data, (byte) => String.fromCharCode(byte)).join('')
}

function splitArtistTitle(title: string): { artist?: string; song?: string } {
  const normalized = title.trim()
  if (!normalized) return {}

  for (const separator of [' - ', ' – ', ' — ']) {
    const index = normalized.indexOf(separator)
    if (index > 0 && index < normalized.length - separator.length) {
      return {
        artist: normalized.slice(0, index).trim() || undefined,
        song: normalized.slice(index + separator.length).trim() || undefined,
      }
    }
  }

  return { song: normalized }
}

function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase())
}