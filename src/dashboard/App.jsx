import { useEffect, useState } from 'react';
import { fetchWorkbenchModel, runWorkbenchAction } from './lib/api.js';
import { SkillGraph } from './components/SkillGraph.jsx';
import { InspectorPanel } from './components/InspectorPanel.jsx';
import { ActionBar } from './components/ActionBar.jsx';

export function App() {
  const [model, setModel] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    fetchWorkbenchModel()
      .then((nextModel) => {
        setModel(nextModel);
        setSelectedId(nextModel.selected.id);
      })
      .catch((nextError) => setError(nextError.message));
  }, []);

  const selected = model?.nodes.find((node) => node.id === selectedId) || null;

  async function handleAction(action) {
    try {
      setBusyAction(action);
      const payload = await runWorkbenchAction(action);
      setActionResult(payload);
      if (action === 'refresh') {
        const nextModel = await fetchWorkbenchModel();
        setModel(nextModel);
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>Skill Dev Workbench</h1>
        <p style={{ color: '#90a4c4', maxWidth: 720, lineHeight: 1.5 }}>
          Single-skill DAG view for provenance and dependencies during `agentpack skills dev`.
        </p>
      </header>
      <ActionBar onAction={handleAction} busyAction={busyAction} />
      {error ? <p>{error}</p> : null}
      {actionResult ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            background: 'rgba(11, 22, 35, 0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#90a4c4',
          }}
        >
          Last action: <strong style={{ color: '#eef4ff' }}>{actionResult.action}</strong>
        </div>
      ) : null}
      {model ? (
        <section
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.7fr)',
            gap: 18,
          }}
        >
          <SkillGraph model={model} selectedId={selectedId} onSelect={setSelectedId} />
          <InspectorPanel selected={selected} />
        </section>
      ) : null}
    </main>
  );
}
