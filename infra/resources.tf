# ─────────────────────────────────────────────
# VPC
# ─────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "consultant-agent-${var.environment}"
  cidr = var.environment == "production" ? "10.1.0.0/16" : "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = var.environment == "production" ? ["10.1.1.0/24", "10.1.2.0/24"] : ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = var.environment == "production" ? ["10.1.101.0/24", "10.1.102.0/24"] : ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = true # POC cost saving
  enable_dns_hostnames = true
  enable_dns_support   = true # Required for Cloud Map private DNS
}

# ─────────────────────────────────────────────
# ECR Repositories
# ─────────────────────────────────────────────
resource "aws_ecr_repository" "frontend" {
  name                 = "consultant-agent/frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "consultant-agent/backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Lifecycle policy — keep last 10 images
resource "aws_ecr_lifecycle_policy" "cleanup" {
  for_each   = toset(["consultant-agent/frontend", "consultant-agent/backend"])
  repository = each.value
  depends_on = [aws_ecr_repository.frontend, aws_ecr_repository.backend]

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ─────────────────────────────────────────────
# ECS Cluster
# ─────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "consultant-agent-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  # Both tiers registered — each ECS service selects its own provider
  capacity_providers = [
    aws_ecs_capacity_provider.app.name,
    aws_ecs_capacity_provider.gpu.name,
  ]

  # Default to the always-on app tier
  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.app.name
    weight            = 1
    base              = 1
  }
}

# ─────────────────────────────────────────────
# AMI — ECS-Optimized Amazon Linux 2023
# app tier  : standard AMI (no GPU drivers)
# GPU tier  : NVIDIA-driver AMI for g5 instances
# ─────────────────────────────────────────────
data "aws_ssm_parameter" "ecs_ami_standard" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

data "aws_ssm_parameter" "ecs_ami_gpu" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/gpu/recommended/image_id"
}

# ─────────────────────────────────────────────
# Secrets Manager — application secrets
# Populate values via CI/CD (aws secretsmanager put-secret-value) before first deploy
# ─────────────────────────────────────────────
resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "consultant-agent/${var.environment}/jwt-secret"
  description             = "JWT signing secret for consultant-agent ${var.environment}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "admin_password" {
  name                    = "consultant-agent/${var.environment}/admin-password"
  description             = "Admin user password for consultant-agent ${var.environment}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "opensearch_password" {
  name                    = "consultant-agent/${var.environment}/opensearch-password"
  description             = "OpenSearch master password for consultant-agent ${var.environment}"
  recovery_window_in_days = 0
}

# ─────────────────────────────────────────────
# IAM — ECS EC2 Instance Role (shared by app + GPU tiers)
# ─────────────────────────────────────────────
resource "aws_iam_role" "ecs_instance" {
  name = "consultant-agent-ecs-instance-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_instance_policy" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ecs_instance_ssm" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ecs" {
  name = "consultant-agent-ecs-${var.environment}"
  role = aws_iam_role.ecs_instance.name
}

# ─────────────────────────────────────────────
# IAM — ECS Task Execution Role
# ─────────────────────────────────────────────
resource "aws_iam_role" "ecs_task_execution" {
  name = "consultant-agent-ecs-exec-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "consultant-agent-ecs-exec-secrets-${var.environment}"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.jwt_secret.arn, aws_secretsmanager_secret.admin_password.arn, aws_secretsmanager_secret.opensearch_password.arn]
    }]
  })
}

# ─────────────────────────────────────────────
# IAM — ECS Task Role (application permissions)
# ─────────────────────────────────────────────
resource "aws_iam_role" "ecs_task" {
  name = "consultant-agent-ecs-task-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task" {
  name = "consultant-agent-ecs-task-${var.environment}"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["es:*"]
        Resource = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/consultant-agent-${var.environment}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess"
        ]
        Resource = aws_efs_file_system.this.arn
      },
      {
        Effect   = "Allow"
        Action   = ["autoscaling:UpdateAutoScalingGroup"]
        Resource = "arn:aws:autoscaling:${var.aws_region}:${data.aws_caller_identity.current.account_id}:autoScalingGroup:*:autoScalingGroupName/consultant-agent-gpu-*"
      },
      {
        Effect   = "Allow"
        Action   = ["autoscaling:DescribeAutoScalingGroups"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:service/consultant-agent-${var.environment}/consultant-agent-ollama-*"
      }
    ]
  })
}

