const STATUS_COLORS = {
  current: 'var(--status-current)',
  stale: 'var(--status-stale)',
  affected: 'var(--status-affected)',
  changed: 'var(--status-stale)',
  unknown: 'var(--status-unknown)',
};

export function Tooltip({ node, position }) {
  if (!node || !position) return null;

  const x = Math.min(position.x + 16, window.innerWidth - 380);
  const y = Math.min(position.y - 10, window.innerHeight - 220);

  const statusColor = STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
  const label = node.packageName || node.path?.split('/').slice(-1)[0] || node.id;
  const description = node.description || '';
  const truncated = description.length > 200 ? description.slice(0, 200) + '...' : description;

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--surface)',
        border: '1px solid var(--border-bright)',
        padding: '16px 20px',
        maxWidth: 360,
        zIndex: 100,
        pointerEvents: 'none',
        animation: 'tooltipIn 200ms ease',
      }}
    >
      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: 18,
        fontWeight: 400,
        fontStyle: 'italic',
        color: 'var(--text)',
        marginBottom: 4,
      }}>
        {node.name || label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontVariant: 'small-caps',
        textTransform: 'uppercase',
        letterSpacing: 3,
        fontSize: 9,
        color: statusColor,
        marginBottom: truncated ? 10 : 0,
      }}>
        {node.type}
      </div>
      {truncated && (
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--text-dim)',
          lineHeight: 1.5,
          marginBottom: 10,
        }}>
          {truncated}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          padding: '2px 8px',
          letterSpacing: '0.02em',
          background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
          color: statusColor,
        }}>
          {node.status}
        </span>
        {node.version && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '2px 8px',
            letterSpacing: '0.02em',
            background: 'rgba(255, 255, 255, 0.04)',
            color: 'var(--text-dim)',
          }}>
            v{node.version}
          </span>
        )}
        {node.usedBy && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '2px 8px',
            letterSpacing: '0.02em',
            background: 'rgba(122, 154, 187, 0.1)',
            color: 'var(--edge-provenance)',
          }}>
            {node.usedBy.length} skill{node.usedBy.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
