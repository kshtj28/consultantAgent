# GPU On-Demand Scaling for Interview Start

**Date:** 2026-03-22
**Status:** Approved

## Problem

The GPU tier (g5.xlarge/g5.2xlarge) running Ollama currently relies on ECS managed scaling — it only wakes up reactively when Ollama tasks go pending. This causes a 3-4 minute cold start that users experience as a hang. Additionally, the instance should not run continuously; it must spin up only when needed and terminate after 1 hour of inactivity.

## Solution

When `GPU_SCALING_MODE=on-demand` is set, the `POST /readiness/start` endpoint proactively calls the AWS AutoScaling API to set the GPU ASG `DesiredCapacity=1` before creating the interview session. A 1-hour keep-alive timer resets on each interview start, then sets the Ollama ECS service to `desired_count=0` and the ASG `DesiredCapacity=0` to terminate the instance.

## Feature Flag

| Env Var | Value | Behaviour |
|---|---|---|
| `GPU_SCALING_MODE` | `on-demand` | Proactive ASG scale-up on interview start |
| `GPU_SCALING_MODE` | absent / any other | Existing ECS reactive scaling (no change) |

Additional env vars required when `on-demand` is active:
- `ENVIRONMENT` — used to construct the ASG name (`consultant-agent-gpu-${ENVIRONMENT}`)
- `AWS_REGION` — AWS region for the AutoScaling client (needed in local dev; in ECS the SDK auto-detects from IMDS)

## Architecture

### New file: `backend/src/services/gpuScalingService.ts`

Responsibilities:
- `triggerGpuWarmup(): Promise<void>` — calls `UpdateAutoScalingGroup` to set `DesiredCapacity=1`. Throws on failure.
- `scheduleScaleDown(): void` — sets/resets a module-level `setTimeout` for 1 hour that:
  1. Calls ECS `UpdateService` to set Ollama service `desired_count=0` (required to release `managed_termination_protection` on the instance)
  2. Calls `UpdateAutoScalingGroup` with `DesiredCapacity=0`
  Each new interview start resets the timer, so back-to-back sessions don't terminate the instance mid-use.
- Uses AWS SDK v3 `@aws-sdk/client-auto-scaling` and `@aws-sdk/client-ecs` with credentials sourced from the ECS task IAM role (no hardcoded keys).

**Scale-down sequence:** `UpdateService(desiredCount=0)` is called first to release managed instance protection, followed by `UpdateAutoScalingGroup(DesiredCapacity=0)`. ECS drains the Ollama task asynchronously (typically 10–60 seconds) before releasing instance protection. The ASG will re-evaluate and terminate the instance once protection is cleared — this happens automatically but not immediately. The implementation does not poll for task stability; the instance will terminate within a few minutes of the scale-down call, not instantaneously.

**Known limitations:**
- If the backend process restarts within the 1-hour window, the scale-down timer is lost. The instance will remain up until ECS idle detection terminates it or a new interview triggers a fresh timer.
- The GPU ASG uses 100% Spot instances. A Spot interruption will restart the ECS task; if this happens mid-timer the scale-down countdown is also lost (same as above).

### Modified: `backend/src/routes/readinessRoutes.ts` — `POST /start`

> **Note:** The active frontend page (`ProcessAnalysis.tsx`) calls `POST /readiness/start` via `startReadinessSession()`. The `POST /interview/start` route exists but is not currently called from any frontend page. GPU scaling is applied to the readiness route. `POST /interview/start` can be wired identically in a follow-up.

When `GPU_SCALING_MODE=on-demand`:
1. Call `triggerGpuWarmup()` — if it throws, return **HTTP 503** immediately (no session created).
2. Call `scheduleScaleDown()` to reset the 1-hour timer.
3. Continue with existing session creation logic unchanged.

If `GPU_SCALING_MODE` is not `on-demand`, the route is completely unchanged.

### Error Response Shape (new)

```json
{
  "error": "GPU instance could not be started. Please try again.",
  "code": "GPU_SCALE_UP_FAILED"
}
```

