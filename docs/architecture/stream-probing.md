# Stream Probing

OSTGUT stores two URLs per stream variant: the **source URL** (what the admin entered, or what Radio Browser returned) and a **resolved URL** (the actual playable audio endpoint after following any indirection). Probing is the process that produces the resolved URL and fills in codec, transport, kind, and health metadata.

For how probe results feed the station reliability score and how metadata detection is stored separately, see [Reliability And Metadata](./reliability-and-metadata.md).

---

## What gets stored

Every row in `station_streams` has two URL columns:

| column         | meaning                                                                                                               |
|----------------|-----------------------------------------------------------------------------------------------------------------------|
| `url`          | The URL as originally entered — a direct stream, `.pls`, `.m3u`, or `.m3u8`. Never overwritten after the first write. |
| `resolved_url` | The final playable endpoint after following playlist indirection and HTTP redirects. Updated on every probe.          |

For a direct audio URL, both columns are the same URL (after redirect following).

For a `.pls` or `.m3u` URL, `url` stays as the playlist address and `resolved_url` is the first audio entry extracted from the playlist body. The player uses `resolved_url` for playback; re-probes re-read `url` to refresh `resolved_url` when CDN endpoints rotate.

For `.m3u8` (HLS), both columns are identical — HLS manifests are not resolved further, they are the stream.

---

## When probing happens

### 1. Admin create

On `POST /admin/stations`, the primary `stream_url` is classified and stored without a live network probe. The goal is to keep editorial saves fast and predictable. Operational truth is established afterward by manual probes or the scheduled background worker.

### 2. Admin update — explicit stream list

On `PUT /admin/stations/:id` when the body includes a `streams` array, each URL is classified and stored without a live remote probe. Existing stream rows are replaced atomically via `ReplaceForStation`.

### 3. Admin update — single stream URL change

On `PUT /admin/stations/:id` when only `stream_url` changes (no `streams` array), the new URL is classified and written back via `UpsertPrimaryForStation` without a live remote probe.

### 4. Manual admin probes

The admin station detail page owns the explicit operational probes:

- `Probe quality`
  - runs a stream probe with a **12-second timeout**
  - updates `resolved_url`, codec/container/transport fields, `health_score`, `last_checked_at`, and `last_error`
  - does not touch loudness or now-playing snapshot
- `Probe resolver`
  - checks whether the stream should route metadata through `client` or `server`
  - updates `metadata_resolver` and `metadata_resolver_checked_at`
  - also stores a client-readable `metadata_url` hint when the browser-capability probe finds one
- `Probe metadata`
  - refreshes the stored resolver
  - refreshes cached now-playing snapshot in `stream_now_playing`
  - persists detected backend `metadata_source` and `metadata_url` hints back to `station_streams`
  - updates `metadata_delayed` if the stream needed the extended ICY timeout budget to return metadata
- `Probe loudness`
  - runs loudness sampling only
  - updates loudness fields without touching resolver or now-playing snapshot
- `Probe full`
  - combines quality, resolver, metadata snapshot, loudness, and metadata detection hint updates

### 5. Ingestion sync (every 6 h)

The Radio Browser syncer uses `url_resolved` from the Radio Browser API, which is already pre-resolved for most stations. Ingestion uses `LightClassifyStreamURL` (URL-suffix classification, no network request) for all URLs. If the light classification returns `kind = playlist` (`.pls` or `.m3u`), a real `ProbeStream` call with an **8-second timeout** follows to resolve the audio URL. Roughly 5% of ingested URLs are playlists; the rest skip the network probe entirely.

### 6. Background re-probe (every 12 h)

The `Prober` goroutine runs once on startup, then on a 12-hour cycle. It fetches all `is_active = true` stream rows ordered by `last_checked_at ASC NULLS FIRST` (stalest first) and re-probes each one.

Up to **10 concurrent workers** run in parallel. Each stream gets:

- a **10-second** stream probe budget for URL/codec/signal refresh
- a separate **8-second** metadata resolver probe budget for browser-capability checks

Results are written back via `UpdateProbeResult`, which refreshes `resolved_url`, `kind`, `container`, `transport`, `mime_type`, `last_checked_at`, `last_error`, `health_score`, and `metadata_resolver`. Codec and bitrate are only updated when the probe returns non-empty values, so existing known-good data is never overwritten with empty probe results.

The background re-probe does not fetch live now-playing snapshots and does not update `metadata_source`. It only refreshes routing state (`metadata_resolver`, `metadata_resolver_checked_at`, and sometimes `metadata_url`) plus stream health/probe fields.

The background cycle does **not** measure loudness. Loudness is intentionally reserved for explicit loudness-aware probes.

---

## Probe failure behaviour

A probe failure during background re-probe is non-fatal and only updates operational fields on the stream row. Admin saves are no longer blocked by live probe failures because saves do not probe. Common reasons for probe failures:

- geo-blocking (stream responds 403 from server location)
- rate-limiting or connection refused
- context deadline exceeded (slow CDN, firewall drop)
- playlist with no valid entries
- non-audio content-type

A stream with a probe error is still offered to the player. The player uses `resolved_url` when available, falling back to the stored source URL.

---

## How the player uses probe data

`getPlayableVariants(station)` in `PlayerContext` reads `station.streams`, filters to `is_active = true`, sorts by `priority`, and maps each entry to `{ url: resolvedUrl || url, kind }`. The `kind` field drives the playback engine choice:

- `kind = "hls"` → HLS.js (or native Safari HLS)
- anything else → `<audio>` element with direct src

On fatal playback error (source unreachable, codec unsupported), the player tries the next variant in priority order before falling back to exponential backoff on the same variant.

For metadata specifically:

- `metadata_resolver = client` means the frontend attempts metadata directly in the browser
- `metadata_resolver = server` means the frontend consumes cached snapshots and SSE updates from the backend only when no browser-readable client path is available
- `metadata_resolver = none` means the player should not attempt metadata polling for that stream

Client resolution is the preferred route whenever the browser can read metadata directly. `server` is a fallback for streams whose metadata is not browser-readable under real browser constraints such as CORS or missing client-readable metadata endpoints.

---

## Probe depth limit

Playlist resolution is recursive up to depth 3. A `.pls` pointing to a `.m3u` pointing to another `.m3u` will resolve correctly; a fourth level of indirection returns an error.
