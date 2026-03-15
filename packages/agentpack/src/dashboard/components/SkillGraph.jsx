import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

const STATUS_COLORS = {
  current: '#8fa67e',
  stale: '#d4a45e',
  affected: '#c4956e',
  changed: '#d4a45e',
  unknown: '#9a9488',
};

const SOURCE_COLOR = '#7a9abb';
const SOURCE_CHANGED_COLOR = '#c45454'; // red — urgent indicator

const GLOW_COLORS = {
  current: { color: '#8fa67e', opacity: 0.6 },
  stale: { color: '#d4a45e', opacity: 0.6 },
  affected: { color: '#c4956e', opacity: 0.5 },
  changed: { color: '#c45454', opacity: 0.7 },
  unknown: { color: '#9a9488', opacity: 0.4 },
  source: { color: '#7a9abb', opacity: 0.5 },
  sourceChanged: { color: '#c45454', opacity: 0.7 },
};

function nodeRadius(node) {
  if (node.type === 'skill') return 14;
  return 9;
}

function nodeColor(node) {
  if (node.type === 'source') return SOURCE_COLOR;
  return STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
}

function isFilled(node) {
  if (node.type === 'source') return true;
  return node.status === 'current' || node.status === 'unknown';
}

function diamondPath(size) {
  return `M0,${-size} L${size},0 L0,${size} L${-size},0 Z`;
}

function buildTreeHierarchy(model) {
  if (!model || !model.selected) return null;

  const sourceNodes = model.nodes.filter((n) => n.type === 'source');
  const edgesBySource = new Map();

  for (const edge of model.edges) {
    if (edge.kind !== 'requires') continue;
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source).push(edge.target);
  }

  const treeChildren = new Map();
  const visited = new Set();
  const crossLinks = [];
  const queue = [model.selected.id];
  visited.add(model.selected.id);

  while (queue.length > 0) {
    const parentId = queue.shift();
    const childIds = edgesBySource.get(parentId) || [];

    for (const childId of childIds) {
      if (visited.has(childId)) {
        crossLinks.push({ source: parentId, target: childId });
        continue;
      }
      visited.add(childId);
      if (!treeChildren.has(parentId)) treeChildren.set(parentId, []);
      treeChildren.get(parentId).push(childId);
      queue.push(childId);
    }
  }

  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]));

  function buildHierarchy(id) {
    const node = nodeMap.get(id);
    const children = (treeChildren.get(id) || []).map(buildHierarchy);
    return { data: node, children: children.length > 0 ? children : undefined };
  }

  const rootHierarchy = buildHierarchy(model.selected.id);

  return { rootHierarchy, sourceNodes, crossLinks, nodeMap };
}

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    current: s.getPropertyValue('--status-current').trim(),
    stale: s.getPropertyValue('--status-stale').trim(),
    affected: s.getPropertyValue('--status-affected').trim(),
    unknown: s.getPropertyValue('--status-unknown').trim(),
    provenance: s.getPropertyValue('--edge-provenance').trim(),
    requires: s.getPropertyValue('--edge-requires').trim(),
    text: s.getPropertyValue('--text').trim(),
    textDim: s.getPropertyValue('--text-dim').trim(),
  };
}

