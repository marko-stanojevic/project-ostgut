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

provider "azurerm" {
  features {}

  # OIDC / Workload Identity Federation – no client_secret required.
  use_oidc        = true
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
  client_id       = var.client_id
}
