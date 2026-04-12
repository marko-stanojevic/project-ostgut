# OpenTofu – Azure provider configuration for project-ostgut.
# Authentication uses OIDC (Workload Identity Federation) so no client
# secret is stored in CI/CD or in state.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azapi = {
      source  = "azure/azapi"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state stored in Azure Blob Storage.
  # The storage account / container must be bootstrapped once manually or via
  # a separate init script.  Values are supplied through -backend-config flags
  # or environment variables in CI so that no secrets appear in source code.
  backend "azurerm" {}
}

provider "azapi" {
  use_oidc        = true
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
  client_id       = var.client_id
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }

  # OIDC / Workload Identity Federation – no client_secret required.
  use_oidc        = true
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
  client_id       = var.client_id

  # Automatically register any Azure resource provider namespaces that
  # OpenTofu needs but aren't yet enabled on the subscription.
  resource_provider_registrations = "extended"
}
