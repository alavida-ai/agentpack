const BUTTON_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  background: 'var(--surface)',
  border: '1px solid var(--border-bright)',
  color: 'var(--text-dim)',
  padding: '8px 16px',
  cursor: 'pointer',
  transition: 'all 200ms ease',
  letterSpacing: '0.04em',
};

export function ControlStrip({ onAction, busyAction, labelsVisible, onToggleLabels, knowledgeVisible, onToggleKnowledge, lightMode, onToggleTheme }) {
  return (
    <div
      data-testid="control-strip"
      style={{
      position: 'fixed',
      bottom: 28,
      left: 40,
      display: 'flex',
      gap: 8,
      zIndex: 10,
      }}
    >
      <button
        data-testid="control-reset-zoom"
        type="button"
        style={BUTTON_STYLE}
        onClick={() => onAction('reset-zoom')}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--status-current)';
        }}
        onMouseLeave={(e) => {
          e.target.style.color = 'var(--text-dim)';
          e.target.style.borderColor = 'var(--border-bright)';
        }}
      >
        Reset
      </button>
      <button
        data-testid="control-validate"
        type="button"
        style={BUTTON_STYLE}
        disabled={Boolean(busyAction)}
        onClick={() => onAction('validate-skill')}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--status-current)';
        }}
        onMouseLeave={(e) => {
          e.target.style.color = 'var(--text-dim)';
          e.target.style.borderColor = 'var(--border-bright)';
        }}
      >
        {busyAction === 'validate-skill' ? 'Validating...' : 'Validate'}
      </button>
      <button
        data-testid="control-refresh"
        type="button"
        style={BUTTON_STYLE}
        disabled={Boolean(busyAction)}
        onClick={() => onAction('refresh')}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--status-current)';
        }}
        onMouseLeave={(e) => {
          e.target.style.color = 'var(--text-dim)';
          e.target.style.borderColor = 'var(--border-bright)';
        }}
      >
        {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh'}
      </button>
      <button
        data-testid="control-toggle-labels"
        type="button"
        style={{
          ...BUTTON_STYLE,
          ...(labelsVisible ? {} : {
            color: 'var(--status-current)',
            borderColor: 'var(--status-current)',
            background: 'rgba(143, 166, 126, 0.08)',
          }),
        }}
        onClick={onToggleLabels}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--status-current)';
        }}
        onMouseLeave={(e) => {
          if (labelsVisible) {
            e.target.style.color = 'var(--text-dim)';
            e.target.style.borderColor = 'var(--border-bright)';
          } else {
            e.target.style.color = 'var(--status-current)';
            e.target.style.borderColor = 'var(--status-current)';
          }
        }}
      >
        {labelsVisible ? 'Hide labels' : 'Show labels'}
      </button>
      <button
        data-testid="control-toggle-knowledge"
        type="button"
        style={{
          ...BUTTON_STYLE,
          ...(knowledgeVisible ? {
            color: 'var(--edge-provenance)',
            borderColor: 'var(--edge-provenance)',
            background: 'rgba(122, 154, 187, 0.08)',
          } : {}),
        }}
        onClick={onToggleKnowledge}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--edge-provenance)';
        }}
        onMouseLeave={(e) => {
          if (knowledgeVisible) {
            e.target.style.color = 'var(--edge-provenance)';
            e.target.style.borderColor = 'var(--edge-provenance)';
          } else {
            e.target.style.color = 'var(--text-dim)';
            e.target.style.borderColor = 'var(--border-bright)';
          }
        }}
      >
        Knowledge
      </button>
      <button
        data-testid="control-toggle-theme"
        type="button"
        style={{
          ...BUTTON_STYLE,
          ...(lightMode ? {
            color: 'var(--accent)',
            borderColor: 'var(--accent)',
            background: 'rgba(196, 138, 32, 0.08)',
          } : {}),
        }}
        onClick={onToggleTheme}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--text)';
          e.target.style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          if (lightMode) {
            e.target.style.color = 'var(--accent)';
            e.target.style.borderColor = 'var(--accent)';
          } else {
            e.target.style.color = 'var(--text-dim)';
            e.target.style.borderColor = 'var(--border-bright)';
          }
        }}
      >
        {lightMode ? 'Dark' : 'Light'}
      </button>
    </div>
  );
}
