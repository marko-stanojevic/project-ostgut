#!/usr/bin/env bash
# sync-editorial.sh — Sync editorial station decisions between environments.
#
# Modes:
#   Direct (DB → DB):
#     ./sync-editorial.sh <SOURCE_URL> <TARGET_URL>
#
#   Export to file (DB → file):
#     ./sync-editorial.sh --export <SOURCE_URL> <OUTPUT_FILE>
#
#   Upload to blob (file → Azure Blob Storage):
#     ./sync-editorial.sh --upload <ENV> <SQL_FILE>
#     Requires: az CLI authenticated (az login).
#     Uploads to: editorial-syncs/<ENV>/<timestamp>.sql
#     Prints the blob name so you can pass it to the import pipeline.
#
#   Import from file (file → DB):
#     ./sync-editorial.sh --import <INPUT_FILE> <TARGET_URL>
#
# Typical local dev workflow:
#   1. Export:  ./sync-editorial.sh --export "postgres://..." ./export.sql
#   2. Upload:  ./sync-editorial.sh --upload staging ./export.sql
#   3. Trigger the "import" or "sync" workflow in GitHub Actions.
#
# What syncs:
#   All stations where last_editor_action_at IS NOT NULL (set by admin actions),
#   plus all station_streams belonging to those stations.
#   Manual stations missing from target are inserted. Existing rows update only
#   when source timestamp is newer than target's. Streams are upserted by
#   (station_id, priority). Synced stream fields include audio format, metadata
#   routing config (resolver, source, url, delayed flag) and editorial flags.
#   Operational state (health_score, last_checked_at, last_error, loudness_*,
#   metadata_resolver_checked_at) is not synced.
#
# Dry run (direct and import modes):
#   DRY_RUN=true ./sync-editorial.sh ...

set -euo pipefail

DRY_RUN="${DRY_RUN:-false}"
EDITORIAL_CONTAINER="editorial-syncs"

# ── Mode detection ─────────────────────────────────────────────────────────────

MODE="direct"
if [[ "${1:-}" == "--export" ]]; then
  MODE="export"
  SOURCE_URL="${2:?--export requires <SOURCE_URL> <OUTPUT_FILE>}"
  OUTPUT_FILE="${3:?--export requires <SOURCE_URL> <OUTPUT_FILE>}"
elif [[ "${1:-}" == "--upload" ]]; then
  MODE="upload"
  UPLOAD_ENV="${2:?--upload requires <ENV> <SQL_FILE>}"
  UPLOAD_FILE="${3:?--upload requires <ENV> <SQL_FILE>}"
elif [[ "${1:-}" == "--import" ]]; then
  MODE="import"
  INPUT_FILE="${2:?--import requires <INPUT_FILE> <TARGET_URL>}"
  TARGET_URL="${3:?--import requires <INPUT_FILE> <TARGET_URL>}"
else
  SOURCE_URL="${1:?Usage: $0 <SOURCE_URL> <TARGET_URL>}"
  TARGET_URL="${2:?Usage: $0 <SOURCE_URL> <TARGET_URL>}"
fi

# ── Export ─────────────────────────────────────────────────────────────────────

