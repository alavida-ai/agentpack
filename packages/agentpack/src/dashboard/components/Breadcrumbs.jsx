export function Breadcrumbs({ trail, onNavigate }) {
  if (!trail || trail.length === 0) return null;

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '0.02em',
      color: 'var(--text-dim)',
      padding: '0 40px',
      height: 32,
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {trail.map((entry, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span key={entry.packageName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {index > 0 && <span style={{ color: 'var(--text-faint)' }}>›</span>}
            {isLast ? (
              <span style={{ color: 'var(--text)' }}>
                {entry.name || entry.packageName}
              </span>
            ) : (
              <span
                onClick={() => onNavigate(entry.packageName, index)}
                style={{
                  cursor: 'pointer',
                  transition: 'color 200ms ease',
                }}
                onMouseEnter={(e) => { e.target.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.target.style.color = 'var(--text-dim)'; }}
              >
                {entry.name || entry.packageName}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
