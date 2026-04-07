import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export interface SankeyNode {
    id: string;
    name: string;
    column: 0 | 1 | 2; // 0=current state, 1=gaps, 2=target state
    value: number;
}

export interface SankeyLink {
    source: string;
    target: string;
    value: number;
    color?: string;
}

interface Props {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

const COLUMN_COLORS = ['#6366f1', '#ef4444', '#10b981'];
const COLUMN_HEADERS = ['Current State', 'Gaps', 'Target State'];
const NODE_WIDTH = 140;
const SVG_HEIGHT = 400;
const HEADER_HEIGHT = 32;
const NODE_MIN_H = 28;
const NODE_MAX_H = 80;
const V_PADDING = 8;

interface LayoutNode extends SankeyNode {
    x: number;
    y: number;
    height: number;
}

function buildLayout(nodes: SankeyNode[], width: number): LayoutNode[] {
    const colXPct = [0.05, 0.42, 0.79];
    const colNodes: SankeyNode[][] = [[], [], []];
    nodes.forEach(n => {
        if (n.column >= 0 && n.column <= 2) colNodes[n.column].push(n);
    });

    const usableHeight = SVG_HEIGHT - HEADER_HEIGHT - 20;

    const layoutNodes: LayoutNode[] = [];

    for (let col = 0; col <= 2; col++) {
        const colN = colNodes[col];
        if (colN.length === 0) continue;

        const totalValue = colN.reduce((s, n) => s + Math.max(n.value, 1), 0);
        const totalPad = V_PADDING * (colN.length - 1);
        const availH = usableHeight - totalPad;

        let cumY = HEADER_HEIGHT + 10;
        const colX = colXPct[col] * width;

        colN.forEach(n => {
            const rawH = (Math.max(n.value, 1) / totalValue) * availH;
            const h = Math.min(NODE_MAX_H, Math.max(NODE_MIN_H, rawH));
            layoutNodes.push({ ...n, x: colX, y: cumY, height: h });
            cumY += h + V_PADDING;
        });
    }

    return layoutNodes;
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function SankeyChart({ nodes, links }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltipData, setTooltipData] = useState<{ x: number; y: number; text: string } | null>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 800;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', SVG_HEIGHT).attr('viewBox', `0 0 ${width} ${SVG_HEIGHT}`);

        const layout = buildLayout(nodes, width);
        const nodeMap = new Map<string, LayoutNode>(layout.map(n => [n.id, n]));

        // Defs for gradients
        const defs = svg.append('defs');

        // Draw links first (behind nodes)
        const linksG = svg.append('g');

        links.forEach((link, i) => {
            const src = nodeMap.get(link.source);
            const tgt = nodeMap.get(link.target);
            if (!src || !tgt) return;

            const srcCol = src.column;
            const srcColor = link.color ?? COLUMN_COLORS[srcCol];

            const gradId = `sankey-grad-${i}`;
            const grad = defs.append('linearGradient')
                .attr('id', gradId)
                .attr('gradientUnits', 'userSpaceOnUse')
                .attr('x1', src.x + NODE_WIDTH)
                .attr('y1', src.y + src.height / 2)
                .attr('x2', tgt.x)
                .attr('y2', tgt.y + tgt.height / 2);
            grad.append('stop').attr('offset', '0%').attr('stop-color', srcColor).attr('stop-opacity', 0.4);
            grad.append('stop').attr('offset', '100%').attr('stop-color', COLUMN_COLORS[tgt.column]).attr('stop-opacity', 0.1);

            const x1 = src.x + NODE_WIDTH;
            const y1 = src.y + src.height / 2;
            const x2 = tgt.x;
            const y2 = tgt.y + tgt.height / 2;
            const cx = (x1 + x2) / 2;

            const path = `M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`;

            linksG.append('path')
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', `url(#${gradId})`)
                .attr('stroke-width', Math.max(4, Math.min(30, link.value * 2)))
                .attr('stroke-opacity', 0.55)
                .attr('cursor', 'pointer')
                .on('mouseenter', (event) => {
                    const srcNode = nodes.find(n => n.id === link.source);
                    const tgtNode = nodes.find(n => n.id === link.target);
                    setTooltipData({
                        x: event.clientX,
                        y: event.clientY,
                        text: `${srcNode?.name ?? link.source} → ${tgtNode?.name ?? link.target}\nValue: ${link.value}`,
                    });
                })
                .on('mouseleave', () => setTooltipData(null));
        });

        // Draw nodes
        const nodesG = svg.append('g');

        layout.forEach(n => {
            const col = n.column;
            const color = COLUMN_COLORS[col];

            const g = nodesG.append('g');

            g.append('rect')
                .attr('x', n.x)
                .attr('y', n.y)
                .attr('width', NODE_WIDTH)
                .attr('height', n.height)
                .attr('rx', 5)
                .attr('fill', color)
                .attr('fill-opacity', 0.8)
                .attr('stroke', '#0f172a')
                .attr('stroke-width', 1);

            // Node label centered
            g.append('text')
                .attr('x', n.x + NODE_WIDTH / 2)
                .attr('y', n.y + n.height / 2 + 4)
                .attr('text-anchor', 'middle')
                .attr('font-size', '11px')
                .attr('fill', 'white')
                .attr('font-weight', '500')
                .text(truncate(n.name, 18));

            // Value label
            const labelX = col === 2 ? n.x - 6 : n.x + NODE_WIDTH + 6;
            const anchor = col === 2 ? 'end' : 'start';
            g.append('text')
                .attr('x', labelX)
                .attr('y', n.y + n.height / 2 + 4)
                .attr('text-anchor', anchor)
                .attr('font-size', '10px')
                .attr('fill', '#94a3b8')
                .text(n.value);
        });

        // Column headers
        const colXPct = [0.05, 0.42, 0.79];
        COLUMN_HEADERS.forEach((header, i) => {
            svg.append('text')
                .attr('x', colXPct[i] * width + NODE_WIDTH / 2)
                .attr('y', 20)
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .attr('font-weight', '700')
                .attr('fill', COLUMN_COLORS[i])
                .text(header);
        });

    }, [nodes, links]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <svg ref={svgRef} style={{ display: 'block', width: '100%', height: `${SVG_HEIGHT}px` }} />
            {tooltipData && (
                <div style={{
                    position: 'fixed',
                    left: tooltipData.x + 12,
                    top: tooltipData.y - 10,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    whiteSpace: 'pre-line',
                }}>
                    {tooltipData.text}
                </div>
            )}
        </div>
    );
}
