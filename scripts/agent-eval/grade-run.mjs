export function gradeRun({ run, learningLog = [], report = { pain_points: [] } }) {
  const painPoints = [
    ...learningLog.filter((entry) => entry.kind === 'pain_point' || entry.kind === 'wrong_turn'),
    ...(report.pain_points ?? []),
  ];

  const severityScore = painPoints.reduce((score, point) => score + severityToScore(point.severity), 0);
  const rating = severityScore >= 4 ? 'high' : severityScore >= 2 ? 'medium' : 'low';
  const classifications = [...new Set(painPoints.map((point) => point.area).filter(Boolean))];

  return {
    objectiveCompletion: {
      status: deriveObjectiveStatus(run, report),
    },
    productFriction: {
      rating,
      painPointCount: painPoints.length,
      severityScore,
    },
    classifications,
  };
}

function deriveObjectiveStatus(run, report) {
  switch (report?.outcome) {
    case 'success':
      return 'success';
    case 'partial_success':
      return 'partial_success';
    case 'failure':
      return 'failed';
    default:
      return run.exitCode === 0 ? 'success' : 'failed';
  }
}

function severityToScore(severity) {
  switch (severity) {
    case 'high':
      return 2;
    case 'medium':
      return 1;
    default:
      return 0;
  }
}
