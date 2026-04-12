output "resource_group_name" {
  description = "Name of the Azure Resource Group."
  value       = azurerm_resource_group.main.name
}

output "container_registry_login_server" {
  description = "Login server hostname for the Azure Container Registry."
  value       = azurerm_container_registry.main.login_server
}

output "backend_fqdn" {
  description = "Default FQDN of the Backend Container App (use as CNAME target)."
  value       = azurerm_container_app.backend.ingress[0].fqdn
}

output "frontend_fqdn" {
  description = "Default FQDN of the Frontend Container App (use as CNAME target)."
  value       = azurerm_container_app.frontend.ingress[0].fqdn
}

output "backend_domain_verification_id" {
  description = "TXT record value for asuid.api.staging.worksfine.app domain verification."
  value       = azurerm_container_app.backend.custom_domain_verification_id
  sensitive   = true
}

output "frontend_domain_verification_id" {
  description = "TXT record value for asuid.console.staging.worksfine.app domain verification."
  value       = azurerm_container_app.frontend.custom_domain_verification_id
  sensitive   = true
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
