import { useState, useRef, useEffect, useCallback } from 'react';
import { LLMWarmingUpError } from '../services/api';

const WARMUP_RETRY_INTERVAL_MS = 15_000; // 15 seconds between retries
const WARMUP_MAX_ATTEMPTS = 24; // 24 × 15s = 6 minutes max wait

export interface GpuWarmupState {
    /** Whether the warm-up overlay should be shown */
    active: boolean;
    /** Current retry attempt number (1-based) */
    attempt: number;
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Cancel warm-up and stop retrying */
    cancel: () => void;
}

/**
 * Hook that wraps async operations with automatic warm-up retry logic.
 *
 * When an API call throws LLMWarmingUpError the hook retries every 15 s
 * (up to 6 minutes) and exposes state for the overlay UI.
 *
 * Usage:
 * ```ts
 * const warmup = useGpuWarmup();
 *
 * const doSomething = async () => {
 *   const result = await warmup.run(() => someApiCall());
 *   // result is only returned on success
 * };
 * ```
 */
export function useGpuWarmup() {
    const [active, setActive] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setActive(false);
        setAttempt(0);
    }, []);

    /**
     * Execute an async function with automatic warm-up retry.
     * Resolves with the result on success, or throws on permanent failure.
     */
    const run = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            const attempt_ = (n: number) => {
                fn()
                    .then((result) => {
                        setActive(false);
                        setAttempt(0);
                        resolve(result);
                    })
                    .catch((err) => {
                        if (err instanceof LLMWarmingUpError && n < WARMUP_MAX_ATTEMPTS) {
                            setActive(true);
                            setAttempt(n + 1);
                            timerRef.current = setTimeout(() => attempt_(n + 1), WARMUP_RETRY_INTERVAL_MS);
                        } else {
                            setActive(false);
                            setAttempt(0);
                            if (n >= WARMUP_MAX_ATTEMPTS) {
                                reject(new Error('AI engine did not become ready in time. Please try again later.'));
                            } else {
                                reject(err);
                            }
                        }
                    });
            };
            attempt_(0);
        });
    }, []);

    const state: GpuWarmupState = {
        active,
        attempt,
        maxAttempts: WARMUP_MAX_ATTEMPTS,
        cancel,
    };

    return { ...state, run };
}
