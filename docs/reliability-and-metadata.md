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

### Goal

The metadata system tries to answer: what is playing right now on this stream?

It does **not** determine whether a station is playable. Metadata is a UX enhancement, not a playback prerequisite.

### Data model

Per stream variant, we store:

- `metadata_enabled`
- `metadata_type`
- `metadata_source`
- `metadata_url`
- `metadata_resolver`
- `metadata_resolver_checked_at`
- `metadata_error`
- `metadata_error_code`
- `metadata_last_fetched_at`
- `now_playing_title`
- `now_playing_artist`
- `now_playing_song`

Meaning:

- `metadata_enabled`: editorial on/off switch
- `metadata_type`: configured strategy, currently always `auto`
- `metadata_source`: the strategy that actually succeeded, such as `icy`, `icecast`, or `shoutcast`
- `metadata_url`: the exact metadata endpoint that last succeeded, such as the stream URL itself, `/status-json.xsl`, `/currentsong`, or `/7.html`
- `metadata_resolver`: persisted routing decision, `client` or `server`
- `metadata_resolver_checked_at`: when the resolver was last verified
- `metadata_error` / `metadata_error_code`: last known failure state
- `metadata_last_fetched_at`: timestamp of the last metadata attempt recorded on the stream row
- `now_playing_*`: the latest cached snapshot served by `GET /stations/:id/now-playing`

### Detection strategies

The backend metadata fetcher tries several approaches in order. See `backend/internal/metadata/metadata.go`.

In `auto` mode, it can detect metadata via:

- ICY in-stream metadata
- Icecast status endpoint
- Shoutcast text/status endpoints

The system stores the **detected** source in `metadata_source`, which is what the admin UI shows as a badge.

The frontend metadata resolver is separate. For streams whose stored resolver is `client`, the player first tries browser-readable metadata using:

- direct ICY reads with `Icy-Metadata: 1`
- Icecast `status-json.xsl`
- Shoutcast `/currentsong`
- Shoutcast `/7.html`

If browser resolution succeeds, the player shows `Metadata: Client`. If not, the hook can temporarily downgrade to server behavior in-session after repeated misses. The persisted resolver remains owned by backend probes.

### Resolver model

OSTGUT stores one authoritative metadata routing decision per stream:

- `client`: the browser should attempt metadata resolution
- `server`: the browser should skip client metadata resolution and use backend polling
- empty string: resolver not checked yet

Resolver checks run in two places:

- the 12-hour background prober
- the manual `Probe resolver`, `Probe metadata`, and `Probe full` actions in admin

The backend decides `client` vs `server` by testing realistic browser constraints such as CORS and readable metadata endpoints, using configured app origins.

When a metadata probe or fetch succeeds, OSTGUT also persists the exact winning metadata URL. Both the backend refresher and the frontend client resolver try that stored endpoint first on later polls before falling back to broader discovery.

### Manual probe behavior

Admin saves no longer perform live remote probes. Probe-derived metadata is now owned only by explicit manual probe actions and the scheduled background worker.

The stream probe actions are:

- `Probe resolver`: refresh `metadata_resolver` only
- `Probe metadata`: refresh resolver plus cached now-playing snapshot
- `Probe quality`: refresh signal/playability fields only
- `Probe loudness`: refresh loudness fields only
- `Probe full`: refresh signal, resolver, metadata snapshot, and loudness

This keeps admin saves fast and predictable while still giving editors precise operational tools.

### Runtime now-playing behavior

`GET /stations/:id/now-playing` is now a cache-backed read endpoint.

It no longer performs live upstream metadata discovery inside the request path. Instead, it:

- returns the latest stored now-playing snapshot immediately
- serves `disabled`, `unsupported`, or `error` states from persisted stream fields
- schedules an async refresh when the cached snapshot is stale

This removes slow metadata discovery from the playback-critical request path.

Primary implementation lives in:

- `backend/internal/metadata/metadata.go`
- `backend/internal/handler/nowplaying.go`
- `backend/internal/radio/metadata_refresher.go`
- `backend/internal/handler/admin.go`
- `backend/internal/radio/client_metadata_support.go`
- `backend/internal/radio/prober.go`
- `backend/internal/store/station_stream_store.go`

### Important separation from reliability

Metadata does not currently feed into reliability scoring.

That means:

- a stream can have `health_score = 1` and still show `no_metadata`
- a stream can expose `icy` metadata and still become unreliable if HTTP probing starts failing

This separation is intentional because playback continuity matters more than now-playing decoration.

---

## Loudness + Signal Normalization

### Goal

Signal normalization reduces loudness jumps between stations without changing the station stream itself.

It is a playback-layer adjustment:

- the underlying stream URL stays the same
- the backend stores measured loudness data per stream variant
- the frontend applies a temporary gain offset during playback when leveling is enabled

### Data model

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