# ─────────────────────────────────────────────
# Security Groups
# ─────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "consultant-agent-alb-${var.environment}"
  description = "Allow HTTP inbound to ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Environment = var.environment }
}

resource "aws_security_group" "ecs_instances" {
  name_prefix = "consultant-agent-ecs-${var.environment}-"
  description = "ECS container instances - app tier (t3.small) and GPU tier (g5.2xlarge)"
  vpc_id      = module.vpc.vpc_id

  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description     = "Dynamic ports from ALB"
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Inter-service communication"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Environment = var.environment }
}

# ─────────────────────────────────────────────
# Launch Template — App tier (t3.small, standard AMI, always-on)
# Hosts frontend + backend ECS services
# ─────────────────────────────────────────────
resource "aws_launch_template" "app" {
  name_prefix   = "consultant-agent-app-${var.environment}-"
  image_id      = data.aws_ssm_parameter.ecs_ami_standard.value
  instance_type = var.app_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.ecs_instances.id]
    delete_on_termination       = true
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.main.name} >> /etc/ecs/ecs.config
    echo ECS_ENABLE_SPOT_INSTANCE_DRAINING=true >> /etc/ecs/ecs.config
  EOF
  )

  # hop_limit=2: required so Docker containers can reach IMDSv2 for credentials
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "consultant-agent-app-${var.environment}"
      Environment = var.environment
      Tier        = "app"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ─────────────────────────────────────────────
# Launch Template — GPU tier (g5.2xlarge Spot, GPU AMI, on-demand)
# Hosts Ollama — ECS managed scaling starts this when tasks are pending
# ─────────────────────────────────────────────
resource "aws_launch_template" "gpu" {
  name_prefix   = "consultant-agent-gpu-${var.environment}-"
  image_id      = data.aws_ssm_parameter.ecs_ami_gpu.value
  instance_type = var.ecs_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.ecs_instances.id]
    delete_on_termination       = true
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.main.name} >> /etc/ecs/ecs.config
    echo ECS_ENABLE_SPOT_INSTANCE_DRAINING=true >> /etc/ecs/ecs.config
    echo ECS_ENABLE_GPU_SUPPORT=true >> /etc/ecs/ecs.config
  EOF
  )

  # hop_limit=2: required so Docker containers can reach IMDSv2 for credentials
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "consultant-agent-gpu-${var.environment}"
      Environment = var.environment
      Tier        = "gpu"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ─────────────────────────────────────────────
# ASG — App tier (t3.small, min=1, always-on)
# No scale-to-zero schedule; frontend + backend must always be available
# ─────────────────────────────────────────────
resource "aws_autoscaling_group" "app" {
  name                = "consultant-agent-app-${var.environment}"
  vpc_zone_identifier = module.vpc.private_subnets
  min_size            = 1 # never scales to zero
  max_size            = var.environment == "production" ? 4 : 2
  desired_capacity    = var.ecs_node_count

  protect_from_scale_in = true

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "consultant-agent-app-${var.environment}"
    propagate_at_launch = true
  }
  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# ─────────────────────────────────────────────
# ASG — GPU tier (g5.2xlarge Spot, min=0, on-demand via ECS managed scaling)
# Starts when Ollama tasks are pending; terminates when no tasks run
# ─────────────────────────────────────────────
resource "aws_autoscaling_group" "gpu" {
  name                = "consultant-agent-gpu-${var.environment}"
  vpc_zone_identifier = module.vpc.private_subnets
  min_size            = 1 # was 0 — keep one Spot instance always running
  max_size            = 1
  desired_capacity    = 1 # was 0 — start one instance at apply time

  protect_from_scale_in = true

  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.gpu.id
        version            = "$Latest"
      }
      override { instance_type = var.ecs_instance_type }
      override { instance_type = var.ecs_fallback_instance_type }
    }

    instances_distribution {
      on_demand_base_capacity                  = 1 # guaranteed base instance — prevents Spot outage downtime
      on_demand_percentage_above_base_capacity = 0 # any scale-out above base still uses Spot
      spot_allocation_strategy                 = "capacity-optimized"
    }
  }

  tag {
    key                 = "Name"
    value               = "consultant-agent-gpu-${var.environment}"
    propagate_at_launch = true
  }
  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