do_export() {
  local src_url="$1"
  local out_file="$2"

  echo "Exporting editorial data from source..."

  # ── Stations ────────────────────────────────────────────────────────────────
  # Generate one INSERT … ON CONFLICT per station using PostgreSQL's format()
  # with %L (literal quoting) — handles all type edge cases natively.
  psql "$src_url" -t -A -q <<'SQL' > "$out_file"
SELECT format(
  $f$INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, city, tags,
  style_tags, format_tags, texture_tags,
  reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  %L, %L, %L, %L, %L,
  %L::text[], %L, %L, %L, %L, %L::text[],
  %L::text[], %L::text[], %L::text[],
  %L::float8,
  true, %L, %L::bool,
  %L, %L, %L, %L,
  %L::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  city                  = EXCLUDED.city,
  tags                  = EXCLUDED.tags,
  style_tags            = EXCLUDED.style_tags,
  format_tags           = EXCLUDED.format_tags,
  texture_tags          = EXCLUDED.texture_tags,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;
$f$,
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, city, tags,
  style_tags, format_tags, texture_tags,
  reliability_score,
  status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at
)
FROM stations
WHERE last_editor_action_at IS NOT NULL
  AND is_active = true
ORDER BY last_editor_action_at;
SQL

  local count
  count=$(grep -c 'INSERT INTO stations ' "$out_file" 2>/dev/null) || count=0
  echo "Exported ${count} station(s) with editorial data."

  if [[ "$count" -eq 0 ]]; then
    echo "Nothing to export."
    rm -f "$out_file"
    exit 0
  fi

  # ── Streams ─────────────────────────────────────────────────────────────────
  # Sync streams for all editorial stations. Uses a subquery on external_id to
  # resolve station_id on the target, so stations must be inserted first.
  # Operational state (health_score, last_checked_at, last_error, loudness_*,
  # metadata_resolver_checked_at) is excluded — managed by the health checker
  # and background probers, not editorial decisions.
  psql "$src_url" -t -A -q <<'SQL' >> "$out_file"
SELECT format(
  $f$INSERT INTO station_streams (
  station_id,
  url, resolved_url, kind, container, transport,
  mime_type, codec, bitrate, priority, is_active,
  bit_depth, sample_rate_hz, channels, sample_rate_confidence,
  metadata_enabled, metadata_type, metadata_source, metadata_url,
  metadata_resolver, metadata_delayed,
  created_at, updated_at
)
SELECT
  s.id,
  %L, %L, %L, %L, %L,
  %L, %L, %L::int, %L::int, %L::bool,
  %L::int, %L::int, %L::int, %L,
  %L::bool, %L, %L, %L,
  %L, %L::bool,
  NOW(), NOW()
FROM stations s WHERE s.external_id = %L
ON CONFLICT (station_id, priority) DO UPDATE SET
  url                    = EXCLUDED.url,
  resolved_url           = EXCLUDED.resolved_url,
  kind                   = EXCLUDED.kind,
  container              = EXCLUDED.container,
  transport              = EXCLUDED.transport,
  mime_type              = EXCLUDED.mime_type,
  codec                  = EXCLUDED.codec,
  bitrate                = EXCLUDED.bitrate,
  is_active              = EXCLUDED.is_active,
  bit_depth              = EXCLUDED.bit_depth,
  sample_rate_hz         = EXCLUDED.sample_rate_hz,
  channels               = EXCLUDED.channels,
  sample_rate_confidence = EXCLUDED.sample_rate_confidence,
  metadata_enabled       = EXCLUDED.metadata_enabled,
  metadata_type          = EXCLUDED.metadata_type,
  metadata_source        = EXCLUDED.metadata_source,
  metadata_url           = EXCLUDED.metadata_url,
  metadata_resolver      = EXCLUDED.metadata_resolver,
  metadata_delayed       = EXCLUDED.metadata_delayed,
  updated_at             = NOW();
$f$,
  ss.url, ss.resolved_url, ss.kind, ss.container, ss.transport,
  ss.mime_type, ss.codec, ss.bitrate, ss.priority, ss.is_active,
  ss.bit_depth, ss.sample_rate_hz, ss.channels, ss.sample_rate_confidence,
  ss.metadata_enabled, ss.metadata_type, ss.metadata_source, ss.metadata_url,
  ss.metadata_resolver, ss.metadata_delayed,
  st.external_id
)
FROM station_streams ss
JOIN stations st ON st.id = ss.station_id
WHERE st.last_editor_action_at IS NOT NULL
  AND st.is_active = true
ORDER BY st.last_editor_action_at, ss.priority;
SQL

  local stream_count
  stream_count=$(grep -c 'INSERT INTO station_streams' "$out_file" 2>/dev/null) || stream_count=0
  echo "Exported ${stream_count} stream(s) across ${count} station(s)."
}

# ── Schema check ───────────────────────────────────────────────────────────────

