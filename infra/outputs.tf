output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "ecr_frontend_url" {
  description = "ECR repository URL for frontend"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecr_backend_url" {
  description = "ECR repository URL for backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "opensearch_endpoint" {
  description = "OpenSearch Service domain endpoint"
  value       = "https://${aws_opensearch_domain.main.endpoint}"
}

output "ollama_service_discovery_dns" {
  description = "Private DNS name for the Ollama service (resolvable within the VPC)"
  value       = "http://ollama.${aws_service_discovery_private_dns_namespace.main.name}:11434"
}

output "jwt_secret_arn" {
  description = "Secrets Manager ARN for the JWT secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "admin_password_secret_arn" {
  description = "Secrets Manager ARN for the admin password"
  value       = aws_secretsmanager_secret.admin_password.arn
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC"
  value       = aws_iam_role.github_actions.arn
}