# ─────────────────────────────────────────────
# ECS Capacity Providers
# ─────────────────────────────────────────────
resource "aws_ecs_capacity_provider" "app" {
  name = "consultant-agent-app-${var.environment}"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.app.arn
    managed_termination_protection = "ENABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 2
    }
  }
}

resource "aws_ecs_capacity_provider" "gpu" {
  name = "consultant-agent-gpu-${var.environment}"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.gpu.arn
    managed_termination_protection = "ENABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 1
    }
  }
}

# ─────────────────────────────────────────────
# Cloud Map — private DNS for ECS service discovery
# Backend reaches Ollama at http://ollama.{namespace}:11434
# ─────────────────────────────────────────────
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "consultant-agent-${var.environment}.local"
  vpc  = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "ollama" {
  name = "ollama"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# ─────────────────────────────────────────────
# Application Load Balancer
# ─────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "processiq-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = var.environment == "production"

  tags = { Environment = var.environment }
}

resource "aws_lb_target_group" "frontend" {
  name        = "ca-fe-${var.environment}"
  port        = var.frontend_container_port
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "instance"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  tags = { Environment = var.environment }
}

resource "aws_lb_target_group" "backend" {
  name        = "ca-be-${var.environment}"
  port        = var.backend_container_port
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "instance"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }

  tags = { Environment = var.environment }
}

# HTTP listener — default → frontend; /api/* and /health → backend
# No custom domain required: access the app via the ALB DNS name
# e.g. http://processiq-staging-xxxxx.us-east-1.elb.amazonaws.com
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "backend_health" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 9

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern { values = ["/health"] }
  }
}

resource "aws_lb_listener_rule" "backend_api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

