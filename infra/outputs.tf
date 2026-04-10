output "resource_group_name" {
  description = "Name of the Azure Resource Group."
  value       = azurerm_resource_group.main.name
}

output "container_registry_login_server" {
  description = "Login server hostname for the Azure Container Registry."
  value       = azurerm_container_registry.main.login_server
}

output "container_app_fqdn" {
  description = "Fully-qualified domain name of the Backend Container App."
  value       = azurerm_container_app.backend.latest_revision_fqdn
}

output "container_app_environment_id" {
  description = "Resource ID of the Container Apps Environment."
  value       = azurerm_container_app_environment.main.id
}

output "backend_identity_client_id" {
  description = "Client ID of the user-assigned managed identity used by the backend."
  value       = azurerm_user_assigned_identity.backend.client_id
}

output "database_fqdn" {
  description = "Fully-qualified domain name of the PostgreSQL Flexible Server."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "database_url" {
  description = "PostgreSQL connection string for the backend (sensitive)."
  value       = local.database_url
  sensitive   = true
}
