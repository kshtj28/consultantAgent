# Staging environment
aws_region                 = "us-east-1"
dr_region                  = "us-west-1"
environment                = "staging"

# App tier — always-on t3.small for frontend + backend
app_instance_type          = "t3.small"
ecs_node_count             = 1

# GPU tier — on-demand g5.2xlarge for Ollama (scales 0→1 when tasks are pending)
ecs_instance_type          = "g5.2xlarge"
ecs_fallback_instance_type = "g6.2xlarge"
ecs_use_gpu_ami            = true
ecs_ollama_gpu_count       = 1

opensearch_instance_type   = "t3.small.search"
opensearch_volume_size     = 10

infra_runner_role_arn      = "arn:aws:iam::657552582368:role/github-actions-infra-bootstrap"
