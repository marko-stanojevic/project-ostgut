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
  default     = "westeurope"
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
variable "database_url" {
  type        = string
  description = "PostgreSQL connection string for the backend."
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
