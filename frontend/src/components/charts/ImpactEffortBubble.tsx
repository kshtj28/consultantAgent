import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from 'recharts';

interface BubblePoint {
    name: string;
    impact: number;
    effort: number;
    priority: number;
    category: string;
}

interface ImpactEffortBubbleProps {
    data: BubblePoint[];
}

const CATEGORY_COLORS: Record<string, string> = {
    Process: '#6366f1',
    Technology: '#f59e0b',
    Capability: '#10b981',
    Data: '#ef4444',
};

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as BubblePoint;
    return (
        <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#e2e8f0',
            maxWidth: '220px',
        }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{d.name}</div>
            <div style={{ color: '#94a3b8' }}>Category: {d.category}</div>
            <div>Impact: <strong>{d.impact}/10</strong></div>
            <div>Effort: <strong>{d.effort}/10</strong></div>
        </div>
    );
};

export function ImpactEffortBubble({ data }: ImpactEffortBubbleProps) {
    return (
        <div style={{ position: 'relative' }}>
            {/* Quadrant labels */}
            <div style={{ position: 'absolute', top: 10, right: 60, fontSize: '10px', color: '#10b981', fontWeight: 600 }}>
                QUICK WINS
            </div>
            <div style={{ position: 'absolute', top: 10, left: 60, fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                MAJOR PROJECTS
            </div>
            <div style={{ position: 'absolute', bottom: 30, right: 60, fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                FILL-INS
            </div>
            <div style={{ position: 'absolute', bottom: 30, left: 60, fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                TIME SINKS
            </div>
            <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid stroke="#1e293b" />
                    <XAxis
                        type="number"
                        dataKey="effort"
                        domain={[0, 10]}
                        name="Effort"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        label={{ value: 'Effort →', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
                    />
                    <YAxis
                        type="number"
                        dataKey="impact"
                        domain={[0, 10]}
                        name="Impact"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        label={{ value: '↑ Impact', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                    />
                    <ReferenceLine x={5} stroke="#334155" strokeDasharray="4 2" />
                    <ReferenceLine y={5} stroke="#334155" strokeDasharray="4 2" />
                    <Tooltip content={<CustomTooltip />} />
                    <Scatter data={data}>
                        {data.map((entry, index) => (
                            <Cell
                                key={index}
                                fill={CATEGORY_COLORS[entry.category] || '#6366f1'}
                                fillOpacity={0.8}
                            />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                        {cat}
                    </div>
                ))}
            </div>
        </div>
    );
}