# ─────────────────────────────────────────────
# EFS File System & Security Group
# ─────────────────────────────────────────────
resource "aws_security_group" "efs" {
  name_prefix = "consultant-agent-efs-${var.environment}-"
  description = "Allow NFS traffic from ECS instances"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "NFS from ECS instances and tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_instances.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Environment = var.environment }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_efs_file_system" "this" {
  creation_token = "consultant-agent-efs-${var.environment}"
  encrypted      = true

  tags = {
    Name        = "consultant-agent-efs-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_efs_mount_target" "this" {
  count           = length(module.vpc.private_subnets)
  file_system_id  = aws_efs_file_system.this.id
  subnet_id       = module.vpc.private_subnets[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "backend" {
  file_system_id = aws_efs_file_system.this.id

  root_directory {
    path = "/backend"
    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "755"
    }
  }

  tags = { Name = "consultant-agent-backend-${var.environment}" }
}

resource "aws_efs_access_point" "ollama" {
  file_system_id = aws_efs_file_system.this.id

  root_directory {
    path = "/ollama"
    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "755"
    }
  }

  posix_user {
    uid = 0
    gid = 0
  }

  tags = { Name = "consultant-agent-ollama-${var.environment}" }
}

# ─────────────────────────────────────────────
# CloudWatch Log Groups
# ─────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/consultant-agent-${var.environment}/frontend"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/consultant-agent-${var.environment}/backend"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "ollama" {
  name              = "/ecs/consultant-agent-${var.environment}/ollama"
  retention_in_days = 7
}

# ─────────────────────────────────────────────
# ECS Task Definitions
# ─────────────────────────────────────────────
resource "aws_ecs_task_definition" "frontend" {
  family                   = "consultant-agent-frontend-${var.environment}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = "${aws_ecr_repository.frontend.repository_url}:latest"
    essential = true
    memory    = 256
    cpu       = 128

    portMappings = [{
      containerPort = var.frontend_container_port
      hostPort      = 0
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "development" },
      { name = "VITE_API_URL", value = "/api" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])

  tags = { Environment = var.environment }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "consultant-agent-backend-${var.environment}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "uploads"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.this.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.backend.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true
    memory    = 512
    cpu       = 256

    portMappings = [{
      containerPort = var.backend_container_port
      hostPort      = 0
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "development" },
      { name = "PORT", value = tostring(var.backend_container_port) },
      { name = "UPLOAD_DIR", value = "/app/uploads" },
      { name = "MAX_FILE_SIZE", value = "10485760" },
      { name = "DEFAULT_MODEL", value = "ollama:gemma3:4b" },
      { name = "OLLAMA_MODELS", value = "gemma3:4b,qwen2.5:7b,gemma3:27b" },
      { name = "OLLAMA_EMBED_MODEL", value = "nomic-embed-text" },
      { name = "GPU_SCALING_MODE", value = "on-demand" },
      { name = "OPENSEARCH_NODE", value = "https://${aws_opensearch_domain.main.endpoint}" },
      { name = "OPENSEARCH_USERNAME", value = "admin" },
      { name = "OLLAMA_BASE_URL", value = "http://ollama.consultant-agent-${var.environment}.local:11434" },
      { name = "ENVIRONMENT", value = var.environment },
      { name = "AWS_REGION", value = var.aws_region }
    ]

    secrets = [
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "ADMIN_PASSWORD", valueFrom = aws_secretsmanager_secret.admin_password.arn },
      { name = "OPENSEARCH_PASSWORD", valueFrom = aws_secretsmanager_secret.opensearch_password.arn }
    ]

    mountPoints = [{
      sourceVolume  = "uploads"
      containerPath = "/app/uploads"
      readOnly      = false
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  tags = { Environment = var.environment }
}

locals {
  ollama_gpu_resources = var.ecs_ollama_gpu_count > 0 ? [
    { type = "GPU", value = tostring(var.ecs_ollama_gpu_count) }
  ] : []
}

resource "aws_ecs_task_definition" "ollama" {
  family                   = "consultant-agent-ollama-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "ollama-models"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.this.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.ollama.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "ollama"
      image     = "ollama/ollama:latest"
      essential = true
      memory    = 30886
      cpu       = 8192

      entryPoint = ["/bin/sh", "-c"]
      command = [<<-EOF
        # Start Ollama server in the background
        ollama serve &
        SERVER_PID=$!
        echo "Waiting for Ollama server..."
        until ollama list >/dev/null 2>&1; do sleep 2; done

        # Pull models if not already present (EFS persists across restarts)
        for model in nomic-embed-text:latest gemma3:4b qwen2.5:7b gemma3:27b qwen3.5:14b qwen3.5:27b qwen3.5:35b qwen3.5:35b-a3b; do
          echo "Pulling $model ..."
          ollama pull "$model"
        done
        echo "All models ready."

        # Keep container alive by waiting on the server process
        wait $SERVER_PID
      EOF
      ]

      portMappings = [{
        containerPort = 11434
        hostPort      = 11434
        protocol      = "tcp"
      }]

      environment = [
        { name = "OLLAMA_HOST", value = "0.0.0.0" },
        { name = "OLLAMA_NUM_PARALLEL", value = "2" },
        { name = "OLLAMA_MAX_LOADED_MODELS", value = "1" },
        { name = "OLLAMA_NUM_CTX", value = "131072" }
      ]

      resourceRequirements = local.ollama_gpu_resources

      mountPoints = [{ sourceVolume = "ollama-models", containerPath = "/root/.ollama", readOnly = false }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ollama.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ollama"
        }
      }
    }
  ])

  tags = { Environment = var.environment }
}

