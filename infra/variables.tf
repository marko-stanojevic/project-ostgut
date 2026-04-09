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
# Container image
# ──────────────────────────────────────────────
variable "image_tag" {
  type        = string
  description = "Docker image tag to deploy (usually the Git SHA or semver tag)."
  default     = "latest"
}

# ──────────────────────────────────────────────
# Supabase (external managed service)
# ──────────────────────────────────────────────
variable "supabase_url" {
  type        = string
  description = "Supabase project REST URL."
  sensitive   = true
}

variable "supabase_anon_key" {
  type        = string
  description = "Supabase anonymous / public API key."
  sensitive   = true
}

variable "supabase_service_key" {
  type        = string
  description = "Supabase service-role (privileged) key."
  sensitive   = true
}
