locals {
  # Common prefix for every resource: <project>-<env>  e.g. ostgut-staging
  prefix = "${var.project}-${var.environment}"

  common_tags = {
    project     = var.project
    environment = var.environment
    managed_by  = "opentofu"
  }

  # Constructed from the server FQDN so no secret is stored in variables.
  database_url = "postgres://${var.db_admin_username}:${var.db_admin_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${var.project}?sslmode=require"
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
# PostgreSQL Flexible Server
# Public access restricted to Azure services only — no VNet required.
# ──────────────────────────────────────────────
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "psql-${local.prefix}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.db_admin_username
  administrator_password = var.db_admin_password

  # B_Standard_B1ms: 1 vCore burstable, 2 GB RAM — cheapest tier, good for staging.
  sku_name   = "B_Standard_B1ms"
  storage_mb = 32768 # 32 GB

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  tags = local.common_tags

  lifecycle {
    # Azure auto-assigns an availability zone and does not allow changing it
    # without high availability configured. Ignore it after initial creation.
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.project
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

# Allow traffic from all Azure services (IP 0.0.0.0 is the Azure sentinel value).
# This restricts access to Azure's IP space — no public internet access.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
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
    min_replicas = 0
    max_replicas = 10

    custom_scale_rule {
      name             = "http-scaling"
      custom_rule_type = "http"
      metadata = {
        concurrentRequests = "100"
      }
    }

    container {
      name   = "backend"
      image  = "${azurerm_container_registry.main.login_server}/backend:${var.backend_image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      env {
        name  = "ENV"
        value = var.environment
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
    }
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }
  secret {
    name  = "jwt-secret"
    value = var.jwt_secret
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


# ──────────────────────────────────────────────
# Frontend Container App
# ──────────────────────────────────────────────
resource "azurerm_user_assigned_identity" "frontend" {
  name                = "id-${local.prefix}-frontend"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

resource "azurerm_role_assignment" "acr_pull_frontend" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.frontend.principal_id
}

resource "azurerm_container_app" "frontend" {
  name                         = "ca-${local.prefix}-frontend"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.frontend.id
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.frontend.id]
  }

  template {
    min_replicas = 0
    max_replicas = 10

    custom_scale_rule {
      name             = "http-scaling"
      custom_rule_type = "http"
      metadata = {
        concurrentRequests = "100"
      }
    }

    container {
      name   = "frontend"
      image  = "${azurerm_container_registry.main.login_server}/frontend:${var.frontend_image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      liveness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 3000
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/"
        port      = 3000
      }

      env {
        name  = "AUTH_URL"
        value = var.auth_url
      }
      env {
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }
      env {
        name  = "API_URL"
        value = var.api_url
      }
      env {
        name        = "AUTH_SECRET"
        secret_name = "auth-secret"
      }
      env {
        name        = "AUTH_GITHUB_ID"
        secret_name = "auth-github-id"
      }
      env {
        name        = "AUTH_GITHUB_SECRET"
        secret_name = "auth-github-secret"
      }
    }
  }

  secret {
    name  = "auth-secret"
    value = var.jwt_secret
  }
  secret {
    name  = "auth-github-id"
    value = var.auth_github_id
  }
  secret {
    name  = "auth-github-secret"
    value = var.auth_github_secret
  }

  ingress {
    external_enabled = true
    target_port      = 3000

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  depends_on = [azurerm_role_assignment.acr_pull_frontend]
}

# ──────────────────────────────────────────────
# Custom Domains with Azure-managed TLS Certificates
# Azure requires the hostname to be registered in the CAE before a managed
# cert can be issued, so a plain azapi_resource cannot express the dependency.
# `az containerapp hostname bind` handles all three steps atomically:
#   1. add hostname to container app (Disabled binding)
#   2. issue a free managed certificate via CNAME validation
#   3. bind the certificate (SniEnabled)
# DNS prerequisite: CNAME + TXT (asuid.*) records must already exist.
# ──────────────────────────────────────────────

resource "null_resource" "backend_custom_domain" {
  count = var.backend_custom_domain != "" ? 1 : 0

  triggers = {
    domain   = var.backend_custom_domain
    app_name = azurerm_container_app.backend.name
    env_name = azurerm_container_app_environment.main.name
    rg_name  = azurerm_resource_group.main.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      az containerapp hostname add \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --resource-group "${self.triggers.rg_name}" || true
      az containerapp hostname bind \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --environment "${self.triggers.env_name}" \
        --resource-group "${self.triggers.rg_name}" \
        --validation-method CNAME
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      az containerapp hostname delete \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --resource-group "${self.triggers.rg_name}" \
        --yes || true
    EOT
  }

  depends_on = [azurerm_container_app.backend]
}

resource "null_resource" "frontend_custom_domain" {
  count = var.frontend_custom_domain != "" ? 1 : 0

  triggers = {
    domain   = var.frontend_custom_domain
    app_name = azurerm_container_app.frontend.name
    env_name = azurerm_container_app_environment.main.name
    rg_name  = azurerm_resource_group.main.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      az containerapp hostname add \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --resource-group "${self.triggers.rg_name}" || true
      az containerapp hostname bind \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --environment "${self.triggers.env_name}" \
        --resource-group "${self.triggers.rg_name}" \
        --validation-method CNAME
    EOT
  }

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      az containerapp hostname delete \
        --hostname "${self.triggers.domain}" \
        --name "${self.triggers.app_name}" \
        --resource-group "${self.triggers.rg_name}" \
        --yes || true
    EOT
  }

  depends_on = [azurerm_container_app.frontend]
}