# ─────────────────────────────────────────────
# ECS Services
# frontend + backend → app capacity provider (t3.small, always-on)
# ollama            → gpu capacity provider  (g5.2xlarge, on-demand)
# ─────────────────────────────────────────────
resource "aws_ecs_service" "frontend" {
  name            = "consultant-agent-frontend-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.ecs_node_count

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.app.name
    weight            = 1
    base              = 1
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = var.frontend_container_port
  }

  ordered_placement_strategy {
    type  = "binpack"
    field = "memory"
  }

  depends_on = [aws_lb_listener.http]
  tags       = { Environment = var.environment }
}

resource "aws_ecs_service" "backend" {
  name            = "consultant-agent-backend-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.ecs_node_count

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.app.name
    weight            = 1
    base              = 1
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_container_port
  }

  ordered_placement_strategy {
    type  = "binpack"
    field = "memory"
  }

  depends_on = [aws_lb_listener.http]
  tags       = { Environment = var.environment }
}

resource "aws_ecs_service" "ollama" {
  name            = "consultant-agent-ollama-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ollama.arn
  desired_count   = 1

  # GPU provider — ECS managed scaling wakes the g5.2xlarge when this service
  # has pending tasks and scales it back to 0 when idle
  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.gpu.name
    weight            = 1
    base              = 0
  }

  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.ecs_instances.id]
  }

  service_registries {
    registry_arn = aws_service_discovery_service.ollama.arn
  }

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Don't block terraform apply — GPU cold-start (spot provisioning + model
  # pulls) can take 10+ minutes, well beyond Terraform's default timeout.
  wait_for_steady_state = false

  tags = { Environment = var.environment }
}

# ─────────────────────────────────────────────
# AWS OpenSearch Service
# ─────────────────────────────────────────────
resource "aws_security_group" "opensearch" {
  name        = "consultant-agent-opensearch-${var.environment}"
  description = "Managed by Terraform"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_instances.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Environment = var.environment }
}

resource "aws_opensearch_domain" "main" {
  domain_name    = "consultant-agent-${var.environment}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type  = var.opensearch_instance_type
    instance_count = 1
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch_volume_size
  }

  encrypt_at_rest { enabled = true }
  node_to_node_encryption { enabled = true }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  vpc_options {
    subnet_ids         = [module.vpc.private_subnets[0]]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    master_user_options {
      master_user_name     = "admin"
      master_user_password = var.opensearch_master_password
    }
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "*" }
      Action    = "es:*"
      Resource  = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/consultant-agent-${var.environment}/*"
    }]
  })
}

data "aws_caller_identity" "current" {}

# ─────────────────────────────────────────────
# IAM — Infra runner Terraform state permissions
# ─────────────────────────────────────────────
resource "aws_iam_role_policy" "infra_runner_tfstate" {
  name = "consultant-agent-tfstate-${var.environment}"
  role = element(split("/", var.infra_runner_role_arn), length(split("/", var.infra_runner_role_arn)) - 1)

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::consultant-agent-tfstate-us-east-1/infra/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::consultant-agent-tfstate-us-east-1"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/consultant-agent-tflock-us-east-1"
      },
      {
        Effect   = "Allow"
        Action   = ["elasticfilesystem:DescribeMountTargets", "elasticfilesystem:DescribeMountTargetSecurityGroups", "elasticfilesystem:DescribeFileSystems", "elasticfilesystem:DescribeAccessPoints"]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────
# IAM Role for GitHub Actions OIDC
# ─────────────────────────────────────────────
data "aws_iam_openid_connect_provider" "github" {
  count = var.environment == "staging" ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions" {
  name = "consultant-agent-github-actions-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github[0].arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:anksoffice-ai/consultantAgent:*"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "consultant-agent-deploy-${var.environment}"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:ListTasks",
          "ecs:DescribeTasks"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["elasticloadbalancing:DescribeLoadBalancers"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:PutSecretValue"]
        Resource = [aws_secretsmanager_secret.jwt_secret.arn, aws_secretsmanager_secret.admin_password.arn, aws_secretsmanager_secret.opensearch_password.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.ecs_task_execution.arn, aws_iam_role.ecs_task.arn]
      }
    ]
  })
}
