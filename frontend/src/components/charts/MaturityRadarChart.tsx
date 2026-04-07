import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Legend,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';

interface MaturityRadarChartProps {
    data: Array<{ area: string; current: number; target: number; fullMark: number }>;
}

export function MaturityRadarChart({ data }: MaturityRadarChartProps) {
    const shortLabel = (label: string) =>
        label.length > 14 ? label.substring(0, 13) + '…' : label;

    return (
        <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis
                    dataKey="area"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={shortLabel}
                />
                <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickCount={5}
                />
                <Radar
                    name="Current"
                    dataKey="current"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.35}
                    strokeWidth={2}
                />
                <Radar
                    name="Target"
                    dataKey="target"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                    formatter={(value: any, name: any) => [`${value}%`, name]}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
}
