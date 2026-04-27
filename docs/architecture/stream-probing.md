# Stream Probing

OSTGUT treats stream probing as bounded evidence collection, not URL filtering. URL shape is only a cheap hint. A live probe can follow redirects, resolve playlist indirection, inspect response headers, parse early audio bytes, test browser metadata readability, and then persist operational decisions used by playback, diagnostics, and future probe scheduling.

For how probe results feed station reliability and metadata routing, see [Reliability And Metadata](./reliability-and-metadata.md).

---

## Stored Stream Fields

Every playable variant lives in `station_streams`.

| Column | Meaning |
|---|---|
| `url` | Source URL as entered by an admin or imported from Radio Browser. This may be direct audio, `.pls`, `.m3u`, or `.m3u8`. |
| `resolved_url` | Final playable endpoint after HTTP redirects and playlist resolution. The player prefers this field and falls back to `url`. |
| `kind` | Playback family: `direct`, `playlist`, or `hls`. |
| `container` | Playlist/container hint: `none`, `m3u`, `m3u8`, or `pls`. |
| `transport` | Observed transport/protocol family: `http`, `https`, `icy`, `shoutcast`, or `icecast`. |
| `mime_type` | Response content type observed during probing, normalized without parameters. |
| `codec`, `bit_depth`, `sample_rate_hz`, `sample_rate_confidence`, `channels` | Audio evidence from content type, URL hints, or parsed early stream bytes. |
| `health_score` | Operational score for the stream variant. Successful probes raise it gradually; failed probes lower it faster. |
| `last_checked_at` | Last stream quality/probe check timestamp. |
| `last_error` | Human-readable last probe error, kept for admin/debugging. |
| `last_probe_error_code` | Typed last probe failure code used for scheduling and diagnostics. Empty string means the latest stream probe succeeded. |
| `next_probe_at` | The next time the recurring worker may spend maintenance budget on this stream. |
| `metadata_enabled`, `metadata_type`, `metadata_source`, `metadata_url`, `metadata_resolver`, `metadata_resolver_checked_at`, `metadata_delayed`, `metadata_provider`, `metadata_provider_config` | Metadata routing, detection evidence, and optional supplemental provider configuration. |
| `loudness_*` | Loudness evidence produced only by explicit loudness-aware probes. |

For direct audio URLs, `url` and `resolved_url` usually match except for HTTP redirects. For `.pls` and `.m3u`, `url` stays as the playlist address while `resolved_url` becomes the first resolved playable entry. For `.m3u8`, `kind = hls` and the manifest URL remains the playable URL.

---

## Probe Evidence Pipeline

The implementation lives primarily in `backend/internal/radio/stream_probe.go`.

### 1. Light classification

`LightClassifyStreamURL` parses the URL and derives cheap hints from the path:

- `.m3u8` -> `kind = hls`, `container = m3u8`
- `.m3u` -> `kind = playlist`, `container = m3u`
- `.pls` -> `kind = playlist`, `container = pls`
- `.mp3`, `.aac`, `.aacp`, `.flac` -> codec hints
- `https://` -> `transport = https`; otherwise HTTP-family transport

This step performs no network request. It is used during editorial saves and as the base result for live probes.

### 2. URL and redirect safety

`ProbeStreamWithOptions` rejects invalid URLs, non-HTTP(S) schemes, and disallowed private/local targets before network I/O. Redirects are also bounded:

- max redirect count: `5`
- max redirect host changes: `2`
- redirect target must remain HTTP(S)
- redirect target must not be private/local/disallowed

Failures are stored with typed `last_probe_error_code` values such as `invalid_url`, `unsupported_scheme`, `disallowed_host`, `too_many_redirects`, or `too_many_host_changes`.

### 3. Bounded HTTP probe

Live probes use `GET` with:

- `Range: bytes=0-65535`
- `Icy-Metadata: 1`
- `Connection: close`
- a one-shot request connection

The body read is limited so never-ending radio streams do not pin workers indefinitely. The recurring worker gives stream quality probes a 10-second context budget.

### 4. Content and byte evidence

After a successful response, the probe combines:

- final redirected URL
- response `Content-Type`
- ICY headers such as `Icy-Metaint`, `Icy-Name`, and `Icy-Br`
- early response bytes

Content type can override path hints for playlist/HLS detection. Early bytes are parsed for:

- FLAC `STREAMINFO`
- MP3 frame headers
- AAC ADTS frame headers

Parsed audio bytes are stronger evidence than URL suffixes. URL filtering remains only a fallback hint.

### 5. Playlist resolution

For `kind = playlist`, the probe reads up to 64 KiB of playlist body and resolves the first playable entry:

- `.pls` via `FileN=` entries
- `.m3u` via non-comment entries
- relative playlist entries are resolved against the playlist URL
- recursion depth is limited to `3`

Playlist failures use typed codes such as `playlist_depth_exceeded`, `playlist_empty`, and `playlist_read_failed`.

### 6. Metadata resolver probe

Recurring and manual resolver/full probes separately test browser metadata support using `ProbeClientMetadataSupport`:

- ICY CORS preflight/read support
- Icecast `status-json.xsl`
- Shoutcast `currentsong`
- Shoutcast `7.html`
- configured/hinted metadata URLs when present

