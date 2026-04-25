#!/usr/bin/env bash
# export-and-upload-editorial.sh — One-shot: export local DB → upload to Azure Blob.
#
# Reads DATABASE_URL from backend/.env, exports editorial decisions to a
# temp file, uploads to the editorial-syncs container in the chosen
# environment's storage account, then deletes the temp file.
#
# Usage:
#   ./scripts/export-and-upload-editorial.sh [staging|production]
#
# Default target environment: staging.
# Requires: az CLI authenticated (az login), psql, jq optional.

set -euo pipefail

ENV="${1:-staging}"
case "$ENV" in
  staging|production) ;;
  *) echo "Error: env must be 'staging' or 'production' (got: $ENV)"; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: ${ENV_FILE} not found. Run from a configured local checkout."
  exit 1
fi

# Pull DATABASE_URL without leaking the rest of .env into the shell.
SOURCE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)"
if [[ -z "$SOURCE_URL" ]]; then
  echo "Error: DATABASE_URL not set in ${ENV_FILE}"
  exit 1
fi

TMP_FILE="$(mktemp -t editorial-export-XXXXXX.sql)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "==> Exporting from local DB"
"${REPO_ROOT}/scripts/sync-editorial.sh" --export "$SOURCE_URL" "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Nothing exported. Skipping upload."
  exit 0
fi

echo "==> Uploading to ${ENV} storage account"
"${REPO_ROOT}/scripts/sync-editorial.sh" --upload "$ENV" "$TMP_FILE"
