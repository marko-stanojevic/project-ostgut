# Station Entry Guide

## Purpose

Define a consistent process for adding or updating radio stations while preserving:

- high-quality metadata
- reliable streaming
- consistent tagging
- strong editorial presentation

This guide applies to all stations regardless of how they are added.

## Core Principles

- Clarity over cleverness
- No overlapping dimensions
- Strict where needed, flexible where valuable
- Editorial, not overly technical
- Consistency across all stations

## Station Structure

Each station entry should follow this structure:

```json
{
  "name": "",
  "about": "",
  "editorial_review": "",
  "streams": [],
  "tags": {
    "genre": [],
    "subgenre": [],
    "style": [],
    "format": [],
    "texture": []
  },
  "icon": ""
}
```

## Text Fields

### About

`about` provides a clear, factual overview of the station.

Rules:

- 3-5 sentences
- Concise and informative
- No hype or marketing language
- Explain what the station is, where it is based if relevant, and what music or programming defines it

### Editorial Review

`editorial_review` adds a more personal and atmospheric perspective.

Rules:

- More expressive than `about`
- Focus on music, curation, feel, and ambience
- Avoid cliches and generic praise
- Keep the tone refined and intentional

## Streams

### Number of Streams

- 1-4 stream URLs per station

### Priority

Each stream must include a `priority`.

- `0` is the highest quality
- Priorities must be unique
- Priorities must be sequential starting from `0`
- Keep the list to a maximum of 4 streams

### Quality Ordering

Streams must be ordered best to worst quality.

Quality is determined by effective bitrate first, codec second:

1. Lossless or hi-res formats such as FLAC and WAV always rank highest.
2. Higher bitrate beats lower bitrate.
3. At equal bitrate, AAC is preferred over MP3.

Examples:

| Stream  | Priority  |
|---------|-----------|
| FLAC    | 0 (best)  |
| 320 AAC | 1         |
| 320 MP3 | 2         |
| 256 AAC | 3         |
| 256 MP3 | 4         |
| 128 AAC | 5         |
| 128 MP3 | 6 (worst) |

A higher-bitrate MP3 outranks a lower-bitrate AAC. AAC only wins when bitrates are equal.

### Stream Type Preference

For streams of equal quality:

- Prefer `.pls`, `.m3u`, or `.m3u8`
- Avoid direct URLs unless necessary
- Prefer `https://` over `http://` when both are available and reachable

### Validation

- No duplicate URLs
- No duplicate priorities
- All streams must be reachable

### Health Checks

Stream health is handled automatically:

- Streams are periodically validated
- Failures trigger fallback to the next priority
- Recovery is automatic

No manual configuration is required.

Example:

```json
"streams": [
  { "url": "https://example.com/stream.flac.m3u", "priority": 0 },
  { "url": "https://example.com/stream.aac.m3u", "priority": 1 },
  { "url": "https://example.com/stream.mp3", "priority": 2 }
]
```

## Tags

Follow the tagging strategy defined in [station-tagging-strategy.md](station-tagging-strategy.md).

## Station Icon

Requirements:

- High quality
- Square (1:1) preferred
- Clear at small sizes

Processing:

- Automatically resized into multiple sizes
- Optimized for UI layers

Guidelines:

- Avoid low resolution
- Avoid heavy compression
- Keep the design simple

## Quality Checklist

Before adding a station:

- [ ] Name is correct
- [ ] About is clear and factual
- [ ] Editorial review adds meaningful perspective
- [ ] Streams are valid and prioritized correctly
- [ ] Tags follow taxonomy rules
- [ ] Icon is high quality

## Anti-Patterns

Avoid:

- Over-tagging
- Using texture as genre
- Inventing new format values
- Vague or generic descriptions
- Broken or duplicate streams

## Summary

A good station entry is:

- Technically reliable
- Clearly described
- Consistently tagged
- Editorially distinct
- Visually recognizable
