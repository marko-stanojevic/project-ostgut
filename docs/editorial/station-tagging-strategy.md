# Station Tagging Strategy

## Purpose

Define a consistent, expressive, and scalable tagging system for radio stations that enables:

- clear categorization
- strong discovery and filtering
- consistent metadata across all stations
- a coherent editorial identity

---

## Core Principles

- **Clarity over cleverness**
- **No overlapping dimensions**
- **Strict where needed, flexible where valuable**
- **Editorial, not overly technical**
- **Designed for consistency across systems and contributors**

---

## Data Model

```json
{
  "genres": [],
  "subgenre_tags": [],
  "style_tags": [],
  "format_tags": [],
  "texture_tags": []
}
```

---

## Genre (REQUIRED)

High-level musical identity. Mandatory — at least 1 value required.

**Rules:**

- Open vocabulary, lowercase
- Should represent the station's dominant musical domain
- Do not use `eclectic` as a genre unless the station explicitly markets itself as genre-agnostic (e.g. a true freeform station). For most stations, name the actual dominant genres instead.
- Genre values must not be repeated as standalone values in `subgenre_tags` (see Subgenre section below)

**Examples:** `electronic`, `jazz`, `hip-hop`, `indie`, `rock`, `folk`, `soul`, `reggae`, `global`, `country`, `experimental`

---

## Subgenre (OPTIONAL)

Precise musical classification and scene-specific identity — one level more specific than Genre.

**Rules:**

- Open vocabulary, normalized: lowercase, consistent naming
- 1–4 values recommended
- Must NOT repeat a Genre value as a standalone term (e.g. if genre is `jazz`, subgenre must not include `jazz` — use `bebop`, `vocal jazz`, `contemporary jazz` instead)
- Must NOT contain: locations, business model terms, codecs, branding, or format descriptors

**Genre–Subgenre Distinction:**

The subgenre must always be more specific than the genre. If the genre answers "what kind of music?", the subgenre answers "what specific style or scene?".

| Genre      | Valid subgenres                                | Invalid    |
|------------|------------------------------------------------|------------|
| jazz       | bebop, vocal jazz, big band, contemporary jazz | jazz       |
| electronic | ambient, deep house, idm, goa trance           | electronic |
| soul       | classic soul, gospel soul, funk, motown        | soul, r&b  |
| folk       | alt-folk, indie folk, contemporary folk        | folk       |
| reggae     | roots reggae, rocksteady, dub, ska             | reggae     |

**What does NOT belong in subgenre:**

- Locations: `new york city`, `new orleans`, `seattle`
- Business model: `non-commercial`, `no ads`, `public radio`
- Codecs/tech: `aac`, `mp3`
- Branding: `radio france`, `npr`, `defcon`
- Format terms: `freeform`, `dj sets`, `live`, `programmed`
- Mood/vibe: `chill`, `mellow`, `uplifting`
- Era alone: `80s`, `sixties` (use the style name instead: `new wave`, `synthpop`)

**Examples:** `dub techno`, `deep house`, `ambient`, `roots reggae`, `bossa nova`, `dream pop`, `doom metal`, `yacht rock`, `contemporary jazz`

---

## Style (OPTIONAL, CONTROLLED)

Intent, curation approach, and cultural positioning of the station.

**Allowed values:** `curated`, `editorial`, `underground`, `independent`, `community`, `cultural`, `experimental`

**Rules:**

- Use only the values above — no additions
- 2–4 values recommended
- `eclectic`, `public`, `atmospheric`, `meditative`, `minimal` are NOT valid style values

---

## Format (OPTIONAL, CLOSED)

How the station is structured and delivered over time.

**Allowed values:** `hosted`, `automated`, `continuous`, `scheduled`, `freeform`, `session`

**Rules:**

- Closed vocabulary — no additions permitted
- 1–3 values recommended

**Value definitions:**

| Value | Meaning |
|-------|---------|
| hosted | human DJ or presenter meaningfully involved |
| automated | no real-time human presence; playlist-driven |
| continuous | uninterrupted stream with no breaks or talk |
| scheduled | structured programming grid with shows or timeslots |
| freeform | no strict programming rules; DJs choose freely in the moment |
| session | live or recorded performance sets are a primary format |

**Common mistakes:**

- Do not use `freeform` for an automated stream just because its music is varied — `freeform` means human DJs choose freely in real time
- `live`, `programmed`, `ad-free`, `no talk`, `minimal talk` are NOT valid format values
- Most automated internet streams are `automated` + `continuous`
- Most terrestrial public stations are `hosted` + `scheduled`

---

## Texture (OPTIONAL, CONTROLLED)

Perceptual and sonic qualities of the listening experience.

**Allowed values:** `smooth`, `raw`, `dense`, `minimal`, `warm`, `gritty`, `bright`, `spacious`, `dark`, `deep`, `lo-fi`

**Rules:**

- 2–3 values recommended
- Must describe perceptual feel, not genre or structure
- `analog`, `dynamic`, `rich` are NOT valid texture values
- Do not use subjective or emotional terms (e.g. "uplifting", "emotional", "meditative")
- `ambient` is a subgenre, not a texture

---

## General Rules

- Always include at least 1 Genre
- Prefer precision over coverage — do not over-tag
- Do not invent new values in controlled categories
- Keep all values normalized: lowercase, consistent naming

---

## Anti-Patterns

Avoid:

- Using `eclectic` as a genre when actual genres can be named
- Repeating genre values in subgenre (e.g. jazz/jazz, soul/soul)
- Using texture as genre (e.g. `ambient` as texture)
- Putting locations, codecs, or branding in subgenre
- Creating new format values
- Using invalid style values: `eclectic`, `public`, `atmospheric`
- Using invalid texture values: `analog`, `dynamic`, `rich`
- Using invalid format values: `live`, `programmed`, `ad-free`
- Over-tagging everything
- Using subjective descriptors (e.g. "emotional", "uplifting")

---

## Design Philosophy

| Dimension | Purpose |
|-----------|---------|
| Genre | What it is |
| Subgenre | Precise style and scene |
| Style | Intent and positioning |
| Format | Structure and delivery |
| Texture | Perceptual feel |

---

## Examples

### WWOZ 90.7 — New Orleans jazz and blues

```json
{
  "genres": ["jazz", "blues"],
  "subgenre_tags": ["second line", "brass band", "delta blues", "traditional jazz"],
  "style_tags": ["community", "cultural", "curated"],
  "format_tags": ["hosted", "scheduled", "session"],
  "texture_tags": ["dense", "raw", "warm"]
}
```

### SomaFM Drone Zone — automated ambient stream

```json
{
  "genres": ["electronic"],
  "subgenre_tags": ["ambient", "drone", "dark ambient", "chillout"],
  "style_tags": ["curated", "independent", "experimental"],
  "format_tags": ["automated", "continuous"],
  "texture_tags": ["spacious", "dark", "minimal"]
}
```
