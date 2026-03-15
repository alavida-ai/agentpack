import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_USER_STORY_GROUPS,
  getScenario,
  listScenarios,
  validateScenario,
} from '../../scripts/agent-eval/scenarios.js';

describe('agent eval scenarios', () => {
  it('exposes a valid starter catalog that covers every required user-story group', () => {
    const scenarios = listScenarios();

    assert.ok(Array.isArray(scenarios));
    assert.ok(scenarios.length >= REQUIRED_USER_STORY_GROUPS.length);

    const coveredGroups = new Set();
    const ids = new Set();

    for (const scenario of scenarios) {
      validateScenario(scenario);
      assert.equal(ids.has(scenario.id), false, `duplicate scenario id: ${scenario.id}`);
      ids.add(scenario.id);

      for (const group of scenario.userStoryGroups) {
        coveredGroups.add(group);
      }
    }

    assert.deepEqual([...coveredGroups].sort(), [...REQUIRED_USER_STORY_GROUPS].sort());
  });

  it('resolves scenarios by id', () => {
    const scenario = getScenario('synthetic/new-skill');
    assert.equal(scenario.id, 'synthetic/new-skill');
    assert.equal(scenario.runMode, 'autonomous');
    assert.equal(scenario.repo.source, 'synthetic');
    assert.equal(scenario.browser.required, false);
  });

  it('rejects invalid scenario shapes', () => {
    assert.throws(
      () =>
        validateScenario({
          id: 'broken',
          repo: { source: 'synthetic' },
          task: {},
        }),
      /scenario\./
    );
  });
});
