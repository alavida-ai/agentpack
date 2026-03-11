import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const WIDTH = 760;
const HEIGHT = 520;

function nodeColor(node) {
  if (node.type === 'source') return '#58c4ff';
  if (node.type === 'dependency') return '#2ed089';
  return '#5b8cff';
}

export function SkillGraph({ model, selectedId, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!model || !ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const layout = new Map();
    const sources = model.nodes.filter((node) => node.type === 'source');
    const selected = model.selected;
    const dependencies = model.nodes.filter((node) => node.type === 'dependency');

    sources.forEach((node, index) => {
      layout.set(node.id, { x: 120, y: 120 + index * 280 });
    });
    layout.set(selected.id, { x: WIDTH / 2, y: HEIGHT / 2 });
    dependencies.forEach((node, index) => {
      layout.set(node.id, { x: WIDTH - 140, y: 120 + index * 280 });
    });

    const edgeGroup = svg.append('g');
    for (const edge of model.edges) {
      const source = layout.get(edge.source);
      const target = layout.get(edge.target);
      edgeGroup.append('path')
        .attr('d', `M ${source.x} ${source.y} C ${(source.x + target.x) / 2} ${source.y}, ${(source.x + target.x) / 2} ${target.y}, ${target.x} ${target.y}`)
        .attr('fill', 'none')
        .attr('stroke', edge.kind === 'provenance' ? 'rgba(88,196,255,0.55)' : 'rgba(46,208,137,0.55)')
        .attr('stroke-width', 2.5);
    }

    const nodeGroup = svg.append('g')
      .selectAll('g')
      .data(model.nodes)
      .join('g')
      .attr('transform', (node) => {
        const point = layout.get(node.id);
        return `translate(${point.x}, ${point.y})`;
      })
      .style('cursor', 'pointer')
      .on('click', (_, node) => onSelect(node.id));

    nodeGroup.append('circle')
      .attr('r', (node) => node.id === selectedId ? 44 : 34)
      .attr('fill', '#08131f')
      .attr('stroke', (node) => node.id === selectedId ? '#ffbf47' : nodeColor(node))
      .attr('stroke-width', (node) => node.id === selectedId ? 3 : 2);

    nodeGroup.append('text')
      .text((node) => node.type.toUpperCase())
      .attr('text-anchor', 'middle')
      .attr('y', -56)
      .attr('fill', '#90a4c4')
      .attr('font-size', 11)
      .attr('letter-spacing', '0.08em');

    nodeGroup.append('text')
      .text((node) => node.packageName || node.path.split('/').slice(-1)[0])
      .attr('text-anchor', 'middle')
      .attr('y', 6)
      .attr('fill', '#eef4ff')
      .attr('font-size', 12);
  }, [model, selectedId, onSelect]);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{
        width: '100%',
        minHeight: 520,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(7, 18, 29, 0.92)',
      }}
    />
  );
}
