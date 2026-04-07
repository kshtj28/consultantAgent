import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { useLanguage } from '../../i18n/LanguageContext';

interface KPIBarChartProps {
    data: Array<{ category: string; score: number; benchmark: number }>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#e2e8f0',
        }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} style={{ color: p.color }}>
                    {p.name}: <strong>{p.value}%</strong>
                </div>
            ))}
        </div>
    );
};

export function KPIBarChart({ data }: KPIBarChartProps) {
    const { t } = useLanguage();
    const shortLabel = (s: string) => s.length > 12 ? s.substring(0, 11) + '…' : s;

    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 0 }} barCategoryGap="25%">
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis
                    dataKey="category"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={shortLabel}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                />
                <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(v: number | string) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8', paddingTop: '10px' }} />
                <Bar dataKey="score" name={t('chart.currentScore')} radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                        <Cell
                            key={index}
                            fill={entry.score >= entry.benchmark ? '#10b981' : entry.score >= entry.benchmark * 0.75 ? '#f59e0b' : '#ef4444'}
                        />
                    ))}
                </Bar>
                <Bar dataKey="benchmark" name={t('chart.benchmark')} fill="#334155" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
        </ResponsiveContainer>
    );
}
