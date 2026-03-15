import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradeRun } from '../../scripts/agent-eval/grade-run.mjs';

describe('gradeRun', () => {
  it('grades successful runs with friction based on learning log pain points', () => {
    const graded = gradeRun({
      run: {
        exitCode: 0,
        transcript: [{ type: 'result', subtype: 'success' }],
      },
      learningLog: [
        { kind: 'pain_point', severity: 'high', area: 'cli-output', note: 'validate was unclear' },
        { kind: 'wrong_turn', severity: 'medium', area: 'syntax', note: 'tried frontmatter first' },
      ],
      report: {
        pain_points: [
          { area: 'cli-output', severity: 'high', what_was_confusing: 'validate/build distinction' },
        ],
      },
    });

    assert.equal(graded.objectiveCompletion.status, 'success');
    assert.equal(graded.productFriction.rating, 'high');
    assert.ok(graded.classifications.includes('cli-output'));
    assert.ok(graded.classifications.includes('syntax'));
  });

  it('grades failed runs as failed objective completion', () => {
    const graded = gradeRun({
      run: {
        exitCode: 1,
        transcript: [{ type: 'stdout', text: 'plain failure output' }],
      },
      learningLog: [],
      report: { pain_points: [] },
    });

    assert.equal(graded.objectiveCompletion.status, 'failed');
    assert.equal(graded.productFriction.rating, 'low');
  });

  it('uses the structured report outcome when available', () => {
    const graded = gradeRun({
      run: {
        exitCode: 0,
        transcript: [],
      },
      learningLog: [],
      report: {
        outcome: 'partial_success',
        pain_points: [],
      },
    });

    assert.equal(graded.objectiveCompletion.status, 'partial_success');
  });
});
