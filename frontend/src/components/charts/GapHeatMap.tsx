import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

export interface HeatMapCell {
    area: string;
    category: string;
    severity: number; // 0-10
    count: number;
}

interface Props {
    data: HeatMapCell[];
}

export function GapHeatMap({ data }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data.length) return;

        const margin = { top: 50, right: 30, bottom: 100, left: 180 };
        const rowHeight = 48;

        const areas = Array.from(new Set(data.map(d => d.area)));
        const categories = Array.from(new Set(data.map(d => d.category)));

        const containerWidth = containerRef.current.clientWidth || 700;
        const innerWidth = containerWidth - margin.left - margin.right;
        const innerHeight = areas.length * rowHeight;
        const totalHeight = innerHeight + margin.top + margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg
            .attr('width', containerWidth)
            .attr('height', totalHeight);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const xScale = d3.scaleBand()
            .domain(categories)
            .range([0, innerWidth])
            .padding(0.08);

        const yScale = d3.scaleBand()
            .domain(areas)
            .range([0, innerHeight])
            .padding(0.08);

        const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, 10]);

        // Title
        svg.append('text')
            .attr('x', containerWidth / 2)
            .attr('y', 22)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', '600')
            .attr('fill', '#e2e8f0')
            .text('Gap Severity by Area & Category');

        // Cells
        const cells = g.selectAll('g.cell')
            .data(data)
            .enter()
            .append('g')
            .attr('class', 'cell');

        cells.append('rect')
            .attr('x', d => xScale(d.category) ?? 0)
            .attr('y', d => yScale(d.area) ?? 0)
            .attr('width', xScale.bandwidth())
            .attr('height', yScale.bandwidth())
            .attr('rx', 4)
            .attr('fill', d => d.severity === 0 ? '#1e293b' : colorScale(d.severity))
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 1);

        // Count text
        cells.append('text')
            .attr('x', d => (xScale(d.category) ?? 0) + xScale.bandwidth() / 2)
            .attr('y', d => (yScale(d.area) ?? 0) + yScale.bandwidth() / 2 + 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', '600')
            .attr('fill', d => d.severity > 6 ? 'white' : '#94a3b8')
            .attr('visibility', d => d.count === 0 ? 'hidden' : 'visible')
            .text(d => d.count);

        // X-axis (bottom)
        const xAxis = d3.axisBottom(xScale);
        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis)
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '11px')
            .attr('transform', 'rotate(-35)')
            .style('text-anchor', 'end')
            .attr('dx', '-0.5em')
            .attr('dy', '0.15em');

        g.select('.domain').attr('stroke', '#334155');
        g.selectAll('.tick line').attr('stroke', '#334155');

        // Y-axis (left)
        const yAxis = d3.axisLeft(yScale);
        g.append('g')
            .call(yAxis)
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '11px');

        g.selectAll('.domain').attr('stroke', '#334155');

        // Color legend
        const legendWidth = 140;
        const legendHeight = 10;
        const legendX = innerWidth - legendWidth;
        const legendY = -38;

        const legendGroup = g.append('g').attr('transform', `translate(${legendX},${legendY})`);

        const defs = svg.append('defs');
        const linearGrad = defs.append('linearGradient').attr('id', 'heatmap-legend-gradient');
        linearGrad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(0));
        linearGrad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(10));

        legendGroup.append('rect')
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .attr('rx', 3)
            .attr('fill', 'url(#heatmap-legend-gradient)');

        const legendScale = d3.scaleLinear().domain([0, 10]).range([0, legendWidth]);
        const legendAxis = d3.axisBottom(legendScale).ticks(5).tickSize(3);

        legendGroup.append('g')
            .attr('transform', `translate(0,${legendHeight})`)
            .call(legendAxis)
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '9px');

        legendGroup.select('.domain').attr('stroke', '#334155');

        legendGroup.append('text')
            .attr('x', 0)
            .attr('y', -4)
            .attr('font-size', '9px')
            .attr('fill', '#94a3b8')
            .text('Severity');

    }, [data]);

    return (
        <div ref={containerRef} style={{ width: '100%', overflowX: 'auto' }}>
            {data.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '40px' }}>
                    No heatmap data available
                </p>
            ) : (
                <svg ref={svgRef} style={{ display: 'block' }} />
            )}
        </div>
    );
}
