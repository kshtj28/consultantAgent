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

function getRegion(): string {
    const region = process.env.AWS_REGION;
    if (!region) {
        throw new Error(
            '[gpuScalingService] AWS_REGION env var is not set. Cannot call AWS APIs.'
        );
    }
    return region;
}

function buildAsgClient(): AutoScalingClient {
    return new AutoScalingClient({ region: getRegion() });
}

function buildEcsClient(): ECSClient {
    return new ECSClient({ region: getRegion() });
}

/**
 * Returns true when the backend is configured for on-demand GPU scaling.
 * Guards all public entry points so callers do not need to check the env
 * var themselves.
 */
export function isGpuScalingEnabled(): boolean {
    return process.env.GPU_SCALING_MODE === 'on-demand';
}

/**
 * Restore the Ollama ECS service to desired_count=1 and ensure the GPU ASG
 * minimum allows an instance. Throws on any AWS error.
 *
 * Scale-up sequence:
 *   1. ASG UpdateAutoScalingGroup(MinSize=1, DesiredCapacity=1) — guarantees
 *      the ASG cannot be pushed back to 0 by ECS managed scaling before the
 *      pending task is visible.
 *   2. ECS UpdateService(desiredCount=1) — schedules a pending task, which ECS
 *      managed scaling sees and provisions a GPU instance for automatically.
 *
 * We set MinSize=1 to prevent a race where ECS managed scaling resets
 * DesiredCapacity back to 0 before the pending task propagates.
 */
export async function triggerGpuWarmup(): Promise<void> {
    const asgName = getAsgName();
    const clusterName = getEcsClusterName();
    const serviceName = getOllamaServiceName();

    console.info(
        '[gpuScalingService] Triggering GPU warmup — ASG=%s, Cluster=%s, Service=%s, Region=%s',
        asgName,
        clusterName,
        serviceName,
        process.env.AWS_REGION
    );

    // Step 1: set ASG MinSize=1 and DesiredCapacity=1 FIRST.
    // This prevents ECS managed scaling from pushing desired back to 0 before
    // it sees the pending ECS task.
    const asgClient = buildAsgClient();
    try {
        await asgClient.send(
            new UpdateAutoScalingGroupCommand({
                AutoScalingGroupName: asgName,
                MinSize: 1,
                DesiredCapacity: 1,
            })
        );
        console.info('[gpuScalingService] ASG %s set to MinSize=1, DesiredCapacity=1', asgName);
    } catch (err) {
        console.error('[gpuScalingService] Failed to scale up ASG %s:', asgName, err);
        throw err;
    }

    // Step 2: restore Ollama ECS service — creates a pending task so ECS managed
    // scaling provisions the GPU instance.
    const ecsClient = buildEcsClient();
    try {
        await ecsClient.send(
            new UpdateServiceCommand({
                cluster: clusterName,
                service: serviceName,
                desiredCount: 1,
            })
        );
        console.info(
            '[gpuScalingService] ECS service %s/%s set to desiredCount=1',
            clusterName,
            serviceName
        );
    } catch (err) {
        console.error(
            '[gpuScalingService] Failed to update ECS service %s/%s:',
            clusterName,
            serviceName,
            err
        );
        throw err;
    }
}

/**
 * Schedule (or reset) a 1-hour timer that scales the GPU tier down.
 * Safe to call on every interview start — resets the countdown each time so
 * back-to-back sessions don't terminate the instance mid-use.
 *
 * Scale-down sequence:
 *   1. ECS UpdateService(desiredCount=0) — releases managed instance protection
 *   2. ASG UpdateAutoScalingGroup(MinSize=0, DesiredCapacity=0) — terminates
 *      instance once protection clears
 *
 * Note: ECS task draining is async (10–60 s). The instance terminates within a
 * few minutes of this call, not immediately.
 */
export function scheduleScaleDown(): void {
    if (scaleDownTimer) {
        clearTimeout(scaleDownTimer);
    }

    console.info('[gpuScalingService] Scale-down timer (re)set — will fire in 1 hour.');

    scaleDownTimer = setTimeout(async () => {
        scaleDownTimer = null;
        const asgName = getAsgName();
        const clusterName = getEcsClusterName();
        const serviceName = getOllamaServiceName();

        console.info(
            '[gpuScalingService] Scale-down timer fired — draining ASG=%s, Cluster=%s, Service=%s',
            asgName,
            clusterName,
            serviceName
        );

        // Step 1: drain Ollama ECS service to release managed instance protection
        try {
            const ecsClient = buildEcsClient();
            await ecsClient.send(
                new UpdateServiceCommand({
                    cluster: clusterName,
                    service: serviceName,
                    desiredCount: 0,
                })
            );
            console.info(
                '[gpuScalingService] ECS service %s/%s set to desiredCount=0',
                clusterName,
                serviceName
            );
        } catch (err) {
            console.error('[gpuScalingService] Failed to scale down Ollama ECS service:', err);
        }

        // Step 2: set ASG MinSize=0 and DesiredCapacity=0 — terminates once
        // protection is released
        try {
            const asgClient = buildAsgClient();
            await asgClient.send(
                new UpdateAutoScalingGroupCommand({
                    AutoScalingGroupName: asgName,
                    MinSize: 0,
                    DesiredCapacity: 0,
                })
            );
            console.info('[gpuScalingService] GPU ASG %s scaled to 0 after 1-hour idle.', asgName);
        } catch (err) {
            console.error('[gpuScalingService] Failed to scale down GPU ASG:', err);
        }
    }, ONE_HOUR_MS);
}
