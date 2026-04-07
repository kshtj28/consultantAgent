# GPU On-Demand Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively spin up the GPU (g5.xlarge) ASG when an interview starts, keep it alive for 1 hour, then terminate it — controlled by a `GPU_SCALING_MODE=on-demand` feature flag.

**Architecture:** A new `gpuScalingService.ts` handles all AWS API calls (AutoScaling + ECS). The `POST /readiness/start` route calls this service before creating the session, returning a 503 if the GPU can't be started. A module-level timer resets on each interview start and triggers scale-down after 1 hour.

**Tech Stack:** AWS SDK v3 (`@aws-sdk/client-auto-scaling`, `@aws-sdk/client-ecs`), TypeScript, Vitest, Express, Terraform (HCL)

**Spec:** `docs/superpowers/specs/2026-03-22-gpu-on-demand-scaling-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/src/services/gpuScalingService.ts` | **Create** | All GPU ASG/ECS scaling logic |
| `backend/src/__tests__/gpuScalingService.test.ts` | **Create** | Unit tests with mocked AWS SDK (follows existing `src/__tests__/` convention) |
| `backend/src/routes/readinessRoutes.ts` | **Modify** (lines 117–141) | Call GPU warmup on POST /start |
| `frontend/src/pages/ProcessAnalysis.tsx` | **Modify** (catch block ~line 145) | GPU-specific error message |
| `backend/.env.example` | **Modify** | Document new env vars (commented out — opt-in feature) |
| `infra/resources.tf` | **Modify** (lines 214–237, 816–825) | IAM policy + backend task env vars |

---

## Task 1: Install AWS SDK packages

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install AWS SDK v3 AutoScaling and ECS clients**

```bash
cd backend
npm install @aws-sdk/client-auto-scaling @aws-sdk/client-ecs
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify types resolve**

```bash
cd backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add AWS SDK v3 auto-scaling and ECS clients"
```

---

## Task 2: Create `gpuScalingService.ts` with tests

**Files:**
- Create: `backend/src/__tests__/gpuScalingService.test.ts`
- Create: `backend/src/services/gpuScalingService.ts`

All existing backend tests live in `backend/src/__tests__/`. The `vitest.config.ts` uses `include: ['src/**/*.test.ts']` so this location is picked up correctly.

### Step 2a: Write the failing test first

- [ ] **Step 1: Create `backend/src/__tests__/gpuScalingService.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock is hoisted above imports by Vitest — AWS SDK is mocked before the service loads
vi.mock('@aws-sdk/client-auto-scaling', () => ({
    AutoScalingClient: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
    UpdateAutoScalingGroupCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-ecs', () => ({
    ECSClient: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
    UpdateServiceCommand: vi.fn(),
}));

import { AutoScalingClient, UpdateAutoScalingGroupCommand } from '@aws-sdk/client-auto-scaling';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { triggerGpuWarmup, scheduleScaleDown } from '../services/gpuScalingService';

