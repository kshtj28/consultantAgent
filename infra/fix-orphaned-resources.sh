#!/usr/bin/env bash
# fix-orphaned-resources.sh
# Imports or deletes orphaned AWS resources left behind by a failed terraform apply.
# Run from the infra/ directory: bash fix-orphaned-resources.sh

set -euo pipefail

REGION="us-east-1"
ENV="staging"

# Prompt for OpenSearch master password (sensitive — not stored in tfvars)
if [ -z "${TF_VAR_opensearch_master_password:-}" ]; then
  read -rsp "Enter OpenSearch master password: " TF_VAR_opensearch_master_password
  echo ""
  export TF_VAR_opensearch_master_password
fi

TFVARS="-var-file=envs/staging.tfvars"

echo "==> Fetching VPC ID for consultant-agent-${ENV}..."
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=consultant-agent-${ENV}" \
  --query "Vpcs[0].VpcId" \
  --output text --region "$REGION" 2>/dev/null || echo "")

if [ -z "$VPC_ID" ] || [ "$VPC_ID" = "None" ]; then
  echo "    VPC not found — nothing to clean up. Run terraform apply."
  exit 0
fi
echo "    VPC: $VPC_ID"

# ── Helper: import a resource into terraform state ─────────────────────────────
tf_import() {
  local addr=$1
  local id=$2
  if terraform state show "$addr" &>/dev/null; then
    echo "    [skip] $addr already in state"
  else
    echo "    [import] $addr = $id"
    terraform import $TFVARS "$addr" "$id"
  fi
}

# ── Helper: delete a security group if it exists and is NOT in state ──────────
delete_orphaned_sg() {
  local name=$1
  local sg_id
  sg_id=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${name}" "Name=vpc-id,Values=${VPC_ID}" \
    --query "SecurityGroups[0].GroupId" \
    --output text --region "$REGION" 2>/dev/null || echo "None")

  if [ -z "$sg_id" ] || [ "$sg_id" = "None" ]; then
    echo "    [ok] SG '$name' does not exist in AWS"
    return
  fi

  # Check if it is already tracked in terraform state
  local tf_addr=$2
  if terraform state show "$tf_addr" &>/dev/null; then
    echo "    [ok] SG '$name' ($sg_id) already in Terraform state"
    return
  fi

  # Orphaned — delete it so terraform can recreate
  echo "    [delete] orphaned SG '$name' ($sg_id)"
  aws ec2 delete-security-group --group-id "$sg_id" --region "$REGION"
}

echo ""
echo "==> Checking for orphaned Security Groups..."
delete_orphaned_sg "consultant-agent-alb-${ENV}"         "aws_security_group.alb"
delete_orphaned_sg "consultant-agent-ecs-${ENV}"         "aws_security_group.ecs_instances"
delete_orphaned_sg "consultant-agent-opensearch-${ENV}"  "aws_security_group.opensearch"

# EFS uses name_prefix so look by tag
EFS_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Environment,Values=${ENV}" "Name=vpc-id,Values=${VPC_ID}" \
            "Name=group-name,Values=consultant-agent-efs-${ENV}*" \
  --query "SecurityGroups[0].GroupId" \
  --output text --region "$REGION" 2>/dev/null || echo "None")
if [ -n "$EFS_SG_ID" ] && [ "$EFS_SG_ID" != "None" ]; then
  if ! terraform state show "aws_security_group.efs" &>/dev/null; then
    echo "    [delete] orphaned EFS SG ($EFS_SG_ID)"
    aws ec2 delete-security-group --group-id "$EFS_SG_ID" --region "$REGION" 2>/dev/null || true
  fi
fi

echo ""
echo "==> Checking for orphaned ECS Cluster..."
CLUSTER_ARN=$(aws ecs describe-clusters \
  --clusters "consultant-agent-${ENV}" \
  --query "clusters[?status=='ACTIVE'].clusterArn" \
  --output text --region "$REGION" 2>/dev/null || echo "")
if [ -n "$CLUSTER_ARN" ] && [ "$CLUSTER_ARN" != "None" ]; then
  tf_import "aws_ecs_cluster.main" "consultant-agent-${ENV}"
fi

echo ""
echo "==> Checking for orphaned ECR repositories..."
for repo in "consultant-agent/frontend" "consultant-agent/backend"; do
  REPO_URL=$(aws ecr describe-repositories \
    --repository-names "$repo" \
    --query "repositories[0].repositoryUri" \
    --output text --region "$REGION" 2>/dev/null || echo "None")
  if [ -n "$REPO_URL" ] && [ "$REPO_URL" != "None" ]; then
    tf_addr="aws_ecr_repository.$(echo $repo | cut -d'/' -f2)"
    tf_import "$tf_addr" "$repo"
  fi
done

echo ""
echo "==> Checking for orphaned IAM roles..."
for role_suffix in "ecs-instance" "ecs-exec" "ecs-task"; do
  ROLE_NAME="consultant-agent-${role_suffix}-${ENV}"
  EXISTS=$(aws iam get-role --role-name "$ROLE_NAME" \
    --query "Role.RoleName" --output text 2>/dev/null || echo "None")
  if [ "$EXISTS" != "None" ] && [ -n "$EXISTS" ]; then
    case "$role_suffix" in
      "ecs-instance") tf_import "aws_iam_role.ecs_instance"      "$ROLE_NAME" ;;
      "ecs-exec")     tf_import "aws_iam_role.ecs_task_execution" "$ROLE_NAME" ;;
      "ecs-task")     tf_import "aws_iam_role.ecs_task"           "$ROLE_NAME" ;;
    esac
  fi
done

echo ""
echo "==> Done. Now running terraform apply..."
terraform apply $TFVARS
