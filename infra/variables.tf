variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "me-central-1"
}

variable "dr_region" {
  description = "Disaster recovery AWS region"
  type        = string
  default     = "me-south-1"
}

variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "app_instance_type" {
  description = "EC2 instance type for the always-on app tier (frontend + backend)."
  type        = string
  default     = "t3.small"
}

variable "ecs_instance_type" {
  description = "Primary GPU instance type for the Ollama on-demand tier (e.g. g5.2xlarge)."
  type        = string
  default     = "g5.2xlarge"
}

variable "ecs_fallback_instance_type" {
  description = "Fallback GPU instance type for the Ollama Spot pool (same GPU family)."
  type        = string
  default     = "g5.xlarge"
}

variable "ecs_node_count" {
  description = "Desired number of always-on app-tier ECS instances. Minimum is always 1."
  type        = number
  default     = 1
}

variable "ecs_use_gpu_ami" {
  description = "Use the ECS-optimized GPU AMI for the Ollama tier (Amazon Linux 2023 with NVIDIA drivers)."
  type        = bool
  default     = true
}

variable "ecs_ollama_gpu_count" {
  description = "Number of GPUs to allocate to the Ollama ECS task. Set to 0 for CPU-only inference."
  type        = number
  default     = 1
}

variable "frontend_container_port" {
  description = "Port exposed by the frontend container"
  type        = number
  default     = 80
}

variable "backend_container_port" {
  description = "Port exposed by the backend container"
  type        = number
  default     = 3001
}

variable "opensearch_instance_type" {
  description = "OpenSearch instance type"
  type        = string
  default     = "t3.small.search"
}

variable "opensearch_volume_size" {
  description = "OpenSearch EBS volume size in GB"
  type        = number
  default     = 10
}

variable "infra_runner_role_arn" {
  description = "ARN of the IAM role used by the infra GitHub Actions runner (for Terraform state access)"
  type        = string
}

variable "opensearch_master_password" {
  description = "OpenSearch master user password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.opensearch_master_password) >= 8 && can(regex("[A-Z]", var.opensearch_master_password)) && can(regex("[a-z]", var.opensearch_master_password)) && can(regex("[0-9]", var.opensearch_master_password)) && can(regex("[^A-Za-z0-9]", var.opensearch_master_password))
    error_message = "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character."
  }
}
