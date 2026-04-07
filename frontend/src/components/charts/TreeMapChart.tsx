import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export interface TreeMapNode {
    name: string;
    value: number;      // gap count
    avgImpact: number;  // 0-10 average impact score
    highCount: number;
    mediumCount: number;
    lowCount: number;
}

interface Props {
    data: TreeMapNode[];
    title?: string;
}

interface TooltipState {
    x: number;
    y: number;
    node: TreeMapNode;
}

const colorScale = d3.scaleLinear<string>()
    .domain([0, 5, 10])
    .range(['#10b981', '#f59e0b', '#ef4444']);

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function TreeMapChart({ data, title }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data.length) return;

        const width = containerRef.current.clientWidth || 700;
        const height = 360;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const root = d3.hierarchy<{ name: string; children: TreeMapNode[] }>({
            name: 'root',
            children: data,
        } as any)
            .sum((d: any) => (d.value ?? 0))
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        const treemap = d3.treemap<any>()
            .size([width, height])
            .paddingOuter(4)
            .paddingInner(3)
            .round(true);

        treemap(root);

        const leaves = root.leaves();

        const g = svg.append('g');

        const cell = g.selectAll('g')
            .data(leaves)
            .enter()
            .append('g')
            .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

        cell.append('rect')
            .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
            .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
            .attr('rx', 4)
            .attr('fill', (d: any) => colorScale(d.data.avgImpact ?? 0))
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 1)
            .attr('cursor', 'pointer')
            .on('mouseenter', (event, d: any) => {
                setTooltip({ x: event.clientX, y: event.clientY, node: d.data as TreeMapNode });
            })
            .on('mousemove', (event) => {
                setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on('mouseleave', () => setTooltip(null));

        // Area name label
        cell.append('text')
            .attr('x', 6)
            .attr('y', 18)
            .attr('font-size', '12px')
            .attr('font-weight', '700')
            .attr('fill', 'white')
            .text((d: any) => {
                const w = d.x1 - d.x0;
                if (w < 40) return '';
                return truncate(d.data.name, Math.floor(w / 7));
            })
            .style('pointer-events', 'none');

        // Gap count label (centered, large)
        cell.each(function (d: any) {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            if (w < 50 || h < 40) return;

            const el = d3.select(this);

            el.append('text')
                .attr('x', w / 2)
                .attr('y', h / 2 + 8)
                .attr('text-anchor', 'middle')
                .attr('font-size', '20px')
                .attr('font-weight', '700')
                .attr('fill', 'white')
                .style('pointer-events', 'none')
                .text(d.data.value);

            if (h > 70) {
                el.append('text')
                    .attr('x', w / 2)
                    .attr('y', h / 2 + 26)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '9px')
                    .attr('fill', 'rgba(255,255,255,0.6)')
                    .style('pointer-events', 'none')
                    .text(`High: ${d.data.highCount} | Med: ${d.data.mediumCount} | Low: ${d.data.lowCount}`);
            }
        });

    }, [data]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {title && (
                <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text)' }}>{title}</h4>
            )}
            <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
                {data.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '40px' }}>
                        No treemap data available
                    </p>
                ) : (
                    <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '360px' }} />
                )}
                {tooltip && (
                    <div style={{
                        position: 'fixed',
                        left: tooltip.x + 12,
                        top: tooltip.y - 10,
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#e2e8f0',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        minWidth: '160px',
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{tooltip.node.name}</div>
                        <div>Total Gaps: <strong>{tooltip.node.value}</strong></div>
                        <div>Avg Impact: <strong>{tooltip.node.avgImpact.toFixed(1)}/10</strong></div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
                            High: {tooltip.node.highCount} | Med: {tooltip.node.mediumCount} | Low: {tooltip.node.lowCount}
                        </div>
                    </div>
                )}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Low Impact</span>
                <div style={{
                    width: '160px',
                    height: '10px',
                    borderRadius: '5px',
                    background: 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)',
                }} />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>High Impact</span>
            </div>
        </div>
    );
}
