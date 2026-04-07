# GPU ASG Always-On Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the GPU tier ASG to always keep one g5 Spot instance running, eliminating cold-start on first Ollama request.

**Architecture:** Two-line change to `aws_autoscaling_group.gpu` in `infra/resources.tf` — set `min_size` and `desired_capacity` from 0 to 1. No other resources are affected. ECS managed scaling continues to control desired_capacity at runtime via `ignore_changes`.

**Tech Stack:** Terraform ~> 1.5, AWS provider ~> 5.0

---

### Task 1: Update GPU ASG min_size and desired_capacity

**Files:**
- Modify: `infra/resources.tf:460-462`

- [ ] **Step 1: Verify current state**

```bash
grep -n "min_size\|desired_capacity" infra/resources.tf
```

Expected output includes two blocks — the app ASG and the GPU ASG. The GPU ASG should show:
```
460:  min_size         = 0
462:  desired_capacity = 0
```

- [ ] **Step 2: Apply the change**

In `infra/resources.tf`, find `aws_autoscaling_group.gpu` (around line 457) and update:

```hcl
resource "aws_autoscaling_group" "gpu" {
  name                = "consultant-agent-gpu-${var.environment}"
  vpc_zone_identifier = module.vpc.private_subnets
  min_size            = 1  # was 0 — keep one Spot instance always running
  max_size            = 1
  desired_capacity    = 1  # was 0 — start one instance at apply time
```

Leave everything else (mixed_instances_policy, tags, lifecycle) unchanged.

- [ ] **Step 3: Verify the diff**

```bash
git diff infra/resources.tf
```

Expected: exactly 2 lines changed — `min_size` and `desired_capacity` on the GPU ASG. No other changes.

- [ ] **Step 4: Run terraform plan**

```bash
cd infra && terraform plan -var-file=staging.tfvars
```

Expected plan output — should show only the ASG update:
```
  # aws_autoscaling_group.gpu will be updated in-place
  ~ resource "aws_autoscaling_group" "gpu" {
      ~ desired_capacity = 0 -> 1
      ~ min_size         = 0 -> 1
        # (all other attributes unchanged)
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

If the plan shows any additional resources changing, investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add infra/resources.tf
git commit -m "feat(infra): keep g5 spot instance always running (min_size=1)"
```

---

### Task 2: Apply and verify

- [ ] **Step 1: Apply the change**

```bash
cd infra && terraform apply -var-file=staging.tfvars
```

Type `yes` when prompted. Expected: `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`

- [ ] **Step 2: Verify instance launched**

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names consultant-agent-gpu-staging \
  --query "AutoScalingGroups[0].{Min:MinSize,Desired:DesiredCapacity,Instances:Instances[*].InstanceId}" \
  --output json
```

Expected:
```json
{
  "Min": 1,
  "Desired": 1,
  "Instances": ["i-xxxxxxxxxxxxxxxxx"]
}
```

- [ ] **Step 3: Verify ECS registered the instance**

```bash
aws ecs list-container-instances \
  --cluster consultant-agent-staging \
  --query "containerInstanceArns" \
  --output text
```

Expected: at least one ARN for the GPU instance (may take 2–3 minutes after launch for ECS registration).
