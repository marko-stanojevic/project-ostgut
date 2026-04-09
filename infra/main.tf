locals {
  # Common prefix for every resource: <project>-<env>  e.g. ostgut-staging
  prefix = "${var.project}-${var.environment}"

  common_tags = {
    project     = var.project
    environment = var.environment
    managed_by  = "opentofu"
  }
}

# ──────────────────────────────────────────────
# Resource Group
# ──────────────────────────────────────────────
resource "azurerm_resource_group" "main" {
  name     = "rg-${local.prefix}"
  location = var.location
  tags     = local.common_tags
}

# ──────────────────────────────────────────────
# Azure Container Registry (ACR)
# ──────────────────────────────────────────────
resource "random_string" "acr_suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "azurerm_container_registry" "main" {
  name                = "cr${var.project}${var.environment}${random_string.acr_suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false # Use managed identity instead of admin credentials
  tags                = local.common_tags
}

# ──────────────────────────────────────────────
# Log Analytics Workspace (for ACA diagnostics)
# ──────────────────────────────────────────────
resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${local.prefix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

# ──────────────────────────────────────────────
# Container Apps Environment
# ──────────────────────────────────────────────
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.prefix}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.common_tags
}

# ──────────────────────────────────────────────
# User-Assigned Managed Identity
# Used by the Container App to pull images from ACR.
# ──────────────────────────────────────────────
resource "azurerm_user_assigned_identity" "backend" {
  name                = "id-${local.prefix}-backend"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

# Grant AcrPull to the managed identity so no admin credentials are needed.
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.backend.principal_id
}

# ──────────────────────────────────────────────
# Backend Container App
# ──────────────────────────────────────────────
resource "azurerm_container_app" "backend" {
  name                         = "ca-${local.prefix}-backend"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  # Pull image from ACR using the managed identity.
  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.backend.id
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.backend.id]
  }

  template {
    # ── Scale-to-Zero ──────────────────────────────────────────────────────
    # min_replicas = 0  → the app scales down to zero when there is no traffic,
    # which eliminates compute cost during idle periods (ACA "Scale to Zero").
    min_replicas = 0
    max_replicas = 10

    # Scale out on HTTP concurrent requests.
    custom_scale_rule {
      name             = "http-scaling"
      custom_rule_type = "http"
      metadata = {
        concurrentRequests = "100"
      }
    }

    container {
      name   = "backend"
      image  = "${azurerm_container_registry.main.login_server}/backend:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      # Liveness probe – calls the /health endpoint.
      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      # Readiness probe.
      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      # Environment variables — Supabase credentials are injected as secrets.
      env {
        name  = "ENV"
        value = var.environment
      }
      env {
        name        = "SUPABASE_URL"
        secret_name = "supabase-url"
      }
      env {
        name        = "SUPABASE_ANON_KEY"
        secret_name = "supabase-anon-key"
      }
      env {
        name        = "SUPABASE_SERVICE_KEY"
        secret_name = "supabase-service-key"
      }
    }
  }

  secret {
    name  = "supabase-url"
    value = var.supabase_url
  }
  secret {
    name  = "supabase-anon-key"
    value = var.supabase_anon_key
  }
  secret {
    name  = "supabase-service-key"
    value = var.supabase_service_key
  }

  ingress {
    external_enabled = true
    target_port      = 8080

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  depends_on = [azurerm_role_assignment.acr_pull]
}