HTTP status: **503**

### Frontend: `frontend/src/pages/ProcessAnalysis.tsx`

The `startReadinessSession()` call uses the shared `request<T>()` helper in `api.ts`, which throws a plain `Error` with the `error` string on non-2xx responses. The `code` field is not exposed by the helper.

Error detection strategy: catch the error thrown by `startReadinessSession()` and check `error.message` for the string `"GPU instance could not be started"`. On match:
- Show an inline error: *"Could not start the AI engine. Please try again."*
- Show a **Try Again** button that re-invokes the start flow

This is scoped to the `startReadinessSession()` call inside `ProcessAnalysis.tsx`'s `handleBeginInterview` function. Since the component stays on the `select_areas` step when the error is thrown, the existing "Begin Assessment" button already serves as the retry action. No separate "Try Again" button is needed — the error message is shown inline above the existing button.

### Infra: `infra/resources.tf`

**1. IAM — add to `aws_iam_role_policy.ecs_task` (the application runtime role, NOT `ecs_task_execution`):**

Two separate statements are needed because `DescribeAutoScalingGroups` does not support resource-level permissions in AWS (it requires `Resource: "*"`):

```json
{
  "Effect": "Allow",
  "Action": ["autoscaling:UpdateAutoScalingGroup"],
  "Resource": "arn:aws:autoscaling:<region>:<account>:autoScalingGroup:*:autoScalingGroupName/consultant-agent-gpu-*"
},
{
  "Effect": "Allow",
  "Action": ["autoscaling:DescribeAutoScalingGroups"],
  "Resource": "*"
},
{
  "Effect": "Allow",
  "Action": ["ecs:UpdateService", "ecs:DescribeServices"],
  "Resource": "arn:aws:ecs:<region>:<account>:service/consultant-agent-<env>/consultant-agent-ollama-*"
}
```

**2. Backend ECS task definition — add environment variables:**

```hcl
{ name = "ENVIRONMENT", value = var.environment },
{ name = "AWS_REGION",  value = var.aws_region  }
```

These are needed so `gpuScalingService.ts` can construct the correct ASG name and configure the SDK client at runtime. Without `ENVIRONMENT`, the ASG name would be `consultant-agent-gpu-undefined` causing all scale-up calls to fail.

### Env vars: `backend/.env.example`

```
# GPU On-Demand Scaling (optional)
# Set to 'on-demand' to proactively spin up g5 GPU instance on interview start
GPU_SCALING_MODE=on-demand
ENVIRONMENT=staging
AWS_REGION=me-central-1
```

## Sequence

```
User clicks "Start New" (ProcessAnalysis.tsx)
  → POST /readiness/start
      [GPU_SCALING_MODE=on-demand?]
        YES → triggerGpuWarmup()
                → AWS UpdateAutoScalingGroup(DesiredCapacity=1)
                  FAIL → return 503 { error, code }
                               → Frontend shows "Try Again" error
                  OK   → scheduleScaleDown() resets 1hr timer
                       → createReadinessSession()
                       → return 201 { session, ... }
        NO  → createReadinessSession() (no change)

[1 hour later, no new interviews]
  → setTimeout fires
  → AWS ECS UpdateService(desiredCount=0)  ← releases managed_termination_protection
  → AWS UpdateAutoScalingGroup(DesiredCapacity=0)
  → g5 instance terminates
```

## Instance Lifecycle

- **Default state:** ASG `DesiredCapacity=0`, `MinSize=0` — no instance running, no cost.
- **On interview start:** ASG `DesiredCapacity=1` — ECS provisions the g5 instance.
- **Keep-alive:** Every new interview start within the hour resets the 1hr countdown.
- **Scale-down:** 1 hour after the last interview start, Ollama ECS service desired_count set to 0, then ASG `DesiredCapacity=0`.

## Out of Scope

- Applying GPU scaling to `POST /interview/start` (currently unused by frontend; can be added later)
- Frontend polling / "GPU warming up" status indicator
- Persistent scale-down timer across backend restarts (CloudWatch scheduled actions)