export function SkillGraph({
  model,
  selectedId,
  onSelect,
  onHover,
  onHoverEnd,
  labelsVisible,
  knowledgeVisible,
  resetZoomSignal,
}) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(500).call(
      zoomRef.current.transform,
      zoomRef.current.__initialTransform || d3.zoomIdentity
    );
  }, []);

  useEffect(() => {
    if (resetZoomSignal > 0) resetZoom();
  }, [resetZoomSignal, resetZoom]);

  useEffect(() => {
    if (!model || !svgRef.current) return;

    const result = buildTreeHierarchy(model);
    if (!result) return;

    const { rootHierarchy, sourceNodes, crossLinks } = result;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const theme = getThemeColors();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // ─── DEFS (glow filters) ───
    const defs = svg.append('defs');
    for (const [status, glowConfig] of Object.entries(GLOW_COLORS)) {
      const filter = defs.append('filter')
        .attr('id', `glow-${status}`)
        .attr('x', '-50%').attr('y', '-50%')
        .attr('width', '200%').attr('height', '200%');
      filter.append('feGaussianBlur')
        .attr('stdDeviation', 5)
        .attr('result', 'blur');
      filter.append('feFlood')
        .attr('flood-color', glowConfig.color)
        .attr('flood-opacity', glowConfig.opacity);
      filter.append('feComposite')
        .attr('in2', 'blur')
        .attr('operator', 'in');
      const merge = filter.append('feMerge');
      merge.append('feMergeNode');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }

    // ─── ZOOM ───
    const zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on('zoom', (e) => g.attr('transform', e.transform));
    zoomRef.current = zoom;
    svg.call(zoom);
    svg.style('cursor', 'grab');
    svg.on('mousedown.cursor', () => svg.style('cursor', 'grabbing'));
    svg.on('mouseup.cursor', () => svg.style('cursor', 'grab'));

    const g = svg.append('g');

    // ─── TREE LAYOUT (skills only) ───
    const hierarchy = d3.hierarchy(rootHierarchy);
    const treeWidth = Math.max(width * 0.5, 400);
    const treeHeight = Math.max(hierarchy.height * 180, 280);
    const treeLayout = d3.tree()
      .size([treeWidth, treeHeight])
      .separation((a, b) => {
        if (a.depth === 0) return 3;
        return a.parent === b.parent ? 1.5 : 2;
      });

    treeLayout(hierarchy);

    // ─── POSITION SKILL NODES ───
    const posMap = new Map();
    const sourceBandY = 30;
    const treeTopPad = 240; // large gap between source band and tree

    hierarchy.descendants().forEach((d) => {
      posMap.set(d.data.data.id, { x: d.x, y: d.y + treeTopPad });
    });

    // ─── Build set of changed source IDs ───
    const changedSourceIds = new Set(
      sourceNodes.filter((n) => n.status === 'changed').map((n) => n.id)
    );

    // ─── FORCE-SIMULATE SOURCE POSITIONS (source-only, no link forces) ───
    const provenanceEdges = model.edges.filter((e) => e.kind === 'provenance');
    const hasSources = sourceNodes.length > 0;

    if (hasSources) {
      // Compute each source's ideal X as the average X of its consumers
      const sourceSimNodes = sourceNodes.map((src) => {
        const consumers = provenanceEdges
          .filter((e) => e.source === src.id)
          .map((e) => posMap.get(e.target))
          .filter(Boolean);
        const idealX = consumers.length > 0
          ? consumers.reduce((s, p) => s + p.x, 0) / consumers.length
          : treeWidth / 2;
        return { id: src.id, x: idealX, y: sourceBandY, idealX };
      });

      // Source-only simulation: spread apart, stay in band
      const sourceSim = d3.forceSimulation(sourceSimNodes)
        .force('collide', d3.forceCollide(70))
        .force('x', d3.forceX((d) => d.idealX).strength(0.3))
        .force('y', d3.forceY(sourceBandY).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-100))
        .stop();

      for (let i = 0; i < 200; i++) sourceSim.tick();

      sourceSimNodes.forEach((sn) => {
        posMap.set(sn.id, { x: sn.x, y: sn.y });
      });
    }

    // ─── SEPARATOR LINE between source zone and skill zone ───
    if (hasSources && knowledgeVisible) {
      const separatorY = treeTopPad - 60;
      g.append('line')
        .attr('x1', -200)
        .attr('y1', separatorY)
        .attr('x2', treeWidth + 200)
        .attr('y2', separatorY)
        .attr('stroke', theme.provenance)
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '3 6')
        .attr('opacity', 0.12)
        .style('pointer-events', 'none');
    }

    // ─── PROVENANCE EDGES ───
    // Changed-source edges are amber and clearly visible; others are near-invisible
    const provGroup = g.append('g').attr('class', 'provenance-edges');
    if (knowledgeVisible) {
      provGroup.selectAll('path')
        .data(provenanceEdges)
        .join('path')
        .attr('class', 'edge provenance-edge')
        .attr('d', (e) => {
          const s = posMap.get(e.source);
          const t = posMap.get(e.target);
          if (!s || !t) return '';
          const midY = s.y + (t.y - s.y) * 0.5;
          return `M${s.x},${s.y + 8} C${s.x},${midY} ${t.x},${midY} ${t.x},${t.y - 14}`;
        })
        .attr('fill', 'none')
        .attr('stroke', (e) => changedSourceIds.has(e.source) ? SOURCE_CHANGED_COLOR : theme.provenance)
        .attr('stroke-dasharray', (e) => changedSourceIds.has(e.source) ? '4 3' : '2 4')
        .attr('opacity', (e) => {
          if (changedSourceIds.has(e.source)) return 0.55; // dirty provenance always visible
          if (e.target === model.selected.id) return 0.35;
          return 0.08;
        })
        .attr('stroke-width', (e) => {
          if (changedSourceIds.has(e.source)) return 2;
          if (e.target === model.selected.id) return 1.5;
          return 1;
        })
        .style('transition', 'opacity 200ms ease, stroke-width 200ms ease');
    }

    // ─── TREE EDGES (vertical bezier) ───
    const treeGroup = g.append('g').attr('class', 'tree-edges');
    treeGroup.selectAll('path')
      .data(hierarchy.links())
      .join('path')
      .attr('class', 'edge tree-edge')
      .attr('d', (d) => {
        const sx = d.source.x;
        const sy = d.source.y + treeTopPad;
        const tx = d.target.x;
        const ty = d.target.y + treeTopPad;
        const midY = sy + (ty - sy) * 0.5;
        return `M${sx},${sy} C${sx},${midY} ${tx},${midY} ${tx},${ty}`;
      })
      .attr('fill', 'none')
      .attr('stroke', theme.requires)
      .attr('stroke-width', (d) => d.target.depth <= 1 ? 2.5 : 1.5)
      .attr('opacity', (d) => {
        const depth = d.target.depth;
        if (depth <= 1) return 0.5;
        if (depth === 2) return 0.35;
        return 0.2;
      })
      .style('transition', 'opacity 200ms ease, stroke-width 200ms ease');

    // ─── CROSS-LINKS (shared deps — dashed green) ───
    const crossGroup = g.append('g').attr('class', 'cross-edges');
    crossGroup.selectAll('path')
      .data(crossLinks)
      .join('path')
      .attr('class', 'edge cross-edge')
      .attr('d', (e) => {
        const s = posMap.get(e.source);
        const t = posMap.get(e.target);
        if (!s || !t) return '';
        const midY = Math.max(s.y, t.y) + 40;
        return `M${s.x},${s.y} C${s.x},${midY} ${t.x},${midY} ${t.x},${t.y}`;
      })
      .attr('fill', 'none')
      .attr('stroke', theme.requires)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6 4')
      .attr('opacity', 0.2)
      .style('transition', 'opacity 200ms ease');

    // ─── SOURCE NODES (floating diamonds in their own band) ───
    if (hasSources && knowledgeVisible) {
      const sourceGroup = g.append('g').attr('class', 'source-nodes');
      const sourceGs = sourceGroup.selectAll('g')
        .data(sourceNodes)
        .join('g')
        .attr('data-node-id', (n) => n.id)
        .attr('data-node-type', (n) => n.type)
        .attr('data-node-status', (n) => n.status)
        .attr('transform', (n) => {
          const p = posMap.get(n.id);
          return `translate(${p.x},${p.y})`;
        })
        .style('cursor', 'pointer')
        .on('click', (_, n) => onSelect(n.id))
        .on('mouseenter', (event, n) => {
          highlightConnected(n, model, posMap, g);
          onHover(n, { x: event.clientX, y: event.clientY });
        })
        .on('mousemove', (event, n) => onHover(n, { x: event.clientX, y: event.clientY }))
        .on('mouseleave', () => {
          clearHighlight(g, model.selected.id, changedSourceIds);
          onHoverEnd();
        });

      // Pulsing glow ring for changed sources
      sourceGs.filter((n) => n.status === 'changed')
        .append('path')
        .attr('d', diamondPath(14))
        .attr('fill', 'none')
        .attr('stroke', SOURCE_CHANGED_COLOR)
        .attr('stroke-width', 1.5)
        .style('animation', 'stale-pulse 2s ease-in-out infinite');

      sourceGs.append('path')
        .attr('class', 'source-shape')
        .attr('d', diamondPath(8))
        .attr('fill', (n) => {
          if (n.status === 'changed') return SOURCE_CHANGED_COLOR;
          return `${theme.provenance}55`;
        })
        .attr('stroke', (n) => n.status === 'changed' ? SOURCE_CHANGED_COLOR : theme.provenance)
        .attr('stroke-width', 1.5)
        .attr('filter', (n) => n.status === 'changed' ? 'url(#glow-sourceChanged)' : null)
        .style('transition', 'filter 200ms ease');

      sourceGs.append('text')
        .attr('class', 'node-label')
        .text((n) => n.path.split('/').slice(-1)[0].replace('.md', ''))
        .attr('x', 0)
        .attr('y', -16)
        .attr('text-anchor', 'middle')
        .attr('fill', (n) => n.status === 'changed' ? SOURCE_CHANGED_COLOR : theme.provenance)
        .attr('font-family', 'var(--font-mono)')
        .attr('font-size', 10)
        .attr('opacity', 1)
        .style('pointer-events', 'none')
        .style('display', labelsVisible ? null : 'none');
    }

    // ─── SKILL / DEPENDENCY NODES (circles) ───
    const skillNodeData = hierarchy.descendants();
    const nodeGroup = g.append('g').attr('class', 'skill-nodes');
    const nodeGs = nodeGroup.selectAll('g')
      .data(skillNodeData)
      .join('g')
      .attr('data-node-id', (d) => d.data.data.id)
      .attr('data-node-type', (d) => d.data.data.type)
      .attr('data-node-status', (d) => d.data.data.status)
      .attr('transform', (d) => `translate(${d.x},${d.y + treeTopPad})`)
      .style('cursor', 'pointer')
      .on('click', (_, d) => onSelect(d.data.data.id))
      .on('mouseenter', (event, d) => {
        highlightConnected(d.data.data, model, posMap, g);
        onHover(d.data.data, { x: event.clientX, y: event.clientY });
      })
      .on('mousemove', (event, d) => onHover(d.data.data, { x: event.clientX, y: event.clientY }))
      .on('mouseleave', () => {
        clearHighlight(g, model.selected.id, changedSourceIds);
        onHoverEnd();
      });

    // Stale glow ring
    nodeGs.filter((d) => d.data.data.status === 'stale')
      .append('circle')
      .attr('r', (d) => nodeRadius(d.data.data) + 7)
      .attr('fill', 'none')
      .attr('stroke', STATUS_COLORS.stale)
      .attr('stroke-width', 1.5)
      .style('animation', 'stale-pulse 2s ease-in-out infinite');

    // Main node circle
    nodeGs.append('circle')
      .attr('class', 'node-circle')
      .attr('r', (d) => nodeRadius(d.data.data))
      .attr('fill', (d) => {
        const n = d.data.data;
        if (n.status === 'affected') return 'transparent';
        return isFilled(n) ? nodeColor(n) : 'transparent';
      })
      .attr('stroke', (d) => {
        const n = d.data.data;
        if (n.id === selectedId) return theme.text;
        return nodeColor(n);
      })
      .attr('stroke-width', (d) => {
        const n = d.data.data;
        if (n.id === selectedId) return 3;
        if (n.type === 'skill') return 2;
        if (n.status === 'affected' || !isFilled(n)) return 1.5;
        return 0;
      })
      .style('transition', 'r 200ms ease, filter 200ms ease');

    // Skill labels — above node
    nodeGs.append('text')
      .attr('class', 'node-label')
      .text((d) => d.data.data.name || d.data.data.packageName)
      .attr('text-anchor', 'middle')
      .attr('y', (d) => -nodeRadius(d.data.data) - 12)
      .attr('fill', (d) => d.data.data.id === model.selected.id ? theme.text : theme.textDim)
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', (d) => d.data.data.type === 'skill' ? 13 : 11)
      .attr('font-weight', (d) => d.data.data.type === 'skill' ? 600 : 400)
      .style('pointer-events', 'none')
      .style('display', labelsVisible ? null : 'none');

    // ─── INITIAL TRANSFORM (auto-center) ───
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [, pos] of posMap) {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    minX -= 80;
    maxX += 80;
    minY -= 50;
    maxY += 50;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const scaleX = (width - 80) / contentWidth;
    const scaleY = (height - 140) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.85;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const initialTransform = d3.zoomIdentity
      .translate(width / 2 - centerX * scale, height * 0.42 - centerY * scale)
      .scale(scale);
    zoom.__initialTransform = initialTransform;
    svg.call(zoom.transform, initialTransform);

  }, [model, selectedId, labelsVisible, knowledgeVisible, onSelect, onHover, onHoverEnd]);

  return <svg data-testid="skill-graph" ref={svgRef} style={{ flex: 1, minHeight: 0 }} />;
}

