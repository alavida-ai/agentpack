import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkbenchNodeInteraction } from '../../packages/agentpack/src/dashboard/lib/navigation.js';

describe('resolveWorkbenchNodeInteraction', () => {
  it('selects internal and external dependency nodes for inspector navigation', () => {
    assert.deepEqual(
      resolveWorkbenchNodeInteraction({
        id: '@alavida/value-copywriting:kickoff',
        packageName: '@alavida/value-copywriting:kickoff',
        type: 'internal-skill',
      }, null),
      {
        action: 'select',
        target: '@alavida/value-copywriting:kickoff',
      }
    );

    assert.deepEqual(
      resolveWorkbenchNodeInteraction({
        id: '@alavida/research',
        packageName: '@alavida/research',
        type: 'external-package',
      }, null),
      {
        action: 'select',
        target: '@alavida/research',
      }
    );
  });

  it('toggles inspector selection for source and selected skill nodes', () => {
    assert.deepEqual(
      resolveWorkbenchNodeInteraction({
        id: 'source:domains/value/knowledge/tone-of-voice.md',
        type: 'source',
      }, null),
      {
        action: 'select',
        target: 'source:domains/value/knowledge/tone-of-voice.md',
      }
    );

    assert.deepEqual(
      resolveWorkbenchNodeInteraction({
        id: '@alavida/value-copywriting',
        packageName: '@alavida/value-copywriting',
        type: 'skill',
      }, '@alavida/value-copywriting'),
      {
        action: 'select',
        target: null,
      }
    );
  });
});
