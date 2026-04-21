# ──────────────────────────────────────────────
# Azure identity / subscription
# ──────────────────────────────────────────────
variable "subscription_id" {
  type        = string
  description = "Azure Subscription ID."
}

variable "tenant_id" {
  type        = string
  description = "Azure Tenant (Directory) ID."
}

variable "client_id" {
  type        = string
  description = "Client ID of the App Registration used for OIDC authentication."
}

# ──────────────────────────────────────────────
# Deployment
# ──────────────────────────────────────────────
variable "location" {
  type        = string
  description = "Azure region for all resources."
  default     = "francecentral"
}

variable "environment" {
  type        = string
  description = "Deployment environment name (staging | production)."
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be one of: staging, production."
  }
}

variable "project" {
  type        = string
  description = "Short project name — used as a prefix for all resource names."
  default     = "ostgut"
}

variable "media_container_name" {
  type        = string
  description = "Blob container name used for uploaded/processed media assets."
  default     = "media"
}

# ──────────────────────────────────────────────
# Container images
# ──────────────────────────────────────────────
variable "backend_image_tag" {
  type        = string
  description = "Docker image tag for backend container (usually the Git SHA or semver tag)."
  default     = "latest"
}

variable "frontend_image_tag" {
  type        = string
  description = "Docker image tag for frontend container (usually the Git SHA or semver tag)."
  default     = "latest"
}

# ──────────────────────────────────────────────
# Auth / database
# ──────────────────────────────────────────────
variable "db_admin_username" {
  type        = string
  description = "Administrator login name for the PostgreSQL Flexible Server."
  default     = "ostgutadmin"
}

variable "db_admin_password" {
  type        = string
  description = "Administrator password for the PostgreSQL Flexible Server."
  sensitive   = true
}

variable "jwt_secret" {
  type        = string
  description = "Shared secret for Auth.js HS256 tokens (must match AUTH_SECRET in frontend)."
  sensitive   = true
}

variable "allowed_origins" {
  type        = string
  description = "Comma-separated list of allowed CORS origins, e.g. https://app.example.com"
}

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────
variable "api_url" {
  type        = string
  description = "Server-side URL the frontend uses to call the backend (Auth.js credentials provider)."
}

variable "auth_url" {
  type        = string
  description = "Public base URL of the frontend app, used by Auth.js for callback URLs (e.g. https://console.staging.worksfine.app)."
}

variable "auth_github_id" {
  type        = string
  description = "GitHub OAuth App client ID for Auth.js."
}

variable "auth_github_secret" {
  type        = string
  description = "GitHub OAuth App client secret for Auth.js."
  sensitive   = true
}

# ──────────────────────────────────────────────
# Paddle billing (optional — leave empty to disable)
# ──────────────────────────────────────────────
variable "paddle_api_key" {
  type        = string
  description = "Paddle server-side API key."
  sensitive   = true
  default     = ""
}

variable "paddle_webhook_secret" {
  type        = string
  description = "Paddle webhook secret for signature verification."
  sensitive   = true
  default     = ""
}

variable "paddle_client_token" {
  type        = string
  description = "Paddle client-side token for Paddle.js overlay checkout."
  default     = ""
}

variable "paddle_price_id" {
  type        = string
  description = "Paddle Price ID for the Pro subscription."
  default     = ""
}

# ──────────────────────────────────────────────
# New Relic (optional — leave empty to disable)
# ──────────────────────────────────────────────
variable "new_relic_license_key" {
  type        = string
  description = "New Relic ingest license key for the backend APM agent. Leave empty to disable."
  sensitive   = true
  default     = ""
}

variable "new_relic_app_name" {
  type        = string
  description = "Application name shown in New Relic APM."
  default     = "bouji-backend"
}

# ──────────────────────────────────────────────
# Custom domains (optional)
# ──────────────────────────────────────────────
variable "backend_custom_domain" {
  type        = string
  description = "Custom domain for the backend API (e.g. api.staging.worksfine.app). Leave empty to skip."
  default     = ""
}

variable "frontend_custom_domain" {
  type        = string
  description = "Custom domain for the frontend (e.g. console.staging.worksfine.app). Leave empty to skip."
  default     = ""
}
