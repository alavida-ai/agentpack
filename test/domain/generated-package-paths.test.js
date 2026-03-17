import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPackagePath } from '../../packages/agentpack/src/domain/skills/generated-package-paths.js';

describe('isGeneratedPackagePath', () => {
  it('treats dist and .agentpack paths as generated package output', () => {
    assert.equal(isGeneratedPackagePath('dist'), true);
    assert.equal(isGeneratedPackagePath('dist/skill/SKILL.md'), true);
    assert.equal(isGeneratedPackagePath('.agentpack'), true);
    assert.equal(isGeneratedPackagePath('.agentpack/materialization-state.json'), true);
  });

  it('does not treat authored skill or source files as generated output', () => {
    assert.equal(isGeneratedPackagePath('SKILL.md'), false);
    assert.equal(isGeneratedPackagePath('skills/kickoff/SKILL.md'), false);
    assert.equal(isGeneratedPackagePath('domains/value/knowledge/tone-of-voice.md'), false);
  });
});
