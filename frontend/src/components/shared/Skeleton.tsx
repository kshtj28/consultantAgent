import './Skeleton.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '16px', borderRadius = '4px', className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={{ width, height, borderRadius }} />;
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stat-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-stat-card">
          <Skeleton width="60%" height="12px" />
          <Skeleton width="40%" height="28px" />
          <Skeleton width="80%" height="10px" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={c === 0 ? '30%' : '20%'} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = '250px' }: { height?: string }) {
  return <Skeleton width="100%" height={height} borderRadius="8px" />;
}
