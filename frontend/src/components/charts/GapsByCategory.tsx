import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { useLanguage } from '../../i18n/LanguageContext';

interface GapsByCategoryProps {
    data: Array<{ name: string; count: number; highImpact: number }>;
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
                    {p.name}: <strong>{p.value}</strong>
                </div>
            ))}
        </div>
    );
};

export function GapsByCategory({ data }: GapsByCategoryProps) {
    const { t } = useLanguage();
    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                <Bar dataKey="count" name={t('gap.totalGaps')} fill="#6366f1" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="highImpact" name={t('gap.highSeverity')} fill="#ef4444" radius={[4, 4, 0, 0]} stackId="b" />
            </BarChart>
        </ResponsiveContainer>
    );
}
