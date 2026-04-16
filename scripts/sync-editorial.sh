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
#   All stations where last_editor_action_at IS NOT NULL (set by admin actions).
#   Manual stations missing from target are inserted. Existing rows update only
#   when source timestamp is newer than target's.
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

  # Generate one INSERT … ON CONFLICT statement per station using PostgreSQL's
  # format() with %L (literal quoting) — handles all type edge cases natively.
  psql "$src_url" -t -A -q <<'SQL' > "$out_file"
SELECT format(
  $f$INSERT INTO stations (
  external_id, name, stream_url, homepage, favicon,
  genre, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_logo, custom_website, custom_description, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  %L, %L, %L, %L, %L,
  %L, %L, %L, %L, %L::text[],
  %L::int, %L, %L::float8,
  true, %L, %L::bool,
  %L, %L, %L, %L, %L,
  %L::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  custom_name           = EXCLUDED.custom_name,
  custom_logo           = EXCLUDED.custom_logo,
  custom_website        = EXCLUDED.custom_website,
  custom_description    = EXCLUDED.custom_description,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;
$f$,
  external_id, name, stream_url, homepage, favicon,
  genre, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  status, featured,
  custom_name, custom_logo, custom_website, custom_description, editor_notes,
  last_editor_action_at
)
FROM stations
WHERE last_editor_action_at IS NOT NULL
  AND is_active = true
ORDER BY last_editor_action_at;
SQL

  local count
  count=$(grep -c 'INSERT INTO' "$out_file" 2>/dev/null || echo 0)
  echo "Exported ${count} station(s) with editorial data."

  if [[ "$count" -eq 0 ]]; then
    echo "Nothing to export."
    rm -f "$out_file"
    exit 0
  fi
}

# ── Import ─────────────────────────────────────────────────────────────────────

do_import() {
  local in_file="$1"
  local tgt_url="$2"

  if [[ ! -f "$in_file" ]]; then
    echo "Error: input file not found: $in_file"
    exit 1
  fi

  local count
  count=$(grep -c 'INSERT INTO' "$in_file" 2>/dev/null || echo 0)
  echo "Importing ${count} station(s) from ${in_file}..."

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "--- DRY RUN: SQL that would be applied ---"
    cat "$in_file"
    echo "------------------------------------------"
    echo "Dry run complete. No changes applied."
    return
  fi

  psql "$tgt_url" -f "$in_file"
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