describe('gpuScalingService', () => {
    let mockAsgSend: ReturnType<typeof vi.fn>;
    let mockEcsSend: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        process.env.ENVIRONMENT = 'test';
        process.env.AWS_REGION = 'us-east-1';

        mockAsgSend = vi.fn().mockResolvedValue({});
        mockEcsSend = vi.fn().mockResolvedValue({});

        vi.mocked(AutoScalingClient).mockImplementation(() => ({ send: mockAsgSend }) as any);
        vi.mocked(ECSClient).mockImplementation(() => ({ send: mockEcsSend }) as any);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        delete process.env.ENVIRONMENT;
        delete process.env.AWS_REGION;
    });

    describe('triggerGpuWarmup', () => {
        it('calls UpdateAutoScalingGroup with DesiredCapacity=1 for correct ASG', async () => {
            await triggerGpuWarmup();

            expect(UpdateAutoScalingGroupCommand).toHaveBeenCalledWith({
                AutoScalingGroupName: 'consultant-agent-gpu-test',
                DesiredCapacity: 1,
            });
            expect(mockAsgSend).toHaveBeenCalledTimes(1);
        });

        it('throws when AWS call fails', async () => {
            mockAsgSend.mockRejectedValueOnce(new Error('AccessDenied'));

            await expect(triggerGpuWarmup()).rejects.toThrow('AccessDenied');
        });
    });

    describe('scheduleScaleDown', () => {
        it('sets ECS desiredCount=0 and ASG DesiredCapacity=0 after 1 hour', async () => {
            scheduleScaleDown();

            // No calls before timer fires
            expect(mockAsgSend).not.toHaveBeenCalled();
            expect(mockEcsSend).not.toHaveBeenCalled();

            await vi.runAllTimersAsync();

            expect(UpdateServiceCommand).toHaveBeenCalledWith(
                expect.objectContaining({ desiredCount: 0 })
            );
            expect(UpdateAutoScalingGroupCommand).toHaveBeenCalledWith({
                AutoScalingGroupName: 'consultant-agent-gpu-test',
                DesiredCapacity: 0,
            });
        });

        it('resets the countdown when called again within 1 hour', async () => {
            scheduleScaleDown();

            // Advance 30 minutes — no scale-down yet
            vi.advanceTimersByTime(30 * 60 * 1000);
            expect(mockAsgSend).not.toHaveBeenCalled();

            // Reset timer (simulates a second interview starting)
            scheduleScaleDown();

            // Advance 30 more minutes (60 min from first, 30 from reset) — still no scale-down
            vi.advanceTimersByTime(30 * 60 * 1000);
            expect(mockAsgSend).not.toHaveBeenCalled();

            // Fire the remaining time from the reset timer
            await vi.runAllTimersAsync();
            expect(mockAsgSend).toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 2: Run test to confirm it fails (module not found)**

```bash
cd backend
npx vitest run src/__tests__/gpuScalingService.test.ts
```

Expected: FAIL — `Cannot find module '../services/gpuScalingService'`

### Step 2b: Implement the service

- [ ] **Step 3: Create `backend/src/services/gpuScalingService.ts`**

```typescript
import {
    AutoScalingClient,
    UpdateAutoScalingGroupCommand,
} from '@aws-sdk/client-auto-scaling';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';

const ONE_HOUR_MS = 60 * 60 * 1000;

let scaleDownTimer: ReturnType<typeof setTimeout> | null = null;

function getAsgName(): string {
    return `consultant-agent-gpu-${process.env.ENVIRONMENT ?? 'staging'}`;
}

function getEcsClusterName(): string {
    return `consultant-agent-${process.env.ENVIRONMENT ?? 'staging'}`;
}

function getOllamaServiceName(): string {
    return `consultant-agent-ollama-${process.env.ENVIRONMENT ?? 'staging'}`;
}

function buildAsgClient(): AutoScalingClient {
    return new AutoScalingClient({ region: process.env.AWS_REGION });
}

function buildEcsClient(): ECSClient {
    return new ECSClient({ region: process.env.AWS_REGION });
}

/**
 * Scale the GPU ASG to 1. Throws on any AWS error.
 * Call this when an interview starts with GPU_SCALING_MODE=on-demand.
 */
export async function triggerGpuWarmup(): Promise<void> {
    const client = buildAsgClient();
    await client.send(
        new UpdateAutoScalingGroupCommand({
            AutoScalingGroupName: getAsgName(),
            DesiredCapacity: 1,
        })
    );
}

/**
 * Schedule (or reset) a 1-hour timer that scales the GPU tier down.
 * Safe to call on every interview start — resets the countdown each time so
 * back-to-back sessions don't terminate the instance mid-use.
 *
 * Scale-down sequence:
 *   1. ECS UpdateService(desiredCount=0) — releases managed instance protection
 *   2. ASG UpdateAutoScalingGroup(DesiredCapacity=0) — terminates instance once protection clears
 *
 * Note: ECS task draining is async (10–60 s). The instance terminates within a
 * few minutes of this call, not immediately.
 */
export function scheduleScaleDown(): void {
    if (scaleDownTimer) {
        clearTimeout(scaleDownTimer);
    }

    scaleDownTimer = setTimeout(async () => {
        scaleDownTimer = null;

        // Step 1: drain Ollama ECS service to release managed instance protection
        try {
            const ecsClient = buildEcsClient();
            await ecsClient.send(
                new UpdateServiceCommand({
                    cluster: getEcsClusterName(),
                    service: getOllamaServiceName(),
                    desiredCount: 0,
                })
            );
        } catch (err) {
            console.error('[gpuScalingService] Failed to scale down Ollama ECS service:', err);
        }

        // Step 2: set ASG DesiredCapacity=0 — terminates once protection is released
        try {
            const asgClient = buildAsgClient();
            await asgClient.send(
                new UpdateAutoScalingGroupCommand({
                    AutoScalingGroupName: getAsgName(),
                    DesiredCapacity: 0,
                })
            );
            console.info('[gpuScalingService] GPU ASG scaled to 0 after 1-hour idle.');
        } catch (err) {
            console.error('[gpuScalingService] Failed to scale down GPU ASG:', err);
        }
    }, ONE_HOUR_MS);
}
```

- [ ] **Step 4: Run tests — confirm all 4 pass**

```bash
cd backend
npx vitest run src/__tests__/gpuScalingService.test.ts --reporter=verbose
```

Expected output: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/gpuScalingService.ts backend/src/__tests__/gpuScalingService.test.ts
git commit -m "feat: add gpuScalingService with on-demand ASG scale-up and 1-hour timer"
```

---

## Task 3: Wire GPU scaling into `POST /readiness/start`

**Files:**
- Modify: `backend/src/routes/readinessRoutes.ts` (lines 116–141)

- [ ] **Step 1: Add import at top of `readinessRoutes.ts` (after existing imports, before `const router = Router()`)**

```typescript
import { triggerGpuWarmup, scheduleScaleDown } from '../services/gpuScalingService';
```

- [ ] **Step 2: Replace the `router.post('/start', ...)` handler**

Find this exact block (lines 116–141):

```typescript
// Create new readiness session
router.post('/start', async (req: Request, res: Response) => {
    try {
        const { userId = 'anonymous', language = 'en' } = req.body;

        const validLanguage: LanguageCode = isValidLanguage(language) ? language : 'en';

        const session = await createReadinessSession(userId, validLanguage);
        const areas = getAllAreas();
        const languages = getSupportedLanguages();

        res.json({
            session: {
                sessionId: session.sessionId,
                status: session.status,
                language: session.language,
                createdAt: session.createdAt,
            },
            areas,
            languages,
        });
    } catch (error: any) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});
```

Replace with:

```typescript
// Create new readiness session
router.post('/start', async (req: Request, res: Response) => {
    try {
        // GPU on-demand: proactively spin up g5 instance before session is created.
        // Returns 503 if scale-up fails so the user can retry.
        if (process.env.GPU_SCALING_MODE === 'on-demand') {
            try {
                await triggerGpuWarmup();
                scheduleScaleDown(); // reset 1-hour keep-alive timer
            } catch (gpuErr: any) {
                console.error('[readinessRoutes] GPU scale-up failed:', gpuErr);
                return res.status(503).json({
                    error: 'GPU instance could not be started. Please try again.',
                    code: 'GPU_SCALE_UP_FAILED',
                });
            }
        }

        const { userId = 'anonymous', language = 'en' } = req.body;

        const validLanguage: LanguageCode = isValidLanguage(language) ? language : 'en';

        const session = await createReadinessSession(userId, validLanguage);
        const areas = getAllAreas();
        const languages = getSupportedLanguages();

        res.json({
            session: {
                sessionId: session.sessionId,
                status: session.status,
                language: session.language,
                createdAt: session.createdAt,
            },
            areas,
            languages,
        });
    } catch (error: any) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});
```

- [ ] **Step 3: Type-check**

```bash
cd backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd backend
npx vitest run
```

Expected: all tests pass (including the 4 new gpuScalingService tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/readinessRoutes.ts
git commit -m "feat: trigger GPU warmup on POST /readiness/start when GPU_SCALING_MODE=on-demand"
```

---

## Task 4: Frontend — show GPU error in `ProcessAnalysis.tsx`

**Files:**
- Modify: `frontend/src/pages/ProcessAnalysis.tsx` (catch block inside `handleBeginInterview`, ~line 145)

The `handleBeginInterview` function catches errors and calls `setError(err.message)`. The `error` state is already rendered in the UI. We replace only the `catch` block to show a more actionable message for GPU failures. The user stays on the `select_areas` step, so the existing "Begin Assessment" button already acts as the retry — no extra button needed.

- [ ] **Step 1: Replace the catch block inside `handleBeginInterview`**

Find this exact `catch` block:

```typescript
        } catch (err: any) {
            setError(err.message);
        }
```

Replace with:

```typescript
        } catch (err: any) {
            if (err.message?.includes('GPU instance could not be started')) {
                setError('Could not start the AI engine. Please try again.');
            } else {
                setError(err.message);
            }
        }
```

- [ ] **Step 2: Type-check frontend**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProcessAnalysis.tsx
git commit -m "feat: show specific error message when GPU instance fails to start"
```

---

## Task 5: Update `.env.example`

**Files:**
- Modify: `backend/.env.example`

These vars are commented out by default — `GPU_SCALING_MODE` is an opt-in feature. In production, set `GPU_SCALING_MODE=on-demand` directly in the ECS task definition environment block or via a deployment config (see Task 6 note).

- [ ] **Step 1: Append to `backend/.env.example`**

```
# GPU On-Demand Scaling (optional — opt-in feature)
# Uncomment to proactively spin up g5 GPU instance on interview start.
# ENVIRONMENT and AWS_REGION are injected automatically in ECS (see infra/resources.tf).
# GPU_SCALING_MODE=on-demand
# ENVIRONMENT=staging
# AWS_REGION=me-central-1
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add GPU on-demand scaling env vars to .env.example"
```

---

## Task 6: Terraform — IAM policy + backend ECS task env vars

**Files:**
- Modify: `infra/resources.tf`

### Step 6a: Expand the `ecs_task` IAM policy

> Replace the **entire** `aws_iam_role_policy "ecs_task"` resource block (lines 214–237). The outer resource `{...}` braces must be preserved.

- [ ] **Step 1: Replace `aws_iam_role_policy "ecs_task"` (lines 214–237)**

Find this complete resource block:

```hcl
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
      }
    ]
  })
}
```

Replace with this complete resource block:

```hcl
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
```

### Step 6b: Add env vars to backend ECS task definition

- [ ] **Step 2: Replace the backend container `environment` block (lines 816–825)**

Find this exact block:

```hcl
    environment = [
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "development" },
      { name = "PORT", value = tostring(var.backend_container_port) },
      { name = "UPLOAD_DIR", value = "/app/uploads" },
      { name = "MAX_FILE_SIZE", value = "10485760" },
      { name = "DEFAULT_MODEL", value = "ollama:gemma3:4b" },
      { name = "OPENSEARCH_NODE", value = "https://${aws_opensearch_domain.main.endpoint}" },
      { name = "OPENSEARCH_USERNAME", value = "admin" },
      { name = "OLLAMA_BASE_URL", value = "http://ollama.consultant-agent-${var.environment}.local:11434" }
    ]
