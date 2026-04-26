# Update Station Metadata

Audit and update station metadata — city, country, and overview — for all approved stations.

## Fields covered

| Field      | Type   | Notes                                          |
|------------|--------|------------------------------------------------|
| `city`     | string | Clean city name only, no state abbreviations   |
| `country`  | string | Full country name, normalized form             |
| `overview` | string | 2–4 editorial sentences describing the station |
| `streams`  | array  | Ordered by quality; see stream rules below     |

## Stream quality rules

Streams must be ordered best → worst. Quality is determined by **effective bitrate first, codec second**:

- Lossless (FLAC, WAV) always ranks highest
- Higher bitrate beats lower bitrate
- At equal bitrate, AAC is preferred over MP3
- A higher-bitrate MP3 outranks a lower-bitrate AAC

**Reference order:**

| Stream  | Priority  |
|---------|-----------|
| FLAC    | 0 (best)  |
| 320 AAC | 1         |
| 320 MP3 | 2         |
| 256 AAC | 3         |
| 256 MP3 | 4         |
| 128 AAC | 5         |
| 128 MP3 | 6 (worst) |

**Additional rules:**

- Priorities must be sequential starting from `0` (not `1`)
- Prefer `https://` over `http://` when both are reachable
- Prefer `.pls` / `.m3u` / `.m3u8` over direct URLs at equal quality
- 1–4 streams per station; no duplicates

## Authentication

Get a backend JWT by calling:

```http
POST $API_URL/auth/login
{"email": "...", "password": "..."}
```

Use the returned `accessToken` as the Bearer token. This is a backend JWT — not the NextAuth frontend session token.

Read `NEXT_PUBLIC_API_URL` from `frontend/.env.local`, or default to `http://localhost:8080`.

## Procedure

### 1. Fetch all approved stations

```http
GET $API_URL/admin/stations?status=approved&limit=200
Authorization: Bearer <token>
```

Paginate using `offset` if `count > 200`.

### 2. Audit city and country

Check every station for:

- **Missing city** — empty string
- **Country used as city** — e.g. `California`, `Washington` instead of a city name
- **City containing state abbreviations** — e.g. `New Orleans, LA`, `East Orange, NJ` → strip to city only
- **Inconsistent country naming** — normalize to full country name without articles: `United States`, `United Kingdom`, `France`, `Belgium`. Not `The United States Of America` or `United States Of America`.
- **Factually wrong values** — verify city/country against the station's known location

### 3. Audit overview

Check every station for a missing or empty `overview` field. For stations that need one:

- 2–4 sentences
- Factual and editorial — explain what the station is, where it's from, what defines its sound or programming
- No marketing language or hype
- Tone: refined, informative, slightly opinionated — matching OSTGUT's editorial identity
- Do not describe the station's website or technical stream details

### 4. Present proposals and confirm

Show proposed city, country, and overview for each station that needs updating. Ask for confirmation before applying.

### 5. Apply updates

```http
PUT $API_URL/admin/stations/:id
Authorization: Bearer <token>
Content-Type: application/json
```

Only send the fields being updated — other fields are preserved server-side.

### 6. Report results

Output a summary table listing each updated station, what changed, and the final count.

## Country normalization reference

| Use | Do not use |
|-----|------------|
| United States | The United States Of America, United States Of America, USA, US |
| United Kingdom | UK, Great Britain |
| France | FR |
| Belgium | BE |

Use the same pattern for all other countries: full English name, no articles, no abbreviations.

## Overview writing guide

- Lead with what makes the station distinctive, not generic facts
- Mention city/country only if it is central to the station's identity
- For automated streams (e.g. SomaFM channels), describe the musical feel and audience context
- For broadcast stations (e.g. KEXP, WWOZ), describe the programming character and cultural role
- Avoid: "is a radio station that...", "founded in...", "you can listen to..."
- Avoid subjective praise: "incredible", "amazing", "one of the best"

## Example

Station: SomaFM Drone Zone, San Francisco, United States

```json
{
  "city": "San Francisco",
  "country": "United States",
  "overview": "Continuous ambient and drone — slow-moving, textural, and often nearly beatless. One of SomaFM's oldest and most distinctive channels, the Drone Zone is designed for deep focus, sleep, or the kind of listening that asks nothing of you."
}
```
