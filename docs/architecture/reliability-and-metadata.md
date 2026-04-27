# Reliability And Metadata

OSTGUT tracks two related but separate operational signals for each station:

- **Reliability**: can we still play the station?
- **Metadata**: can we extract now-playing information from the stream?

They are intentionally not the same thing. A station can be perfectly playable and still have no usable metadata. Likewise, a metadata-capable stream is not considered reliable unless the stream itself keeps probing successfully.

---

## Reliability

### Data model

Reliability exists in two layers:

- `station_streams.health_score`
- `stations.reliability_score`

`health_score` is the live operational signal for an individual stream variant. `reliability_score` is the station-level summary used by admin lists and API responses.

### Stream health

Each stream variant stores a `health_score` between `0` and `1`.

When a stream is created or edited from the admin UI, OSTGUT stores the stream row immediately and keeps health separate from the save action. Editors can then run explicit probe actions from the station detail page.

After that, the background prober adjusts health over time in `backend/internal/radio/prober.go`:

- successful reprobe: `+0.08`, capped at `1.0`
- failed reprobe: `-0.20`, floored at `0.0`

This makes health degrade faster than it recovers:

- one temporary failure hurts, but not catastrophically
- repeated failures quickly push a stream toward `0`
- a recovered stream must stay healthy across multiple probe cycles to climb back to `1`

### Station reliability

`stations.reliability_score` is now derived from stream health, not entered by admins.

The rule is:

- **station reliability = highest `health_score` among active stream variants**

That is deliberate. The player only needs one healthy active variant to keep the station playable, so we do not average healthy and unhealthy backups together.

Examples:

- one active stream at `1.0` and three bad backups at `0.1` => station reliability is `1.0`
- two active streams at `0.6` and `0.7` => station reliability is `0.7`
- no active healthy streams => station reliability trends toward `0`

### When station reliability is recomputed

The station-level score is resynced whenever stream health changes materially:

- admin create or replacement of station streams
- manual `Probe quality` or `Probe full`
- background reprobe updates

Implementation lives primarily in:

- `backend/internal/store/station_stream_store.go`
- `backend/internal/store/station_admin_tx.go`
- `backend/internal/radio/prober.go`

### Ingestion note

Radio Browser ingestion still seeds station rows with an initial `reliability_score` derived from Radio Browser vote and click data. That value acts as an initial seed during ingestion, but once stream rows are present and operational health updates start flowing, the station-level score is governed by stream health.

---

## Metadata

### Metadata Goal

The metadata system tries to answer: what is playing right now on this stream?

It does **not** determine whether a station is playable. Metadata is a UX enhancement, not a playback prerequisite.

### Metadata Data Model

Per stream variant, we store:

- `metadata_enabled`
- `metadata_type`
- `metadata_source`
- `metadata_url`
- `metadata_resolver`
- `metadata_resolver_checked_at`
- `metadata_delayed`
- `metadata_provider`
- `metadata_provider_config`

Separately, the live snapshot is stored in `stream_now_playing`:

- `title`
- `artist`
- `song`
- `source`
- `metadata_url`
- `error`
- `error_code`
- `fetched_at`
- `updated_at`

Meaning:

- `metadata_enabled`: editorial on/off switch
- `metadata_type`: configured native strategy, usually `auto`, or an explicit strategy such as `icy`, `icecast`, `shoutcast`, `id3`, `vorbis`, `hls`, `dash`, or `epg`
- `metadata_source`: durable detection hint for the last backend fetch strategy that succeeded, such as `icy`, `icecast`, `shoutcast`, `id3`, `vorbis`, `npr-composer`, or `nts-live`
- `metadata_url`: durable hint for the exact endpoint that most recently succeeded, such as the stream URL itself, `/status-json.xsl`, `/currentsong`, or `/7.html`
- `metadata_resolver`: persisted routing decision, `client`, `server`, or `none`
- `metadata_resolver_checked_at`: when the resolver was last verified
- `metadata_delayed`: durable flag set when a stream is known to need the extended ICY timeout budget (20 s vs 6 s). Future fetches skip the fast-path attempt and go straight to the slow budget, reducing redundant failures on streams with long metadata preambles or ad breaks
- `metadata_provider`: optional supplemental provider implementation, currently `npr-composer` or `nts-live`
- `metadata_provider_config`: provider-specific JSON configured by editorial UI, such as an NPR Composer UCS value or NTS channel identifier
- `stream_now_playing.*`: the high-churn live snapshot served by `GET /stations/:id/now-playing` and by SSE fan-out

The important split after the refactor is:

