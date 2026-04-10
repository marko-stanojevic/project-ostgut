#!/usr/bin/env bash
# bootstrap.sh — One-time setup so the deploy pipeline can authenticate to Azure
# and store OpenTofu state. Everything else is managed by OpenTofu.
#
# Usage:
#   chmod +x scripts/bootstrap.sh
#   az login
#   ./scripts/bootstrap.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
GITHUB_REPO="marko-stanojevic/project-ostgut"
ENVIRONMENT="staging"
LOCATION="francecentral"
STATE_RG="rg-ostgut-tfstate"
STATE_SA="ostguttfstate${RANDOM}"   # must be globally unique
STATE_CONTAINER="tfstate"
# ─────────────────────────────────────────────────────────────────────────────

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Subscription: ${SUBSCRIPTION_ID}"
echo "Tenant      : ${TENANT_ID}"
echo ""

# ── 1. State storage ──────────────────────────────────────────────────────────
echo "--- Creating OpenTofu state storage ---"
az group create --name "${STATE_RG}" --location "${LOCATION}" --output none
az storage account create \
  --name "${STATE_SA}" --resource-group "${STATE_RG}" --location "${LOCATION}" \
  --sku Standard_LRS --allow-blob-public-access false --output none
az storage container create \
  --name "${STATE_CONTAINER}" --account-name "${STATE_SA}" --output none
echo "Done: ${STATE_SA}"

# ── 2. App Registration + OIDC credential ─────────────────────────────────────
echo "--- Creating App Registration ---"
APP_ID=$(az ad app create --display-name "ostgut-github-${ENVIRONMENT}" --query appId -o tsv)
az ad sp create --id "${APP_ID}" --output none

az ad app federated-credential create --id "${APP_ID}" --parameters "{
  \"name\": \"github-env-${ENVIRONMENT}\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GITHUB_REPO}:environment:${ENVIRONMENT}\",
  \"audiences\": [\"api://AzureADTokenAudience\"]
}" --output none
echo "Done: ${APP_ID}"

# ── 3. RBAC roles ─────────────────────────────────────────────────────────────
echo "--- Assigning roles ---"
STATE_SA_ID=$(az storage account show --name "${STATE_SA}" --resource-group "${STATE_RG}" --query id -o tsv)

# Contributor + User Access Administrator so OpenTofu can create resources
# and assign the AcrPull role to the managed identity it provisions.
az role assignment create --assignee "${APP_ID}" --role "Contributor" \
  --scope "/subscriptions/${SUBSCRIPTION_ID}" --output none
az role assignment create --assignee "${APP_ID}" --role "User Access Administrator" \
  --scope "/subscriptions/${SUBSCRIPTION_ID}" --output none

# Read/write access to the state blob container
az role assignment create --assignee "${APP_ID}" --role "Storage Blob Data Contributor" \
  --scope "${STATE_SA_ID}" --output none
echo "Done."

# ── Output ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo " Add these to GitHub → Settings → Environments → ${ENVIRONMENT}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  SECRETS"
echo "  AZURE_CLIENT_ID        = ${APP_ID}"
echo "  AZURE_TENANT_ID        = ${TENANT_ID}"
echo "  AZURE_SUBSCRIPTION_ID  = ${SUBSCRIPTION_ID}"
echo "  JWT_SECRET             = $(openssl rand -base64 32)"
echo "  AUTH_SECRET            = <same value as JWT_SECRET>"
echo "  DB_ADMIN_PASSWORD      = <strong password>"
echo ""
echo "  VARIABLES"
echo "  TF_STATE_RESOURCE_GROUP   = ${STATE_RG}"
echo "  TF_STATE_STORAGE_ACCOUNT  = ${STATE_SA}"
echo "  TF_STATE_CONTAINER        = ${STATE_CONTAINER}"
echo "  ALLOWED_ORIGINS           = *"
echo "  API_URL                   = <fill after first deploy>"
echo "════════════════════════════════════════════════════════════"
