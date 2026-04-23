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

When a stream is created or replaced from the admin UI:

- a successful synchronous probe starts it at `1.0`
- admin save fails if the probe is unsuccessful, so broken streams do not enter the system through the normal editorial path

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

- admin create of a station stream
- admin replacement of the stream list
- admin update of the primary stream
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
- `metadata_error`
- `metadata_error_code`
- `metadata_last_fetched_at`

Meaning:

- `metadata_enabled`: editorial on/off switch
- `metadata_type`: configured strategy, currently always `auto`
- `metadata_source`: the strategy that actually succeeded, such as `icy`, `icecast`, or `shoutcast`
- `metadata_error` / `metadata_error_code`: last known failure state
- `metadata_last_fetched_at`: timestamp of the last metadata attempt recorded on the stream row

### Detection strategies

The metadata fetcher tries several approaches in order. See `backend/internal/metadata/metadata.go`.

In `auto` mode, it can detect metadata via:

- ICY in-stream metadata
- Icecast status endpoint
- Shoutcast text/status endpoints

The system stores the **detected** source in `metadata_source`, which is what the admin UI shows as a badge.

### Admin save behavior

When an editor saves a station stream in the admin UI:

- the stream is probed for playback validity
- metadata is fetched in `auto` mode if metadata polling is enabled
- the detected source and the latest metadata error snapshot are saved onto the stream row

This gives editors immediate feedback about whether the stream currently responds like `icy`, `icecast`, `shoutcast`, or not at all.

### Runtime polling behavior

Now-playing requests reuse a shared metadata fetcher.

Key properties:

- results are cached for **30 seconds** when metadata is supported
- unsupported/no-metadata results are cached for **3 minutes**
- concurrent requests for the same stream are deduplicated with `singleflight`

This means multiple clients do not multiply upstream metadata load linearly.

When a now-playing fetch succeeds or fails, the backend also persists the latest detected metadata source and failure snapshot back to the stream row. That keeps admin status reasonably current over time without requiring editors to resave the station.

Primary implementation lives in:

- `backend/internal/metadata/metadata.go`
- `backend/internal/handler/nowplaying.go`
- `backend/internal/handler/admin.go`
- `backend/internal/store/station_stream_store.go`

### Metadata status values

The fetcher returns a normalized status model:

- `ok`: metadata was found
- `unsupported`: no supported metadata strategy worked
- `disabled`: metadata polling is disabled for that stream
- `error`: a request or parsing failure occurred

Common error codes include:

- `disabled_by_admin`
- `no_metadata`
- `timeout`
- `bad_status`
- `parse_error`
- `protocol_error`
- `fetch_failed`

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

During stream probing, the backend samples audio and runs a loudness measurement pass.

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