check_schema() {
  local url="$1"
  echo "Checking target schema..."

  local missing
  missing=$(psql "$url" -t -A -q -c "
    SELECT string_agg(tbl || '.' || col, ', ' ORDER BY tbl, col)
    FROM (VALUES
      ('stations',        'custom_name'),
      ('stations',        'overview'),
      ('stations',        'style_tags'),
      ('stations',        'format_tags'),
      ('stations',        'texture_tags'),
      ('stations',        'last_editor_action_at'),
      ('station_streams', 'bit_depth'),
      ('station_streams', 'sample_rate_hz'),
      ('station_streams', 'channels'),
      ('station_streams', 'sample_rate_confidence'),
      ('station_streams', 'metadata_enabled'),
      ('station_streams', 'metadata_type'),
      ('station_streams', 'metadata_source'),
      ('station_streams', 'metadata_url'),
      ('station_streams', 'metadata_resolver'),
      ('station_streams', 'metadata_delayed')
    ) AS required(tbl, col)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = required.tbl AND c.column_name = required.col
    );
  ")

  if [[ -n "$missing" ]]; then
    echo "Error: target database is missing required columns: ${missing}"
    echo "Deploy the backend to the target environment to apply pending migrations, then retry."
    exit 1
  fi

  # Verify migration 032 (partial unique index on approved station names) is
  # applied. Without it, the import may silently allow duplicates; with it
  # missing, callers get a confusing 23505 mid-import instead of a clear hint.
  local has_idx
  has_idx=$(psql "$url" -t -A -q -c "SELECT 1 FROM pg_indexes WHERE indexname = 'stations_approved_name_idx'")
  if [[ "$has_idx" != "1" ]]; then
    echo "Error: target database is missing the stations_approved_name_idx index (migration 032)."
    echo "Deploy the backend to the target environment to apply pending migrations, then retry."
    exit 1
  fi

  echo "Schema OK."
}

# ── Import ─────────────────────────────────────────────────────────────────────

do_import() {
  local in_file="$1"
  local tgt_url="$2"

  if [[ ! -f "$in_file" ]]; then
    echo "Error: input file not found: $in_file"
    exit 1
  fi

  check_schema "$tgt_url"

  local count stream_count
  count=$(grep -c 'INSERT INTO stations ' "$in_file" 2>/dev/null) || count=0
  stream_count=$(grep -c 'INSERT INTO station_streams' "$in_file" 2>/dev/null) || stream_count=0
  echo "Importing ${count} station(s) and ${stream_count} stream(s) from ${in_file}..."

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "--- DRY RUN: SQL that would be applied ---"
    cat "$in_file"
    echo "------------------------------------------"
    echo "Dry run complete. No changes applied."
    return
  fi

  psql "$tgt_url" -v ON_ERROR_STOP=1 --single-transaction -f "$in_file"
  echo "Done."
}

# ── Upload ─────────────────────────────────────────────────────────────────────

do_upload() {
  local env="$1"
  local file="$2"

  if [[ ! -f "$file" ]]; then
    echo "Error: file not found: $file"
    exit 1
  fi

  if ! command -v az &>/dev/null; then
    echo "Error: az CLI not found. Install it and run 'az login' first."
    exit 1
  fi

  echo "Resolving storage account for environment '${env}'..."
  local account
  account=$(az storage account list \
    --resource-group "rg-ostgut-${env}" \
    --query "[?starts_with(name, 'stostgut')].name | [0]" \
    -o tsv 2>/dev/null || true)

  if [[ -z "$account" ]]; then
    echo "Error: no media storage account found in rg-ostgut-${env}."
    echo "Make sure you are logged in (az login) and the environment is deployed."
    exit 1
  fi

  local account_key
  account_key=$(az storage account keys list \
    --account-name "$account" \
    --resource-group "rg-ostgut-${env}" \
    --query "[0].value" -o tsv)

  # Create container if it doesn't exist yet.
  az storage container create \
    --name "$EDITORIAL_CONTAINER" \
    --account-name "$account" \
    --account-key "$account_key" \
    --public-access off \
    --output none 2>/dev/null || true

  # Blobs are stored under <env>/ so the import pipeline can filter by prefix.
  local blob_name="${env}/$(date -u +%Y-%m-%dT%H%M%SZ).sql"

  az storage blob upload \
    --account-name "$account" \
    --account-key "$account_key" \
    --container-name "$EDITORIAL_CONTAINER" \
    --name "$blob_name" \
    --file "$file" \
    --overwrite \
    --output none

  echo "Uploaded: ${blob_name}"
  echo "Storage:  ${account}/${EDITORIAL_CONTAINER}"
  echo ""
  echo "To apply to a target environment, trigger the GitHub Actions workflow:"
  echo "  mode=import  source=${env}  target=<TARGET_ENV>"
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

case "$MODE" in
  export)
    do_export "$SOURCE_URL" "$OUTPUT_FILE"
    ;;
  upload)
    do_upload "$UPLOAD_ENV" "$UPLOAD_FILE"
    ;;
  import)
    do_import "$INPUT_FILE" "$TARGET_URL"
    ;;
  direct)
    TMPFILE=$(mktemp /tmp/editorial-sync-XXXXXX.sql)
    trap 'rm -f "$TMPFILE"' EXIT
    do_export "$SOURCE_URL" "$TMPFILE"
    do_import "$TMPFILE" "$TARGET_URL"
    ;;
esac