HLS streams use an HLS ID3 check. If ID3 metadata is not supported, HLS metadata routing becomes `none` rather than forcing server polling.

Metadata resolver checks use a separate 8-second budget in the recurring worker.

---

## Probe Modes

### Admin create

`POST /admin/stations` stores stream rows immediately. Stream URLs are light-classified but not fully probed during the save. New stream rows default `next_probe_at = NOW()`, so approved stations become eligible for recurring maintenance immediately.

### Admin update

`PUT /admin/stations/:id` stores explicit stream arrays without blocking on remote networks. If an existing URL is kept, known probe evidence is preserved across the save, including `resolved_url`, audio fields, metadata resolver fields, health, `next_probe_at`, `last_checked_at`, `last_error`, and `last_probe_error_code`.

If a station is moved to `approved`, its streams are marked due immediately by setting `next_probe_at = NOW()`.

### Manual admin probes

The admin station detail page owns explicit, user-triggered probes:

- `Probe quality`: stream reachability, resolved URL, content/codec fields, health, typed failure code, and next probe schedule
- `Probe resolver`: metadata routing only
- `Probe metadata`: metadata snapshot and detected metadata source hints
- `Probe loudness`: loudness only
- `Probe full`: quality, resolver, metadata, loudness, and detection hints

Manual probes can run on pending stations. That preserves editorial ability to validate a candidate before approval.

### Ingestion sync

Radio Browser ingestion imports stations as `pending`. It uses `url_resolved` from Radio Browser when available, light-classifies the stream, and only performs a short live probe for playlist or opaque direct URLs that need resolution/classification. Imported streams are not part of recurring maintenance until their station becomes `approved`.

### Recurring approved-stream maintenance

The `Prober` goroutine runs once on startup and then every 12 hours. It does not blindly probe every stream. It asks `StationStreamStore.ListDueActiveForApprovedStations` for active streams that satisfy all of:

- stream row is active
- station row is active
- station status is `approved`
- `next_probe_at <= now`

The batch limit is `500`, and up to `10` workers probe in parallel. Rows are ordered by `next_probe_at ASC, last_checked_at ASC NULLS FIRST` so the oldest due work is handled first.

Recurring probes do not measure loudness and do not fetch now-playing snapshots. They update stream quality fields, health, typed failure code, `next_probe_at`, and metadata resolver routing.

Recurring resolver checks are capability checks. Actual backend metadata discovery is owned by explicit metadata probes, the bulk metadata fetch job, and active SSE polling. If those discovery paths confirm `no_metadata`, they set `metadata_resolver = none` so future player sessions do not open server metadata polling for that stream.

---

## Probe Scheduling

The worker writes `next_probe_at` after every quality probe using `radio.NextProbeAt`:

| Latest result | Next recurring probe |
|---|---:|
| Success | `checked_at + 12h` |
| `timeout`, `request_failed` | `checked_at + 1h` |
| `http_status` | `checked_at + 6h` |
| Static/policy/playlist-shape failures (`invalid_url`, `unsupported_scheme`, `disallowed_host`, redirect policy failures, playlist depth/empty/read failures) | `checked_at + 24h` |
| Unknown typed failure | `checked_at + 3h` |

This makes stream maintenance budget-sensitive:

- stable approved streams are checked at the normal cadence
- transient network failures retry sooner
- static failures back off longer instead of being hammered every cycle
- pending/rejected catalog candidates cost no recurring probe budget

---

## Failure Codes

`last_error` remains human-readable. `last_probe_error_code` is the machine-readable scheduling/diagnostic signal.

Current codes:

- `invalid_url`
- `unsupported_scheme`
- `disallowed_host`
- `too_many_redirects`
- `redirect_unsupported_scheme`
- `too_many_host_changes`
- `timeout`
- `request_failed`
- `http_status`
- `playlist_depth_exceeded`
- `playlist_empty`
- `playlist_read_failed`

Empty string means the latest quality probe succeeded.

---

## Health Score

The recurring prober updates stream health in `backend/internal/radio/prober.go`:

- success: `+0.08`, capped at `1.0`
- failure: `-0.20`, floored at `0.0`

This intentionally recovers slowly and degrades quickly. A brief successful recovery should not instantly erase repeated failures, while a newly failing approved stream should become visible to operations quickly.

---

## Player Use

The player reads station stream variants, filters active rows, sorts by priority, and plays `resolved_url || url`.

- `kind = hls` uses HLS playback
- other kinds use normal audio element playback
- playback errors try the next variant before falling back to retry/backoff

Metadata routing is exposed to the player through `metadata_plan`, which is built from stream metadata fields and probe evidence:

- `delivery = client-poll`: frontend attempts browser-readable metadata directly, with one browser tab acting as poll leader
- `delivery = hls-id3`: frontend listens for HLS ID3 metadata emitted during playback
- `delivery = sse`: frontend consumes backend SSE fan-out and the backend owns upstream polling pressure
- `delivery = none`: frontend does not attempt metadata polling for that stream

The raw `metadata_resolver` value remains a durable routing hint, but `metadata_plan.delivery` is the runtime contract consumed by the player. Streams with `no_metadata` evidence should resolve to `delivery = none` and should not show metadata badges.

Probe errors do not automatically remove a stream from playback. They inform admin diagnostics, station reliability, and the next maintenance schedule.
