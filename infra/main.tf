locals {
  # Common prefix for every resource: <project>-<env>  e.g. ostgut-staging
  prefix = "${var.project}-${var.environment}"

  common_tags = {
    project     = var.project
    environment = var.environment
    managed_by  = "opentofu"
  }

  # Constructed after the server is created so no secret is stored in variables.
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
# Virtual Network + Subnets
# ──────────────────────────────────────────────
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${local.prefix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = ["10.0.0.0/16"]
  tags                = local.common_tags
}

# Container Apps Environment requires a dedicated /23 subnet minimum.
resource "azurerm_subnet" "container_apps" {
  name                 = "snet-container-apps"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.0.0/23"]

  delegation {
    name = "aca-delegation"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# PostgreSQL Flexible Server requires its own delegated subnet.
resource "azurerm_subnet" "postgresql" {
  name                 = "snet-postgresql"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]

  delegation {
    name = "postgresql-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# ──────────────────────────────────────────────
# Private DNS Zone for PostgreSQL
# Required for VNet-integrated Flexible Server to be resolvable.
# ──────────────────────────────────────────────
resource "azurerm_private_dns_zone" "postgresql" {
  name                = "psql-${local.prefix}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgresql" {
  name                  = "vnet-link-postgresql"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgresql.name
  virtual_network_id    = azurerm_virtual_network.main.id
  tags                  = local.common_tags
}

# ──────────────────────────────────────────────
# PostgreSQL Flexible Server
# ──────────────────────────────────────────────
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "psql-${local.prefix}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.db_admin_username
  administrator_password = var.db_admin_password

  # Private access — no public endpoint, traffic stays inside the VNet.
  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.postgresql.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgresql.id

  # Pin to zone 1 — must be explicit to prevent OpenTofu from trying to
  # change the auto-assigned zone on every apply, which Azure rejects.
  zone = "1"

  # B_Standard_B1ms: 1 vCore burstable, 2 GB RAM — cheapest tier, good for staging.
  sku_name   = "B_Standard_B1ms"
  storage_mb = 32768 # 32 GB

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  tags = local.common_tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgresql]
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.project
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "UTF8"
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

  # VNet injection — Container Apps share a subnet with the database VNet,
  # so egress to PostgreSQL never leaves Azure's private network.
  # internal_load_balancer_enabled = false (default) keeps external ingress
  # on Container Apps working for the public API endpoint.
  infrastructure_subnet_id             = azurerm_subnet.container_apps.id

  # Pin the managed resource group name Azure auto-assigns — without this
  # OpenTofu detects drift on every apply and forces a replacement.
  infrastructure_resource_group_name   = "ME_cae-${local.prefix}_rg-${local.prefix}_${var.location}"

  tags = local.common_tags
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
      image  = "${azurerm_container_registry.main.login_server}/backend:${var.backend_image_tag}"
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
