
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { BarRun, SpliceZone, SplicePlanItem } from '../types';

interface RunVisualizerProps {
  run: BarRun | { 
    id: string; 
    totalLengthMm: number; 
    allowedZones: SpliceZone[]; 
    barMark: string; 
    dia?: number 
  };
  splicePlan?: SplicePlanItem;
  width?: number;
  height?: number;
  title?: string;
  isDarkMode?: boolean; 
}

const RunVisualizer: React.FC<RunVisualizerProps> = ({ run, splicePlan, width: propWidth, height = 140, title }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = React.useState(propWidth || 800);

  useEffect(() => {
    const handleResize = () => {
        if (containerRef.current) {
            setWidth(containerRef.current.clientWidth - 20);
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    
    const isDark = document.documentElement.classList.contains('dark');
    const mainStrokeColor = isDark ? '#94a3b8' : '#4b5563'; 
    const textColor = isDark ? '#e2e8f0' : '#374151'; 
    const zoneColor = isDark ? '#059669' : '#86efac'; 
    const zoneOpacity = isDark ? 0.3 : 0.5;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 30, right: 30, bottom: 50, left: 30 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale
    const xScale = d3.scaleLinear()
      .domain([0, run.totalLengthMm])
      .range([0, innerWidth]);

    // Draw main bar line (Background Reference)
    // If a plan exists, we make this a subtle centerline to avoid confusion (the "3rd bar" issue)
    if (splicePlan) {
        g.append('line')
        .attr('x1', 0)
        .attr('y1', innerHeight / 2)
        .attr('x2', innerWidth)
        .attr('y2', innerHeight / 2)
        .attr('stroke', mainStrokeColor)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.5);
    } else {
        // If no plan, show solid bar
        g.append('line')
        .attr('x1', 0)
        .attr('y1', innerHeight / 2)
        .attr('x2', innerWidth)
        .attr('y2', innerHeight / 2)
        .attr('stroke', mainStrokeColor)
        .attr('stroke-width', 4);
    }

    // Draw Allowed Zones
    run.allowedZones.forEach((zone) => {
      g.append('rect')
        .attr('x', xScale(zone.startMm))
        .attr('y', innerHeight / 2 - 15)
        .attr('width', Math.max(1, xScale(zone.endMm) - xScale(zone.startMm)))
        .attr('height', 30)
        .attr('fill', zoneColor) 
        .attr('opacity', zoneOpacity)
        .attr('rx', 4);
    });

    // Draw Splices if available
    if (splicePlan) {
        splicePlan.pieces.forEach((piece, idx) => {
            const pieceStart = piece.startMm;
            const pieceEnd = piece.endMm;
            
            const yOffset = (idx % 2 === 0) ? -8 : 8;
            const color = idx % 2 === 0 ? '#3b82f6' : '#ec4899'; 
            
            // The Bar Segment
            g.append('line')
                .attr('x1', xScale(pieceStart))
                .attr('y1', innerHeight / 2 + yOffset)
                .attr('x2', xScale(pieceEnd))
                .attr('y2', innerHeight / 2 + yOffset)
                .attr('stroke', color) 
                .attr('stroke-width', 4);
            
            // End Circle
            g.append('circle')
                .attr('cx', xScale(pieceEnd))
                .attr('cy', innerHeight / 2 + yOffset)
                .attr('r', 3)
                .attr('fill', color);
                
            if (pieceEnd - pieceStart > 1000) { 
                 g.append('text')
                    .attr('x', xScale((pieceStart + pieceEnd) / 2))
                    .attr('y', innerHeight / 2 + yOffset - (yOffset > 0 ? -12 : 5))
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '10px')
                    .attr('fill', textColor)
                    .text(`${piece.lengthMm}`);
            }
        });
        
        // Mark splices overlaps explicitly with start/end labels
        for (let i = 0; i < splicePlan.pieces.length - 1; i++) {
            const p1 = splicePlan.pieces[i];
            const p2 = splicePlan.pieces[i+1];
            if (p1.endMm > p2.startMm) {
                const overlapStart = p2.startMm;
                const overlapEnd = p1.endMm;
                const markerY = innerHeight / 2;
                const labelY = markerY + 35; // Position below axis
                
                // Overlap Box
                g.append('rect')
                    .attr('x', xScale(overlapStart))
                    .attr('y', markerY - 8)
                    .attr('width', xScale(overlapEnd) - xScale(overlapStart))
                    .attr('height', 16)
                    .attr('fill', 'none')
                    .attr('stroke', '#ef4444')
                    .attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '2,2');
                
                // Start Tick
                g.append('line')
                    .attr('x1', xScale(overlapStart))
                    .attr('y1', markerY + 10)
                    .attr('x2', xScale(overlapStart))
                    .attr('y2', markerY + 20)
                    .attr('stroke', '#ef4444')
                    .attr('stroke-width', 1);

                // End Tick
                g.append('line')
                    .attr('x1', xScale(overlapEnd))
                    .attr('y1', markerY + 10)
                    .attr('x2', xScale(overlapEnd))
                    .attr('y2', markerY + 20)
                    .attr('stroke', '#ef4444')
                    .attr('stroke-width', 1);

                // Start Label
                g.append('text')
                    .attr('x', xScale(overlapStart))
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle') // Align center to tick
                    .attr('font-size', '9px')
                    .attr('fill', '#ef4444')
                    .text(overlapStart);

                // End Label
                g.append('text')
                    .attr('x', xScale(overlapEnd))
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '9px')
                    .attr('fill', '#ef4444')
                    .text(overlapEnd);
            }
        }
    }

    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.max(3, Math.floor(width / 100))) 
      .tickFormat(d => `${d}mm`);
    
    const axisG = g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis);
      
    axisG.selectAll('text').attr('fill', textColor);
    axisG.selectAll('line').attr('stroke', mainStrokeColor);
    axisG.selectAll('path').attr('stroke', mainStrokeColor);

    const displayTitle = title || `${run.barMark} ${(run.dia ? `(Dia ${run.dia})` : '')} - ${run.totalLengthMm}mm`;
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('font-weight', 'bold')
      .attr('fill', textColor)
      .text(displayTitle);

  }, [run, splicePlan, width, height, title]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 shadow-sm p-2 transition-colors duration-200">
      <svg ref={svgRef} width={width} height={height} className="mx-auto" />
    </div>
  );
};

export default RunVisualizer;
