import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

export interface KGNode {
    id: string;
    label: string;
    type: 'area' | 'gap' | 'recommendation' | 'category';
    impact?: 'high' | 'medium' | 'low';
    description?: string;
}

export interface KGEdge {
    source: string;
    target: string;
    type: 'area-gap' | 'gap-recommendation' | 'category-gap';
}

interface Props {
    nodes: KGNode[];
    edges: KGEdge[];
}

const NODE_COLORS: Record<string, string> = {
    area: '#6366f1',
    'gap.high': '#ef4444',
    'gap.medium': '#f59e0b',
    'gap.low': '#10b981',
    recommendation: '#8b5cf6',
    category: '#64748b',
};

const NODE_RADIUS: Record<string, number> = {
    area: 22,
    gap: 15,
    recommendation: 13,
    category: 18,
};

const LEGEND_ITEMS = [
    { label: 'Process Area', colorKey: 'area' },
    { label: 'Gap (High)', colorKey: 'gap.high' },
    { label: 'Gap (Medium)', colorKey: 'gap.medium' },
    { label: 'Gap (Low)', colorKey: 'gap.low' },
    { label: 'Recommendation', colorKey: 'recommendation' },
    { label: 'Category', colorKey: 'category' },
];

function getNodeColor(node: KGNode): string {
    if (node.type === 'gap' && node.impact) {
        return NODE_COLORS[`gap.${node.impact}`] ?? NODE_COLORS['gap.medium'];
    }
    return NODE_COLORS[node.type] ?? '#94a3b8';
}

function getNodeRadius(node: KGNode): number {
    return NODE_RADIUS[node.type] ?? 15;
}

function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

export function GapKnowledgeGraph({ nodes, edges }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 800;
        const height = 520;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        svg
            .attr('width', '100%')
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`);

        // Arrowhead marker
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'kg-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#475569');

        // Zoom container
        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.25, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Simulation nodes/links copy
        const simNodes = nodes.map(n => ({ ...n, x: width / 2, y: height / 2 })) as (KGNode & d3.SimulationNodeDatum)[];
        const idToIndex = new Map(simNodes.map((n, i) => [n.id, i]));

        const simLinks = edges
            .filter(e => idToIndex.has(e.source) && idToIndex.has(e.target))
            .map(e => ({
                source: idToIndex.get(e.source)!,
                target: idToIndex.get(e.target)!,
                type: e.type,
            }));

        const simulation = d3.forceSimulation(simNodes)
            .force('link', d3.forceLink(simLinks).distance(120).strength(0.8))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide(35));

        // Draw links
        const link = g.append('g')
            .selectAll('line')
            .data(simLinks)
            .enter()
            .append('line')
            .attr('stroke', '#475569')
            .attr('stroke-opacity', 0.5)
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#kg-arrow)');

        // Draw node groups
        const nodeGroup = g.append('g')
            .selectAll('g')
            .data(simNodes)
            .enter()
            .append('g')
            .attr('cursor', 'grab');

        // Tooltip
        const tooltip = d3.select('body')
            .append('div')
            .style('position', 'fixed')
            .style('pointer-events', 'none')
            .style('background', '#1e293b')
            .style('border', '1px solid #334155')
            .style('border-radius', '8px')
            .style('padding', '10px 14px')
            .style('font-size', '12px')
            .style('color', '#e2e8f0')
            .style('max-width', '240px')
            .style('z-index', '9999')
            .style('display', 'none');

        // Circles
        nodeGroup.append('circle')
            .attr('r', d => getNodeRadius(d as KGNode))
            .attr('fill', d => getNodeColor(d as KGNode))
            .attr('fill-opacity', 0.88)
            .attr('stroke', '#1e293b')
            .attr('stroke-width', 2)
            .on('mouseover', (_event, d) => {
                const node = d as KGNode;
                tooltip
                    .style('display', 'block')
                    .html(`
                        <div style="font-weight:600;margin-bottom:4px">${node.label}</div>
                        <div style="color:#94a3b8">Type: ${node.type}</div>
                        ${node.impact ? `<div>Impact: <strong>${node.impact}</strong></div>` : ''}
                        ${node.description ? `<div style="margin-top:6px;color:#cbd5e1">${node.description}</div>` : ''}
                    `);
            })
            .on('mousemove', (event) => {
                tooltip
                    .style('left', `${event.clientX + 14}px`)
                    .style('top', `${event.clientY - 10}px`);
            })
            .on('mouseleave', () => {
                tooltip.style('display', 'none');
            });

        // Labels
        nodeGroup.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', d => getNodeRadius(d as KGNode) + 12)
            .attr('font-size', '10px')
            .attr('fill', '#94a3b8')
            .text(d => truncate((d as KGNode).label, 22));

        // Drag behavior
        const drag = d3.drag<SVGGElement, KGNode & d3.SimulationNodeDatum>()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        nodeGroup.call(drag as any);

        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        // Legend
        const legend = svg.append('g').attr('transform', 'translate(16,16)');
        LEGEND_ITEMS.forEach((item, i) => {
            const row = legend.append('g').attr('transform', `translate(0,${i * 18})`);
            row.append('circle')
                .attr('cx', 6)
                .attr('cy', 6)
                .attr('r', 5)
                .attr('fill', NODE_COLORS[item.colorKey]);
            row.append('text')
                .attr('x', 16)
                .attr('y', 10)
                .attr('font-size', '10px')
                .attr('fill', '#94a3b8')
                .text(item.label);
        });

        return () => {
            simulation.stop();
            tooltip.remove();
        };
    }, [nodes, edges]);

    return (
        <div
            ref={containerRef}
            style={{
                background: 'var(--surface)',
                borderRadius: '10px',
                overflow: 'hidden',
                width: '100%',
            }}
        >
            <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '520px' }} />
        </div>
    );
}