- `station_streams.metadata_*` stores durable routing and detection hints that survive restarts and speed up later checks
- `stream_now_playing` stores the latest fetched track payload and error state without rewriting the editorial stream row on every poll

### Detection strategies

The backend metadata fetcher tries several approaches in order. See `backend/internal/metadata/fetcher.go` and `backend/internal/metadata/resolve.go`.

In `auto` mode, it can detect metadata via:

- ICY in-stream metadata via HTTP
- raw TCP ICY fallback for legacy Shoutcast servers that answer with `ICY 200 OK`
- Icecast status endpoint
- Shoutcast text/status endpoints
- MP3 ID3 tags
- OGG Vorbis comments
- supplemental provider APIs, when `metadata_provider` is configured

When `metadata_url` and `metadata_source` are already known, the fetcher tries that exact hint first before falling back to broader discovery.

When native metadata is absent, the fetcher returns an explicit `no_metadata` error code instead of treating server reachability as metadata support. That error is stored in `stream_now_playing`, and the server resolver is set to `none` so future server polling stops until an explicit probe or configuration change discovers a supported metadata path.

The system stores the **detected** source in `metadata_source`, which is what the admin UI shows as a badge.

The frontend metadata resolver is separate. For streams whose delivery plan resolves to client work, the player tries browser-readable metadata using:

- direct ICY reads with `Icy-Metadata: 1`
- Icecast `status-json.xsl`
- Shoutcast `/currentsong`
- Shoutcast `/7.html`
- HLS in-segment ID3 via `hls.js` metadata events

If browser resolution succeeds, the player may show `Metadata: Client`. If no live metadata is available, or the latest snapshot carries `no_metadata`, the player shows no metadata badge.

### Resolver model

OSTGUT stores one authoritative metadata routing decision per stream:

- `client`: the browser should attempt metadata resolution
- `server`: the browser should subscribe to backend SSE fan-out only when no browser-readable client path is available
- `none`: the stream has no supported metadata path and the client should not poll

Stream API responses also include a backend-owned `metadata_plan` contract. The plan translates stored stream state into runtime behavior:

| Delivery | Runtime behavior | Pressure class |
|---|---|---|
| `none` | Player does not open SSE, does not call now-playing endpoints, and does not run client metadata polling. | `none` |
| `client-poll` | One browser tab polls the CORS-readable stream or metadata endpoint; other tabs follow the shared browser snapshot. | `client` |
| `hls-id3` | Player listens for ID3 metadata emitted by `hls.js`; no backend metadata polling is involved. | `client` |
| `sse` | Player subscribes to backend SSE fan-out; one backend poll loop fetches upstream metadata and fans out to listeners. | `server-live` |

The frontend treats `metadata_plan.delivery` as the runtime source of truth. A stale `metadata_resolver = server` is not enough to start SSE or server polling if the plan says `none`, and `stream_now_playing.error_code = no_metadata` is a hard client stop.

Resolver checks run in two places:

- the 12-hour background prober
- the manual `Probe resolver`, `Probe metadata`, and `Probe full` actions in admin

The backend decides routing by testing realistic browser constraints such as CORS and readable metadata endpoints, using configured app origins. Client-readable metadata is always preferred when available; `server` exists as the fallback path for streams that only the backend can read. For HLS streams, the prober also checks whether early media segments expose ID3 tags; HLS streams with detectable ID3 resolve to `client`, while HLS streams without ID3 resolve to `none`.

When a client-capability check succeeds, OSTGUT persists the resolver plus the winning client-readable `metadata_url`. When a backend metadata fetch succeeds, OSTGUT also persists the detected `metadata_source` and exact winning `metadata_url`. Both the backend poller and later manual probes reuse those hints before falling back to broader discovery. When a backend metadata fetch confirms `no_metadata`, the poller writes the error snapshot, sets the resolver to `none`, and exits any active poll loop for that stream.

### Manual probe behavior

Admin saves no longer perform live remote probes. Probe-derived metadata is now owned only by explicit manual probe actions and the scheduled background worker.

The stream probe actions are:

- `Probe resolver`: refresh `metadata_resolver` only
- `Probe metadata`: refresh resolver, refresh the cached now-playing snapshot, and persist detected `metadata_source`/`metadata_url` hints from the backend fetcher
- `Probe quality`: refresh signal/playability fields only
- `Probe loudness`: refresh loudness fields only
- `Probe full`: refresh signal, resolver, metadata snapshot, loudness, and any detected metadata hints

This keeps admin saves fast and predictable while still giving editors precise operational tools.

### Runtime now-playing behavior