```

Replace with:

```hcl
    environment = [
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "development" },
      { name = "PORT", value = tostring(var.backend_container_port) },
      { name = "UPLOAD_DIR", value = "/app/uploads" },
      { name = "MAX_FILE_SIZE", value = "10485760" },
      { name = "DEFAULT_MODEL", value = "ollama:gemma3:4b" },
      { name = "OPENSEARCH_NODE", value = "https://${aws_opensearch_domain.main.endpoint}" },
      { name = "OPENSEARCH_USERNAME", value = "admin" },
      { name = "OLLAMA_BASE_URL", value = "http://ollama.consultant-agent-${var.environment}.local:11434" },
      { name = "ENVIRONMENT", value = var.environment },
      { name = "AWS_REGION", value = var.aws_region }
    ]
```

> **Note:** `GPU_SCALING_MODE` is intentionally NOT added here — it defaults to off. To enable GPU on-demand scaling in a deployed environment, add `{ name = "GPU_SCALING_MODE", value = "on-demand" }` to this block and re-apply Terraform.

- [ ] **Step 3: Validate Terraform syntax**

```bash
cd infra
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add infra/resources.tf
git commit -m "feat: add GPU scaling IAM permissions and env vars to backend ECS task"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend
npx vitest run --reporter=verbose
```

Expected: all tests pass. Confirm `gpuScalingService.test.ts` appears in the output with 4 passing tests.

- [ ] **Step 2: Type-check backend**

```bash
cd backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Type-check frontend**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

---

## Manual Testing Checklist (AWS deployment)

After Terraform apply with `GPU_SCALING_MODE=on-demand` added to the backend task definition:

1. Confirm GPU ASG `consultant-agent-gpu-<env>` starts at `DesiredCapacity=0` in EC2 Console.
2. Start an interview in the UI → verify `DesiredCapacity` changes to 1 in the ASG.
3. Start a second interview within 1 hour — verify the instance stays up (timer resets).
4. After 1 hour of no new interviews, verify `DesiredCapacity` returns to 0.
5. **Error path test:** temporarily revoke `autoscaling:UpdateAutoScalingGroup` from the task IAM role → start interview → UI should show "Could not start the AI engine. Please try again." and the "Begin Assessment" button should be visible for retry.
