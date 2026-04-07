import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

export interface GaugeData {
    area: string;
    current: number; // 0-100
    target: number;  // 0-100
    max: number;     // 100
}

interface Props {
    data: GaugeData[];
}

const GAUGE_W = 160;
const GAUGE_H = 120;
const CX = GAUGE_W / 2;
const CY = 88;
const OUTER_R = 58;
const INNER_R = OUTER_R - 16;

function arcColor(value: number): string {
    if (value < 33) return '#ef4444';
    if (value < 66) return '#f59e0b';
    return '#10b981';
}

function GaugeSingle({ item }: { item: GaugeData }) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', GAUGE_W).attr('height', GAUGE_H);

        // Background arc: -π to 0 (left to right, semicircle)
        const bgArc = d3.arc()
            .innerRadius(INNER_R)
            .outerRadius(OUTER_R)
            .startAngle(-Math.PI)
            .endAngle(0)
            .cornerRadius(0);

        svg.append('path')
            .attr('d', bgArc as any)
            .attr('transform', `translate(${CX},${CY})`)
            .attr('fill', 'none')
            .attr('stroke', '#1e293b')
            .attr('stroke-width', 16);

        // Value arc: animated from 0 to current
        const maxAngle = 0; // 0 rad = right side
        const startAngle = -Math.PI;
        const targetAngle = startAngle + (Math.PI * (item.current / item.max));

        const valueArc = d3.arc()
            .innerRadius(INNER_R)
            .outerRadius(OUTER_R)
            .startAngle(startAngle)
            .cornerRadius(4);

        const valuePath = svg.append('path')
            .attr('transform', `translate(${CX},${CY})`)
            .attr('fill', 'none')
            .attr('stroke', arcColor(item.current))
            .attr('stroke-width', 16)
            .attr('stroke-linecap', 'round');

        // Animate
        const interpolate = d3.interpolate(startAngle, targetAngle);
        valuePath.transition()
            .duration(800)
            .ease(d3.easeQuadOut)
            .attrTween('d', () => (t: number) => {
                const angle = interpolate(t);
                return (valueArc as any).endAngle(angle)() ?? '';
            });

        // Target indicator tick
        const targetAngleVal = startAngle + (Math.PI * (item.target / item.max));
        const tickR1 = INNER_R - 4;
        const tickR2 = OUTER_R + 4;
        const tx1 = CX + tickR1 * Math.cos(targetAngleVal - Math.PI / 2);
        const ty1 = CY + tickR1 * Math.sin(targetAngleVal - Math.PI / 2);
        const tx2 = CX + tickR2 * Math.cos(targetAngleVal - Math.PI / 2);
        const ty2 = CY + tickR2 * Math.sin(targetAngleVal - Math.PI / 2);

        svg.append('line')
            .attr('x1', tx1)
            .attr('y1', ty1)
            .attr('x2', tx2)
            .attr('y2', ty2)
            .attr('stroke', '#6366f1')
            .attr('stroke-width', 3)
            .attr('stroke-linecap', 'round');

        // Center value text
        svg.append('text')
            .attr('x', CX)
            .attr('y', CY - 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '22px')
            .attr('font-weight', '700')
            .attr('fill', arcColor(item.current))
            .text(item.current);

        // Target sub-text
        svg.append('text')
            .attr('x', CX)
            .attr('y', CY + 16)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('fill', '#64748b')
            .text(`/ ${item.target}`);

        // Target legend dot
        svg.append('circle')
            .attr('cx', CX - 24)
            .attr('cy', CY + 32)
            .attr('r', 3)
            .attr('fill', '#6366f1');
        svg.append('text')
            .attr('x', CX - 18)
            .attr('y', CY + 36)
            .attr('font-size', '9px')
            .attr('fill', '#64748b')
            .text('target');

        void maxAngle;
    }, [item]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <svg ref={svgRef} style={{ display: 'block' }} />
            <div style={{
                fontSize: '11px',
                color: '#94a3b8',
                textAlign: 'center',
                maxWidth: `${GAUGE_W}px`,
                lineHeight: '1.3',
                padding: '0 4px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
            } as React.CSSProperties}>
                {item.area}
            </div>
        </div>
    );
}

export function GaugeChart({ data }: Props) {
    if (!data.length) {
        return (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '40px' }}>
                No gauge data available
            </p>
        );
    }

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: '16px',
        }}>
            {data.map((item, i) => (
                <GaugeSingle key={i} item={item} />
            ))}
        </div>
    );
}
