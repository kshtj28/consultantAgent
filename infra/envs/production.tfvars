# Production environment
aws_region                 = "me-central-1"
dr_region                  = "me-south-1"
environment                = "production"

# t3.xlarge: CPU-only inference (Ollama runs slower but no GPU cost)
# Upgrade to a GPU instance type and set ecs_use_gpu_ami=true / ecs_ollama_gpu_count=1
# when production GPU inference is needed.
ecs_instance_type          = "t3.xlarge"
ecs_fallback_instance_type = "t3.large"
ecs_node_count             = 2
ecs_use_gpu_ami            = false
ecs_ollama_gpu_count       = 0

opensearch_instance_type   = "t3.small.search"
opensearch_volume_size     = 20
