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

    afterEach(async () => {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
        vi.clearAllMocks();
        delete process.env.ENVIRONMENT;
        delete process.env.AWS_REGION;
    });

    describe('triggerGpuWarmup', () => {
        it('calls UpdateAutoScalingGroup with MinSize=1 and DesiredCapacity=1 for correct ASG', async () => {
            await triggerGpuWarmup();

            expect(UpdateAutoScalingGroupCommand).toHaveBeenCalledWith({
                AutoScalingGroupName: 'consultant-agent-gpu-test',
                MinSize: 1,
                DesiredCapacity: 1,
            });
            expect(mockAsgSend).toHaveBeenCalledTimes(1);
        });

        it('calls UpdateService with desiredCount=1 for ECS Ollama service', async () => {
            await triggerGpuWarmup();

            expect(UpdateServiceCommand).toHaveBeenCalledWith({
                cluster: 'consultant-agent-test',
                service: 'consultant-agent-ollama-test',
                desiredCount: 1,
            });
            expect(mockEcsSend).toHaveBeenCalledTimes(1);
        });

        it('throws when ASG call fails', async () => {
            mockAsgSend.mockRejectedValueOnce(new Error('AccessDenied'));

            await expect(triggerGpuWarmup()).rejects.toThrow('AccessDenied');
        });
    });

    describe('scheduleScaleDown', () => {
        it('sets ECS desiredCount=0 and ASG MinSize=0, DesiredCapacity=0 after 1 hour', async () => {
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
                MinSize: 0,
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
            expect(mockAsgSend).toHaveBeenCalledTimes(1);
        });
    });
});