`GET /stations/:id/now-playing` is a cache-backed read endpoint, and `GET /stations/:id/now-playing/stream` provides SSE fan-out for streams whose delivery plan is `sse`.

It no longer performs live upstream metadata discovery inside the request path. Instead, it:

- returns the latest stored now-playing snapshot immediately
- serves `disabled` or `unsupported` immediately from the stream's resolver/config/plan state when metadata is turned off or unsupported
- otherwise returns the last stored snapshot, including prior error state when one exists
- triggers a one-shot async refresh only for stale `sse` snapshots when no SSE poll loop is already active
- uses a shared per-stream background poller for `sse` streams, so one upstream fetch fan-outs to all listeners
- writes newly discovered backend detection hints back to `station_streams` while writing live track payloads to `stream_now_playing`

Client-resolved streams do not call backend now-playing endpoints on misses. They either resolve metadata directly from the browser, share a browser-local snapshot with follower tabs, or render without a metadata badge.

This removes slow metadata discovery from the playback-critical request path.

Primary implementation lives in:

- `backend/internal/metadata/fetcher.go`
- `backend/internal/metadata/resolve.go`
- `backend/internal/metadata/plan.go`
- `backend/internal/metadata/provider.go`
- `backend/internal/handler/nowplaying.go`
- `backend/internal/handler/metadata_poller.go`
- `backend/internal/handler/admin.go`
- `backend/internal/radio/hls_metadata_probe.go`
- `backend/internal/radio/client_metadata_support.go`
- `backend/internal/radio/prober.go`
- `backend/internal/store/station_stream_store.go`
- `backend/internal/store/stream_now_playing_store.go`
- `frontend/src/hooks/useNowPlaying.ts`
- `frontend/src/lib/metadata-badges.ts`

### Important separation from reliability

Metadata does not currently feed into reliability scoring.

That means:

- a stream can have `health_score = 1` and still show `no_metadata`
- a stream can expose `icy` metadata and still become unreliable if HTTP probing starts failing

This separation is intentional because playback continuity matters more than now-playing decoration.

---

## Loudness + Signal Normalization

### Normalization Goal

Signal normalization reduces loudness jumps between stations without changing the station stream itself.

It is a playback-layer adjustment:

- the underlying stream URL stays the same
- the backend stores measured loudness data per stream variant
- the frontend applies a temporary gain offset during playback when leveling is enabled

### Normalization Data Model

Per stream variant, loudness probe data is stored in `station_streams`:

- `loudness_integrated_lufs`
- `loudness_peak_dbfs`
- `loudness_sample_duration_seconds`
- `loudness_measured_at`
- `loudness_measurement_status`

Per user, the player preference payload stores:

- `normalizationEnabled`

That preference is persisted locally and synced through `GET/PUT /users/me/player-preferences` alongside volume and last station.

### How measurement works

Loudness is measured only when a probe scope explicitly asks for it:

- manual `Probe loudness`
- manual `Probe full`

The 12-hour background reprober skips loudness measurement so routine operational checks stay fast and do not keep re-measuring a relatively stable property.

Primary implementation lives in:

- `backend/internal/radio/loudness_probe.go`
- `backend/internal/radio/stream_probe.go`
- `backend/internal/store/station_stream_store.go`

The important output for playback is integrated loudness in **LUFS**.

If a probe succeeds, the stream row keeps the latest measured loudness and timestamp. If no valid loudness result is available, normalization safely falls back to no adjustment.

### How playback normalization works

The frontend player computes a gain offset from the current stream loudness.

Implementation lives in:

- `frontend/src/context/PlayerContext.tsx`
- `frontend/src/components/player-volume-control.tsx`
- `frontend/src/components/player-bar.tsx`

Current behavior:

- target loudness: **-17 LUFS**
- maximum boost: **+6 dB**
- maximum cut: **-9 dB**
- positive gain is capped by measured true peak at **-1 dBFS**
- normalization applies only when the stream has `loudness_measurement_status = measured`
- otherwise the effective offset is `0 dB`

The player multiplies the user’s base volume by the calculated gain and ramps smoothly between changes so switching stations does not create abrupt output jumps.

### User experience

In the player UI this appears as **Leveling**:

- users can toggle it on or off from the player controls
- the preference persists across reloads and signed-in devices
- when an offset is active, the player surfaces the applied dB adjustment in the quality stats area

### Important boundaries

Normalization is intentionally conservative:

- it does not rewrite audio files
- it does not modify station metadata
- it does not affect reliability scoring
- it does not apply when loudness data is missing or stale in a way that prevents a measured result

This keeps the feature reversible and low-risk: if measurement is unavailable, playback continues normally with no loudness compensation.
