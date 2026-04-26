# Tag Approved Stations

Audit and apply the editorial tagging strategy to all approved stations.

## Tagging model

Every station must be tagged across five dimensions:

| Dimension | Field | Vocabulary | Required |
|-----------|-------|------------|----------|
| Genre | `genres` | open, lowercase | yes (≥1) |
| Subgenre | `subgenre_tags` | open, lowercase, 1–4 values | optional |
| Style | `style_tags` | controlled (see below) | optional, 2–4 values |
| Format | `format_tags` | closed (see below) | optional, 1–3 values |
| Texture | `texture_tags` | controlled (see below) | optional, 2–3 values |

**Style** (pick only from): curated, editorial, underground, independent, community, cultural, experimental

**Format** (pick only from): hosted, automated, continuous, scheduled, freeform, session

**Texture** (pick only from): smooth, raw, dense, minimal, warm, gritty, bright, spacious, dark, deep, lo-fi

## Tagging rules

- At least 1 genre is mandatory
- Prefer precision over coverage — do not over-tag
- Do not invent values in Style, Format, or Texture
- Genre values must not be repeated as standalone values in subgenre (e.g. if genre is `jazz`, subgenre must not include `jazz` — use `bebop`, `vocal jazz`, `contemporary jazz` instead)
- Do not use `eclectic` as a genre unless the station explicitly markets itself that way — use the dominant actual genres instead
- Texture describes perceptual feel, NOT genre (e.g. `ambient` is a subgenre, not a texture)
- Do not use subjective or emotional terms (e.g. "uplifting", "emotional")
- Subgenre values like locations, business models, codecs, branding, or format terms are not subgenres and must be removed (e.g. `new york city`, `non-commercial`, `aac`, `public radio`, `dj sets` are all wrong in subgenre)

## Controlled vocabulary violations to watch for

These values are commonly misused and must be corrected if found:

**Invalid in Style**: `eclectic`, `atmospheric`, `meditative`, `minimal`, `public`
**Invalid in Format**: `live`, `mixed`, `programmed`, `ad-free`, `minimal talk`, `no talk`, `continous stream`
**Invalid in Texture**: `analog`, `dynamic`, `rich`

## Procedure

### 1. Authenticate

Get a backend JWT by calling:

```http
POST $API_URL/auth/login
{"email": "...", "password": "..."}
```

Use the returned `accessToken` as the Bearer token for all subsequent requests. This is a backend JWT, not the NextAuth frontend session token — do not confuse the two.

Read `NEXT_PUBLIC_API_URL` from `frontend/.env.local`, or default to `http://localhost:8080`.

### 2. Fetch all approved stations

```http
GET $API_URL/admin/stations?status=approved&limit=200
Authorization: Bearer <token>
```

Paginate using `offset` if `count > 200`.

### 3. Classify stations

For each station, classify as:

- **EMPTY** — all of `genres`, `subgenre_tags`, `style_tags`, `format_tags`, `texture_tags` are empty
- **PARTIAL** — some dimensions are filled, others are empty
- **FULL** — all dimensions are filled

Both EMPTY and PARTIAL stations need attention. FULL stations should still be audited for vocabulary violations and genre/subgenre overlap.

### 4. Audit and assign tags

For each station needing work, infer or correct tags from: station name, `genres`, `country`, `city`, `overview`, and `editor_notes`.

Produce a JSON payload with all five dimensions:
```json
{
  "genres": ["..."],
  "subgenre_tags": ["..."],
  "style_tags": ["..."],
  "format_tags": ["..."],
  "texture_tags": ["..."]
}
```

Include `genres` in every update — it is mandatory and commonly missing. Only omit a dimension if you cannot confidently assign it.

### 5. Present proposals and confirm

Present the proposed tags for each station before applying. Group by station, show all five dimensions clearly. Ask for confirmation before applying.

### 6. Update each station

```http
PUT $API_URL/admin/stations/:id
Authorization: Bearer <token>
Content-Type: application/json
```

Only send the fields being updated — other fields are preserved server-side.

### 7. Report results

Output a summary table after all updates are applied:

| Station | Genre | Subgenre | Style | Format | Texture |
|---------|-------|----------|-------|--------|---------|

End with: "Tagged X of Y stations."

## Genre rules (expanded)

- `eclectic` as a genre is a last resort — use it only when the station is explicitly marketed as genre-agnostic (e.g. WFMU, KALX). For most stations, name the dominant genres.
- Freeform community stations typically span `indie`, `rock`, `jazz`, `experimental` — pick the ones that dominate.
- Automated thematic streams (e.g. SomaFM channels) almost always map to a single clean genre.
- Internet radio networks (e.g. NTS) that span many genres can use two genres: the dominant one plus `experimental` or `eclectic` only if warranted.

## Format rules (expanded)

- `hosted` — a human DJ or presenter is meaningfully involved
- `automated` — no real-time human presence; playlist-driven
- `continuous` — uninterrupted stream with no breaks or talk
- `scheduled` — structured programming grid (shows, timeslots)
- `freeform` — no strict programming rules; DJs choose freely
- `session` — live or recorded performance sets are a primary format

Most automated internet stations are `automated` + `continuous`. Most terrestrial public stations are `hosted` + `scheduled`. Do not use `freeform` for an automated stream just because the music is diverse.

## Example

Station: "Dublab" — genres: ["electronic"], country: "US", city: "Los Angeles"

```json
{
  "genres": ["electronic"],
  "subgenre_tags": ["experimental", "ambient", "beat music"],
  "style_tags": ["curated", "independent", "community"],
  "format_tags": ["freeform", "hosted"],
  "texture_tags": ["warm", "spacious"]
}
```
