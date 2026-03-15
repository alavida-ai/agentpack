const STATUS_COLORS = {
  current: 'var(--status-current)',
  stale: 'var(--status-stale)',
  affected: 'var(--status-affected)',
  changed: 'var(--status-stale)',
  unknown: 'var(--status-unknown)',
};

function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      padding: '3px 10px',
      letterSpacing: '0.04em',
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      color,
      textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}

function MetaRow({ label, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontVariant: 'small-caps',
        textTransform: 'uppercase',
        letterSpacing: 3,
        fontSize: 9,
        color: 'var(--text-faint)',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

export function InspectorPanel({ node, onClose, onNavigate }) {
  return (
    <aside
      data-testid="inspector-panel"
      style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: node ? 340 : 0,
      height: '100vh',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      transition: 'width 300ms ease',
      overflow: 'hidden',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      }}
    >
      {node && (
        <div style={{ padding: '28px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Close button */}
          <button
            data-testid="inspector-close"
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              padding: 4,
              lineHeight: 1,
              transition: 'color 200ms ease',
            }}
            onMouseEnter={(e) => { e.target.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--text-dim)'; }}
          >
            ×
          </button>

          {/* Type label */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontVariant: 'small-caps',
            textTransform: 'uppercase',
            letterSpacing: 3,
            fontSize: 9,
            color: 'var(--text-dim)',
            marginBottom: 6,
          }}>
            {node.type}
          </div>

          {/* Name */}
          <h2 style={{
            fontFamily: 'var(--font-body)',
            fontSize: 24,
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--text)',
            margin: '0 0 12px 0',
            lineHeight: 1.3,
            paddingRight: 24,
          }}>
            {node.name || node.path?.split('/').slice(-1)[0] || node.id}
          </h2>

          {/* Status */}
          <StatusPill status={node.status} />

          {/* Description */}
          {node.description && (
            <MetaRow label="Description">
              {node.description}
            </MetaRow>
          )}

          {/* Source-specific fields */}
          {node.type === 'source' && (
            <>
              <MetaRow label="Path">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {node.path}
                </span>
              </MetaRow>
              {node.usedBy && node.usedBy.length > 0 && (
                <MetaRow label="Used by">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {node.usedBy.map((skillName) => (
                      <span key={skillName} style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--edge-provenance)',
                      }}>
                        {skillName}
                      </span>
                    ))}
                  </div>
                </MetaRow>
              )}
            </>
          )}

          {/* Skill/Dependency fields */}
          {(node.type === 'skill' || node.type === 'dependency') && (
            <>
              {node.version && (
                <MetaRow label="Version">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {node.version}
                  </span>
                </MetaRow>
              )}
              <MetaRow label="Explanation">
                {node.explanation}
              </MetaRow>
            </>
          )}

          {/* Navigate into dependency */}
          {node.type === 'dependency' && onNavigate && (
            <button
              data-testid="inspector-navigate"
              type="button"
              onClick={() => onNavigate(node.packageName)}
              style={{
                marginTop: 24,
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                background: 'transparent',
                border: '1px solid var(--border-bright)',
                color: 'var(--text-dim)',
                padding: '10px 16px',
                cursor: 'pointer',
                transition: 'all 200ms ease',
                letterSpacing: '0.04em',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.color = 'var(--text)';
                e.target.style.borderColor = 'var(--status-current)';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = 'var(--text-dim)';
                e.target.style.borderColor = 'var(--border-bright)';
              }}
            >
              View skill graph →
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
