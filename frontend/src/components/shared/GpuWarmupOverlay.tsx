import { Cpu, Loader } from 'lucide-react';
import type { GpuWarmupState } from '../../hooks/useGpuWarmup';
import './GpuWarmupOverlay.css';

interface Props {
    warmup: GpuWarmupState;
    onCancel?: () => void;
}

export default function GpuWarmupOverlay({ warmup, onCancel }: Props) {
    if (!warmup.active) return null;

    const progressPct = Math.min((warmup.attempt / warmup.maxAttempts) * 100, 95);

    return (
        <div className="gpu-warmup-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="gpu-warmup-popup">
                <Cpu size={32} className="gpu-warmup-popup__icon" />
                <p className="gpu-warmup-popup__title">AI engine is warming up…</p>
                <p className="gpu-warmup-popup__subtitle">
                    The GPU instance is starting. This typically takes 2–5 minutes.
                </p>
                <div className="gpu-warmup-popup__progress">
                    <div
                        className="gpu-warmup-popup__progress-fill"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <p className="gpu-warmup-popup__attempts">
                    <Loader size={12} className="gpu-warmup-spin" />{' '}
                    Checking… attempt {warmup.attempt} of {warmup.maxAttempts}
                </p>
                <button
                    className="gpu-warmup-popup__cancel"
                    onClick={() => {
                        warmup.cancel();
                        onCancel?.();
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
