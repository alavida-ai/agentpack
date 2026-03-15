import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { fetchWorkbenchModel, runWorkbenchAction } from './lib/api.js';
import { getSkillFromHash, setSkillHash, onHashChange } from './lib/router.js';
import { SkillGraph } from './components/SkillGraph.jsx';
import { InspectorPanel } from './components/InspectorPanel.jsx';
import { Breadcrumbs } from './components/Breadcrumbs.jsx';
import { ControlStrip } from './components/ControlStrip.jsx';
import { Tooltip } from './components/Tooltip.jsx';

export function App() {
  const [model, setModel] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [knowledgeVisible, setKnowledgeVisible] = useState(true);
  const [resetZoomSignal, setResetZoomSignal] = useState(0);
  const [lightMode, setLightMode] = useState(false);
  const [trail, setTrail] = useState([]);
  const [tooltipNode, setTooltipNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const inspectedNode = model?.nodes.find((n) => n.id === selectedId) || null;

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  const loadModel = useCallback(async (skillPackageName) => {
    try {
      setLoading(true);
      setError(null);
      const nextModel = await fetchWorkbenchModel(skillPackageName);
      setModel(nextModel);
      setSelectedId(null);
      return nextModel;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const hashSkill = getSkillFromHash();
    loadModel(hashSkill).then((m) => {
      if (m) {
        const entry = { packageName: m.selected.id, name: m.selected.name };
        if (hashSkill) {
          setTrail([entry]);
        } else {
          setTrail([entry]);
          setSkillHash(m.selected.id);
        }
      }
    });
  }, [loadModel]);

  // Hash change listener
  useEffect(() => {
    onHashChange((skillPackageName) => {
      if (skillPackageName) {
        loadModel(skillPackageName).then((m) => {
          if (m) {
            setTrail((prev) => {
              const existingIndex = prev.findIndex((e) => e.packageName === skillPackageName);
              if (existingIndex >= 0) {
                return prev.slice(0, existingIndex + 1);
              }
              return [...prev, { packageName: m.selected.id, name: m.selected.name }];
            });
          }
        });
      }
    });
  }, [loadModel]);

  function navigateToSkill(packageName) {
    setSkillHash(packageName);
  }

  function handleBreadcrumbNavigate(packageName, index) {
    setTrail((prev) => prev.slice(0, index + 1));
    setSkillHash(packageName);
  }

  async function handleAction(action) {
    if (action === 'reset-zoom') {
      setResetZoomSignal((s) => s + 1);
      return;
    }

    if (action === 'refresh') {
      const hashSkill = getSkillFromHash();
      setBusyAction('refresh');
      await loadModel(hashSkill);
      setBusyAction(null);
      return;
    }

    try {
      setBusyAction(action);
      await runWorkbenchAction(action);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  const handleHover = useCallback((node, pos) => {
    setTooltipNode(node);
    setTooltipPos(pos);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setTooltipNode(null);
    setTooltipPos(null);
  }, []);

  const handleGraphClick = useCallback((nodeId) => {
    setSelectedId((prev) => prev === nodeId ? null : nodeId);
  }, []);

  return (
    <>
      {/* Header */}
      <header
        data-testid="workbench-header"
        style={{
        padding: '20px 40px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}
      >
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontVariant: 'small-caps',
            textTransform: 'uppercase',
            letterSpacing: 3,
            fontSize: 9,
            color: 'var(--text-dim)',
            marginBottom: 4,
          }}>
            Agentpack
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 28,
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--text)',
          }}>
            Skill Graph
          </div>
          <hr style={{
            width: 36,
            height: 1,
            background: 'var(--status-current)',
            border: 'none',
            marginTop: 10,
          }} />
        </div>
        <div style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
        }}>
          <LegendItem color="var(--edge-provenance)" label="Source" shape="diamond" />
          <LegendItem color="#c45454" label="Changed" shape="diamond" />
          <LegendItem color="var(--status-current)" label="Current" shape="dot" />
          <LegendItem color="var(--status-stale)" label="Stale" shape="dot" />
          <LegendItem color="var(--status-affected)" label="Affected" shape="ring" />
          <LegendItem color="var(--edge-requires)" label="Requires" shape="line" />
          <LegendItem color="var(--edge-provenance)" label="Provenance" shape="dashed" />
        </div>
      </header>

      {/* Breadcrumbs */}
      <Breadcrumbs trail={trail} onNavigate={handleBreadcrumbNavigate} />

      {/* Main area */}
      <div data-testid="workbench-main" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && !model && (
          <div
            data-testid="workbench-loading"
            style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-dim)',
          }}
          >
            Loading...
          </div>
        )}

        {error && (
          <div
            data-testid="workbench-error"
            style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
          }}
          >
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 18,
              fontStyle: 'italic',
              color: 'var(--status-stale)',
            }}>
              {error}
            </div>
            <button
              type="button"
              onClick={() => handleAction('refresh')}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                background: 'var(--surface)',
                border: '1px solid var(--border-bright)',
                color: 'var(--text-dim)',
                padding: '8px 16px',
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {model && !error && (
          <SkillGraph
            model={model}
            selectedId={selectedId}
            onSelect={handleGraphClick}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            labelsVisible={labelsVisible}
            knowledgeVisible={knowledgeVisible}
            resetZoomSignal={resetZoomSignal}
          />
        )}

        {model && model.nodes.length === 1 && model.nodes[0].type === 'skill' && (
          <div
            data-testid="workbench-empty"
            style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--text-faint)',
          }}
          >
            No dependencies or sources found.
          </div>
        )}
      </div>

      {/* Tooltip */}
      <Tooltip node={tooltipNode} position={tooltipPos} />

      {/* Inspector Panel */}
      <InspectorPanel
        node={inspectedNode}
        onClose={() => setSelectedId(null)}
        onNavigate={navigateToSkill}
      />

      {/* Control Strip */}
      <ControlStrip
        onAction={handleAction}
        busyAction={busyAction}
        labelsVisible={labelsVisible}
        onToggleLabels={() => setLabelsVisible((v) => !v)}
        knowledgeVisible={knowledgeVisible}
        onToggleKnowledge={() => setKnowledgeVisible((v) => !v)}
        lightMode={lightMode}
        onToggleTheme={() => setLightMode((v) => !v)}
      />
    </>
  );
}

function LegendItem({ color, label, shape }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-dim)',
      letterSpacing: '0.04em',
    }}>
      {shape === 'dot' && (
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
        }} />
      )}
      {shape === 'ring' && (
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'transparent',
          border: `1.5px solid ${color}`,
        }} />
      )}
      {shape === 'diamond' && (
        <svg width="12" height="12" viewBox="-6 -6 12 12" style={{ display: 'block' }}>
          <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={color} opacity={0.6} />
        </svg>
      )}
      {shape === 'line' && (
        <div style={{
          width: 20,
          height: 2,
          borderRadius: 1,
          background: color,
          opacity: 0.6,
        }} />
      )}
      {shape === 'dashed' && (
        <div style={{
          width: 20,
          height: 0,
          borderTop: `2px dashed ${color}`,
          opacity: 0.5,
        }} />
      )}
      {label}
    </div>
  );
}
