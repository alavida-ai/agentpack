const ACTIONS = [
  ['check-stale', 'Check Stale'],
  ['show-dependencies', 'Show Dependencies'],
  ['validate-skill', 'Validate Skill'],
  ['refresh', 'Refresh Graph'],
];

export function ActionBar({ onAction, busyAction }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {ACTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => onAction(value)}
        >
          {busyAction === value ? `${label}...` : label}
        </button>
      ))}
    </div>
  );
}
