"""
AWS Infrastructure Diagram — Consultant Agent
Run:  python3 docs/infra_diagram.py
Output: docs/infra-architecture.png
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import ECR, ElasticContainerServiceService
from diagrams.aws.network import ALB, NATGateway, InternetGateway, CloudMap
from diagrams.aws.storage import EFS, S3
from diagrams.aws.analytics import AmazonOpensearchService
from diagrams.aws.security import SecretsManager, IAMRole
from diagrams.aws.management import Cloudwatch
from diagrams.aws.general import User
from diagrams.onprem.vcs import Github

GRAPH_ATTR = {
    "fontsize":  "13",
    "bgcolor":   "white",
    "pad":       "1.2",
    "splines":   "ortho",
    "nodesep":   "1.0",
    "ranksep":   "1.4",
    "fontname":  "Arial",
    "rankdir":   "TB",
}

CLUSTER_FONT = {"fontsize": "12", "fontname": "Arial Bold"}

with Diagram(
    "Consultant Agent — AWS Infrastructure",
    filename="docs/infra-architecture",
    outformat="png",
    graph_attr=GRAPH_ATTR,
    show=False,
    direction="TB",
):

    # ── Row 0: External ───────────────────────────────────────────────
    user = User("End User\nBrowser")
    gha  = Github("GitHub Actions\nCI/CD · OIDC")

    # ══════════════════════════════════════════════════════════════════
    # VPC
    # ══════════════════════════════════════════════════════════════════
    with Cluster("Amazon VPC — 10.0.0.0/16  |  2 Availability Zones", graph_attr=CLUSTER_FONT):

        igw = InternetGateway("Internet\nGateway")

        # ── Public subnets ─────────────────────────────────────────────
        with Cluster("Public Subnets  (AZ-a · AZ-b)", graph_attr=CLUSTER_FONT):
            alb = ALB("ALB — processiq-{env}\nHTTP :80  internet-facing\n────────────────\n/        → frontend\n/api/*   → backend\n/health  → backend")
            nat = NATGateway("NAT Gateway\nElastic IP")

        # ── Private subnets ────────────────────────────────────────────
        with Cluster("Private Subnets  (AZ-a · AZ-b)", graph_attr=CLUSTER_FONT):

            # App tier
            with Cluster("App Tier — t3.small  |  ASG min=1 always-on", graph_attr=CLUSTER_FONT):
                fe = ElasticContainerServiceService(
                    "ECS Service: frontend\nCPU 128 · RAM 256 MB\nPort :80 bridge\nReact SPA")
                be = ElasticContainerServiceService(
                    "ECS Service: backend\nCPU 256 · RAM 512 MB\nPort :3001 bridge\nNode.js REST API")

            # GPU tier
            with Cluster("GPU Tier — g5.2xlarge Spot  |  ASG min=0 cold-start", graph_attr=CLUSTER_FONT):
                ollama = ElasticContainerServiceService(
                    "ECS Service: ollama\nCPU 2048 · RAM 22 GB · GPU 1\nPort :11434 awsvpc\ngemma3:4b · nomic-embed-text\nqwen2.5:7b")

            # OpenSearch + CloudMap side-by-side
            with Cluster("Managed Services", graph_attr=CLUSTER_FONT):
                opensearch = AmazonOpensearchService(
                    "OpenSearch Service\nOpenSearch 2.11\nt3.small.search · 10 GB gp3\nencrypted · TLS · FGAC")
                cloudmap = CloudMap(
                    "Cloud Map\nconsultant-agent-{env}.local\nollama A-record · TTL 10s")

            # EFS
            with Cluster("Amazon EFS — encrypted · multi-AZ mounts", graph_attr=CLUSTER_FONT):
                efs_be = EFS("Access Point /backend\n→ /app/uploads  (uid 1000)")
                efs_ol = EFS("Access Point /ollama\n→ /root/.ollama  (LLM weights)")

    # ══════════════════════════════════════════════════════════════════
    # Account-Level Services (outside VPC)
    # ══════════════════════════════════════════════════════════════════
    with Cluster("Account-Level Services", graph_attr=CLUSTER_FONT):

        with Cluster("Amazon ECR", graph_attr=CLUSTER_FONT):
            ecr_fe = ECR("frontend\nscan on push")
            ecr_be = ECR("backend\nscan on push")

        with Cluster("Secrets Manager", graph_attr=CLUSTER_FONT):
            sm_jwt   = SecretsManager("jwt-secret")
            sm_admin = SecretsManager("admin-password")

        with Cluster("IAM Roles", graph_attr=CLUSTER_FONT):
            iam_exec = IAMRole("ECS Exec Role\nECR · CW · Secrets")
            iam_task = IAMRole("ECS Task Role\nOpenSearch · EFS")

        tf_s3 = S3("Terraform State\nS3 + DynamoDB lock")

    cw = Cloudwatch("CloudWatch Logs\nfrontend · backend · ollama\n7-day retention")

    # ══════════════════════════════════════════════════════════════════
    # PRIMARY TRAFFIC FLOWS
    # ══════════════════════════════════════════════════════════════════

    # User → ALB
    user >> Edge(label="HTTP :80", color="#232F3E", penwidth="2") >> igw >> alb

    # ALB routing
    alb >> Edge(label="frontend TG", color="#8C4FFF", penwidth="2") >> fe
    alb >> Edge(label="backend TG", color="#8C4FFF", penwidth="2") >> be

    # Backend service calls
    be >> Edge(label="HTTPS :443\nIAM SigV4", color="#005EB8") >> opensearch
    be >> Edge(label="HTTP :11434\nCloud Map DNS", color="#E07B00") >> ollama
    be >> Edge(label="NFS :2049  IAM+TLS", color="#3F8624") >> efs_be

    # Ollama → EFS (model storage)
    ollama >> Edge(label="NFS :2049  models persist", color="#3F8624") >> efs_ol

    # Service discovery
    cloudmap >> Edge(label="A record", style="dashed", color="#E7157B") >> ollama

    # Secrets injection
    sm_jwt   >> Edge(label="task start", style="dashed", color="#DD344C") >> be
    sm_admin >> Edge(label="task start", style="dashed", color="#DD344C") >> be

    # Outbound internet
    fe     >> Edge(style="dashed", color="#aaaaaa") >> nat
    be     >> Edge(style="dashed", color="#aaaaaa") >> nat
    ollama >> Edge(style="dashed", color="#aaaaaa") >> nat
    nat    >> igw

    # CI/CD
    gha >> Edge(label="docker push", color="#555555") >> ecr_fe
    gha >> Edge(label="docker push", color="#555555") >> ecr_be
    gha >> Edge(label="PutSecretValue", color="#555555", style="dashed") >> sm_jwt
    gha >> Edge(label="PutSecretValue", color="#555555", style="dashed") >> sm_admin
    gha >> Edge(label="UpdateService", color="#555555") >> fe
    gha >> Edge(label="UpdateService", color="#555555") >> be
    gha >> Edge(label="UpdateService", color="#555555") >> ollama
    gha >> Edge(label="TF state", color="#555555", style="dashed") >> tf_s3

    # IAM
    iam_exec >> Edge(style="dotted", color="#DD344C") >> be
    iam_exec >> Edge(style="dotted", color="#DD344C") >> ollama
    iam_task >> Edge(style="dotted", color="#DD344C") >> be

    # Logs
    fe     >> Edge(label="logs", style="dashed", color="#3F8624") >> cw
    be     >> Edge(label="logs", style="dashed", color="#3F8624") >> cw
    ollama >> Edge(label="logs", style="dashed", color="#3F8624") >> cw
