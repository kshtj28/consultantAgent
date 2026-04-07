# Infrastructure Architecture — Consultant Agent

## Diagram files

| File | Format | How to open |
|---|---|---|
| [infra-architecture.drawio](infra-architecture.drawio) | draw.io XML (AWS native icons) | Open in [draw.io](https://app.diagrams.net) or VS Code with the **Draw.io Integration** extension |
| [infra-architecture.png](infra-architecture.png) | PNG (auto-generated) | `python3 docs/infra_diagram.py` (requires `pip install diagrams`) |

### Open the draw.io diagram (recommended)

**Option 1 — VS Code**
Install the [Draw.io Integration](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) extension, then open `infra-architecture.drawio` directly.

**Option 2 — Browser**
Go to [app.diagrams.net](https://app.diagrams.net) → File → Open from → This Device → select `infra-architecture.drawio`.

**Option 3 — Desktop app**
Download [draw.io desktop](https://github.com/jgraph/drawio-desktop/releases) and open the file.

---

## Architecture Overview

```
Internet
  └── End User (HTTP :80)
  └── GitHub Actions (OIDC → AssumeRoleWithWebIdentity)

AWS Cloud  (staging: us-east-1  |  production: me-central-1)
  │
  ├── Amazon VPC  10.0.0.0/16 (stg) / 10.1.0.0/16 (prod)  |  2 AZs
  │   │
  │   ├── Public Subnets  AZ-a + AZ-b
  │   │   ├── Internet Gateway
  │   │   ├── ALB — processiq-{env}          HTTP :80
  │   │   │         /        → frontend TG
  │   │   │         /api/*   → backend TG
  │   │   │         /health  → backend TG
  │   │   └── NAT Gateway  (single, Elastic IP)
  │   │
  │   └── Private Subnets  AZ-a + AZ-b
  │       │
  │       ├── App Tier  [t3.small ASG  min=1 always-on]
  │       │   ├── ECS Service: frontend   CPU 128 / RAM 256 MB  port :80  bridge
  │       │   └── ECS Service: backend    CPU 256 / RAM 512 MB  port :3001 bridge
  │       │
  │       ├── GPU Tier  [g5.2xlarge Spot ASG  min=0 cold-start]
  │       │   └── ECS Service: ollama    CPU 2048 / RAM 22 GB / GPU 1  port :11434 awsvpc
  │       │                              gemma3:4b · nomic-embed-text · qwen2.5:7b
  │       │
  │       ├── Amazon EFS  (encrypted, multi-AZ)
  │       │   ├── Access Point /backend  → /app/uploads        (backend uploads)
  │       │   └── Access Point /ollama   → /root/.ollama       (LLM model weights)
  │       │
  │       ├── Amazon OpenSearch Service
  │       │   consultant-agent-{env}  OpenSearch 2.11  t3.small.search  10 GB gp3
  │       │   encrypt at rest + TLS 1.2 + fine-grained access control
  │       │
  │       └── AWS Cloud Map  consultant-agent-{env}.local
  │           ollama A-record → task IP  TTL 10s  MULTIVALUE
  │
  └── Account-Level Services
      ├── Amazon ECR          frontend + backend images  scan on push  keep last 10
      ├── Secrets Manager     jwt-secret · admin-password  injected at ECS task start
      ├── IAM Roles           ecs-exec · ecs-task · github-actions (OIDC)
      ├── CloudWatch Logs     /ecs/…/frontend · /backend · /ollama  7-day retention
      └── Terraform State     S3 bucket + DynamoDB lock table
```

---

## Primary Traffic Flows

| Flow | Protocol | Auth |
|---|---|---|
| User → ALB | HTTP :80 | open (SG: 0.0.0.0/0 :80) |
| ALB → frontend ECS | HTTP dynamic port | SG: ALB → ECS |
| ALB → backend ECS | HTTP dynamic port | SG: ALB → ECS |
| backend → OpenSearch | HTTPS :443 | IAM SigV4 + fine-grained AC |
| backend → ollama | HTTP :11434 | Cloud Map DNS (VPC-private) |
| backend ↔ EFS /backend | NFS :2049 | IAM auth + TLS in-transit |
| ollama ↔ EFS /ollama | NFS :2049 | IAM auth + TLS in-transit |
| GitHub Actions → AWS | HTTPS | OIDC (no static credentials) |
| ECS Tasks → internet | HTTPS via NAT | IMDSv2 (hop limit 2) |

---

## Capacity & Scaling

| Tier | Instance | ASG | Cost Mode |
|---|---|---|---|
| App (frontend + backend) | t3.small | min=1 / max=2 (stg) · max=4 (prod) | On-Demand, always-on |
| GPU (ollama) | g5.2xlarge | min=0 / max=1 | 100% Spot, cold-start |

---

## Security Boundaries

| Boundary | Mechanism |
|---|---|
| Internet → ALB | SG: ingress 0.0.0.0/0 :80 only |
| ALB → ECS | SG: dynamic ports from ALB SG only |
| ECS ↔ ECS (inter-service) | SG: self-referencing rule |
| ECS → EFS | SG: NFS :2049 from ECS SG; IAM+TLS |
| ECS → OpenSearch | SG: HTTPS :443 from ECS SG; IAM SigV4 |
| Secrets at rest | Secrets Manager (KMS-encrypted, 0-day recovery) |
| ECS Task credentials | IMDSv2 required, hop_limit=2 for Docker |
| CI/CD → AWS | OIDC (no static keys) |
| Terraform state | S3 + DynamoDB scoped by IAM policy |

---

## Component Inventory

| AWS Service | Resource Name | Purpose |
|---|---|---|
| VPC | consultant-agent-{env} | Network isolation, 2 AZs |
| ALB | processiq-{env} | HTTP :80 public entry, path-based routing |
| Internet Gateway | — | Public internet ingress/egress |
| NAT Gateway | — | Outbound internet for private subnets |
| ECS Cluster | consultant-agent-{env} | Hosts all 3 services, Container Insights on |
| ECS Service | consultant-agent-frontend-{env} | React SPA, always-on |
| ECS Service | consultant-agent-backend-{env} | REST API, always-on |
| ECS Service | consultant-agent-ollama-{env} | LLM inference, GPU Spot, cold-start |
| ECR | consultant-agent/frontend | Frontend images, scan on push |
| ECR | consultant-agent/backend | Backend images, scan on push |
| EFS | consultant-agent-efs-{env} | Encrypted shared storage, multi-AZ |
| EFS Access Point | /backend | Backend file uploads |
| EFS Access Point | /ollama | LLM model weights (survive restarts) |
| OpenSearch | consultant-agent-{env} | Search + vector index |
| Cloud Map | consultant-agent-{env}.local | Private DNS for ollama service discovery |
| Secrets Manager | jwt-secret, admin-password | Injected at ECS task start |
| CloudWatch Logs | /ecs/…/{service} | 7-day log retention per service |
| IAM Role | ecs-instance | EC2 → ECS agent + SSM |
| IAM Role | ecs-exec | ECR pull, CW logs, Secrets read |
| IAM Role | ecs-task | OpenSearch + EFS app permissions |
| IAM Role | github-actions | OIDC CI/CD: ECR push, ECS update, secrets write |
| S3 | consultant-agent-tfstate-us-east-1 | Terraform remote state |
| DynamoDB | consultant-agent-tflock-us-east-1 | Terraform state lock |
