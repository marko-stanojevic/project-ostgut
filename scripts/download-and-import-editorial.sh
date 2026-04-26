#!/usr/bin/env bash
# download-and-import-editorial.sh — One-shot: download latest artifact from Azure Blob → import locally.
#
# Finds the most-recent blob under editorial-syncs/<env>/ in the environment's
# storage account, downloads it to a temp file, and imports it into the local
# database (DATABASE_URL from backend/.env).
#
# Usage:
#   ./scripts/download-and-import-editorial.sh [staging|production]
#
# Default source environment: staging.
# Requires: az CLI authenticated (az login), psql.
# Supports DRY_RUN=true to preview the SQL without applying it.

set -euo pipefail

ENV="${1:-staging}"
case "$ENV" in
  staging|production) ;;
  *) echo "Error: env must be 'staging' or 'production' (got: $ENV)"; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/backend/.env"
EDITORIAL_CONTAINER="editorial-syncs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: ${ENV_FILE} not found. Run from a configured local checkout."
  exit 1
fi

TARGET_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)"
if [[ -z "$TARGET_URL" ]]; then
  echo "Error: DATABASE_URL not set in ${ENV_FILE}"
  exit 1
fi

if ! command -v az &>/dev/null; then
  echo "Error: az CLI not found. Install it and run 'az login' first."
  exit 1
fi

echo "==> Resolving storage account for environment '${ENV}'..."
ACCOUNT=$(az storage account list \
  --resource-group "rg-ostgut-${ENV}" \
  --query "[?starts_with(name, 'stostgut')].name | [0]" \
  -o tsv 2>/dev/null || true)

if [[ -z "$ACCOUNT" ]]; then
  echo "Error: no storage account found in rg-ostgut-${ENV}."
  echo "Make sure you are logged in (az login) and the environment is deployed."
  exit 1
fi

ACCOUNT_KEY=$(az storage account keys list \
  --account-name "$ACCOUNT" \
  --resource-group "rg-ostgut-${ENV}" \
  --query "[0].value" -o tsv)

echo "==> Finding latest artifact in ${ACCOUNT}/${EDITORIAL_CONTAINER}/${ENV}/..."
LATEST_BLOB=$(az storage blob list \
  --account-name "$ACCOUNT" \
  --account-key "$ACCOUNT_KEY" \
  --container-name "$EDITORIAL_CONTAINER" \
  --prefix "${ENV}/" \
  --query "sort_by([], &name)[-1].name" \
  -o tsv 2>/dev/null || true)

if [[ -z "$LATEST_BLOB" || "$LATEST_BLOB" == "None" ]]; then
  echo "No artifacts found under ${EDITORIAL_CONTAINER}/${ENV}/."
  echo "Run 'Editorial: Export + Upload (${ENV})' first to create one."
  exit 1
fi

echo "Latest artifact: ${LATEST_BLOB}"

TMP_FILE="$(mktemp -t editorial-import-XXXXXX.sql)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "==> Downloading..."
az storage blob download \
  --account-name "$ACCOUNT" \
  --account-key "$ACCOUNT_KEY" \
  --container-name "$EDITORIAL_CONTAINER" \
  --name "$LATEST_BLOB" \
  --file "$TMP_FILE" \
  --output none

echo "==> Importing into local database..."
"${REPO_ROOT}/scripts/sync-editorial.sh" --import "$TMP_FILE" "$TARGET_URL"