function highlightConnected(node, model, posMap, g) {
  const connected = new Set([node.id]);
  for (const edge of model.edges) {
    if (edge.source === node.id) connected.add(edge.target);
    if (edge.target === node.id) connected.add(edge.source);
  }

  if (node.type !== 'source') {
    for (const edge of model.edges) {
      if (edge.kind === 'requires' && edge.target === node.id) {
        connected.add(edge.source);
      }
    }
  }

  g.selectAll('.source-nodes g').style('opacity', (n) => connected.has(n.id) ? 1 : 0.08);
  g.selectAll('.skill-nodes g').style('opacity', (d) => connected.has(d.data.data.id) ? 1 : 0.08);

  // Provenance edges: bright for connected, hidden for rest
  g.selectAll('.provenance-edge').style('opacity', function () {
    const data = d3.select(this).datum();
    if (!data) return 0;
    return (connected.has(data.source) && connected.has(data.target)) ? 0.6 : 0;
  }).style('stroke-width', function () {
    const data = d3.select(this).datum();
    if (!data) return 1;
    return (connected.has(data.source) && connected.has(data.target)) ? 2 : 1;
  });

  // Tree + cross edges
  g.selectAll('.tree-edge').style('opacity', function () {
    const data = d3.select(this).datum();
    if (!data?.source?.data?.data) return 0.03;
    const sId = data.source.data.data.id;
    const tId = data.target.data.data.id;
    return (connected.has(sId) && connected.has(tId)) ? 0.9 : 0.03;
  });

  g.selectAll('.cross-edge').style('opacity', function () {
    const data = d3.select(this).datum();
    if (!data) return 0.03;
    return (connected.has(data.source) && connected.has(data.target)) ? 0.9 : 0.03;
  });

  const glowKey = node.type === 'source'
    ? (node.status === 'changed' ? 'sourceChanged' : 'source')
    : (node.status || 'unknown');
  g.selectAll('.skill-nodes g')
    .filter((d) => d.data.data.id === node.id)
    .select('.node-circle')
    .attr('filter', `url(#glow-${glowKey})`);

  g.selectAll('.source-nodes g')
    .filter((n) => n.id === node.id)
    .select('.source-shape')
    .attr('filter', `url(#glow-${node.type === 'source' && node.status === 'changed' ? 'sourceChanged' : 'source'})`);
}

function clearHighlight(g, selectedSkillId, changedSourceIds) {
  g.selectAll('.source-nodes g').style('opacity', 1);
  g.selectAll('.skill-nodes g').style('opacity', 1);
  g.selectAll('.provenance-edge')
    .style('opacity', function () {
      const d = d3.select(this).datum();
      if (!d) return 0.08;
      if (changedSourceIds && changedSourceIds.has(d.source)) return 0.55;
      if (d.target === selectedSkillId) return 0.35;
      return 0.08;
    })
    .style('stroke-width', function () {
      const d = d3.select(this).datum();
      if (!d) return 1;
      if (changedSourceIds && changedSourceIds.has(d.source)) return 2;
      if (d.target === selectedSkillId) return 1.5;
      return 1;
    });
  g.selectAll('.tree-edge').style('opacity', null);
  g.selectAll('.cross-edge').style('opacity', 0.2);
  g.selectAll('.node-circle').attr('filter', null);
  // Preserve changed source glow
  g.selectAll('.source-shape').attr('filter', function () {
    const d = d3.select(this.parentNode).datum();
    if (d && changedSourceIds && changedSourceIds.has(d.id)) return 'url(#glow-sourceChanged)';
    return null;
  });
}
