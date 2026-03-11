export function InspectorPanel({ selected }) {
  if (!selected) {
    return <aside>Nothing selected.</aside>;
  }

  return (
    <aside
      style={{
        padding: 16,
        borderRadius: 18,
        background: 'rgba(11, 22, 35, 0.9)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Inspector</h2>
      <div style={{ color: '#90a4c4', fontSize: 14 }}>Type</div>
      <div>{selected.type}</div>
      <div style={{ color: '#90a4c4', fontSize: 14, marginTop: 10 }}>Status</div>
      <div>{selected.status}</div>
      <div style={{ color: '#90a4c4', fontSize: 14, marginTop: 10 }}>Explanation</div>
      <div>{selected.explanation}</div>
    </aside>
  );
}
