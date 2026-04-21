# Stream Probing

bouji.fm stores two URLs per stream variant: the **source URL** (what the admin entered, or what Radio Browser returned) and a **resolved URL** (the actual playable audio endpoint after following any indirection). Probing is the process that produces the resolved URL and fills in codec, transport, kind, and health metadata.

---

## What gets stored

Every row in `station_streams` has two URL columns:

| column | meaning |
|--------|---------|
| `url` | The URL as originally entered — a direct stream, `.pls`, `.m3u`, or `.m3u8`. Never overwritten after the first write. |
| `resolved_url` | The final playable endpoint after following playlist indirection and HTTP redirects. Updated on every probe. |

For a direct audio URL, both columns are the same URL (after redirect following).

For a `.pls` or `.m3u` URL, `url` stays as the playlist address and `resolved_url` is the first audio entry extracted from the playlist body. The player uses `resolved_url` for playback; re-probes re-read `url` to refresh `resolved_url` when CDN endpoints rotate.

For `.m3u8` (HLS), both columns are identical — HLS manifests are not resolved further, they are the stream.

---

## When probing happens

### 1. Admin create

On `POST /admin/stations`, the primary `stream_url` is probed synchronously with a **10-second timeout** before the station row is written. Create fails with `422` if the probe fails or detects an unsupported codec (currently FLAC). Successful probes are written to `station_streams` via `UpsertPrimaryForStation`.

### 2. Admin update — explicit stream list

On `PUT /admin/stations/:id` when the body includes a `streams` array, each URL is probed via `buildStationStreams` (one probe per entry, sequential, **12-second timeout each**). Update fails with `422` when any stream fails probing. When all probes pass, results replace the existing `station_streams` rows atomically via `ReplaceForStation`.

### 3. Admin update — single stream URL change

On `PUT /admin/stations/:id` when only `stream_url` changes (no `streams` array), the new URL is probed (**10-second timeout**) first. Update fails with `422` on probe failure. Successful probes are written back via `UpsertPrimaryForStation`, updating only the priority-1 row.

### 4. Ingestion sync (every 6 h)

The Radio Browser syncer uses `url_resolved` from the Radio Browser API, which is already pre-resolved for most stations. Ingestion uses `LightClassifyStreamURL` (URL-suffix classification, no network request) for all URLs. If the light classification returns `kind = playlist` (`.pls` or `.m3u`), a real `ProbeStream` call with an **8-second timeout** follows to resolve the audio URL. Roughly 5% of ingested URLs are playlists; the rest skip the network probe entirely.

### 5. Background re-probe (every 12 h)

The `Prober` goroutine runs once on startup, then on a 12-hour cycle. It fetches all `is_active = true` stream rows ordered by `last_checked_at ASC NULLS FIRST` (stalest first) and re-probes each one. Up to **10 concurrent workers** probe in parallel, each with a **10-second timeout**. Results are written back via `UpdateProbeResult`, which refreshes `resolved_url`, `kind`, `container`, `transport`, `mime_type`, `last_checked_at`, and `last_error`. Codec and bitrate are only updated when the probe returns non-empty values — existing known-good data is never overwritten with empty probe results.

---

## Probe failure behaviour

A probe failure during background re-probe is non-fatal and only updates `last_error` on the stream row. During admin create/update, probe failures are fatal and block save with `422`. Common reasons for probe failures:

- geo-blocking (stream responds 403 from server location)
- rate-limiting or connection refused
- context deadline exceeded (slow CDN, firewall drop)
- playlist with no valid entries
- non-audio content-type

A stream with a probe error is still offered to the player. The player uses `resolved_url` (which may be the URL from the last successful probe, or the original URL if the stream was never successfully probed).

---

## How the player uses probe data

`getPlayableVariants(station)` in `PlayerContext` reads `station.streams`, filters to `is_active = true`, sorts by `priority`, and maps each entry to `{ url: resolvedUrl || url, kind }`. The `kind` field drives the playback engine choice:

- `kind = "hls"` → HLS.js (or native Safari HLS)
- anything else → `<audio>` element with direct src

On fatal playback error (source unreachable, codec unsupported), the player tries the next variant in priority order before falling back to exponential backoff on the same variant.

---

## Probe depth limit

Playlist resolution is recursive up to depth 3. A `.pls` pointing to a `.m3u` pointing to another `.m3u` will resolve correctly; a fourth level of indirection returns an error.
