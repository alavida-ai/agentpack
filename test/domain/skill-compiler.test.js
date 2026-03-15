import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileSkillDocument } from '../../packages/agentpack/src/domain/compiler/skill-compiler.js';

function validSkillDocument() {
  return `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd, { proto-persona as persona } from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Use [the proto persona workflow](skill:persona){context="for shaping the target user profile"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`;
}

describe('skill compiler', () => {
  it('compiles declarations into canonical symbols and usage occurrences', () => {
    const compiled = compileSkillDocument(validSkillDocument());

    assert.deepEqual(compiled.skillImports, {
      prd: {
        kind: 'skill',
        localName: 'prd',
        packageSpecifier: '@alavida/prd-development',
        importedName: null,
        target: '@alavida/prd-development',
      },
      persona: {
        kind: 'skill',
        localName: 'persona',
        packageSpecifier: '@alavida/prd-development',
        importedName: 'proto-persona',
        target: '@alavida/prd-development:proto-persona',
      },
    });

    assert.deepEqual(compiled.sourceBindings, {
      principles: {
        kind: 'source',
        localName: 'principles',
        sourcePath: 'domains/product/knowledge/prd-principles.md',
      },
    });

    assert.deepEqual(compiled.occurrences.map((entry) => ({
      kind: entry.kind,
      alias: entry.alias,
      target: entry.target,
      context: entry.context,
    })), [
      {
        kind: 'skill',
        alias: 'prd',
        target: '@alavida/prd-development',
        context: 'for structuring and reviewing the PRD',
      },
      {
        kind: 'skill',
        alias: 'persona',
        target: '@alavida/prd-development:proto-persona',
        context: 'for shaping the target user profile',
      },
      {
        kind: 'source',
        alias: 'principles',
        target: 'domains/product/knowledge/prd-principles.md',
        context: 'primary source material',
      },
    ]);

    assert.deepEqual(compiled.edges, [
      {
        source: 'skill:prd-agent',
        target: '@alavida/prd-development',
        kind: 'skill_usage',
        labels: ['the PRD method'],
        contexts: ['for structuring and reviewing the PRD'],
        occurrenceCount: 1,
      },
      {
        source: 'skill:prd-agent',
        target: '@alavida/prd-development:proto-persona',
        kind: 'skill_usage',
        labels: ['the proto persona workflow'],
        contexts: ['for shaping the target user profile'],
        occurrenceCount: 1,
      },
      {
        source: 'skill:prd-agent',
        target: 'domains/product/knowledge/prd-principles.md',
        kind: 'source_usage',
        labels: ['our PRD principles'],
        contexts: ['primary source material'],
        occurrenceCount: 1,
      },
    ]);
  });

  it('rejects body references to undeclared aliases', () => {
    assert.throws(
      () => compileSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
\`\`\`

Use [the principles](source:principles){context="primary source material"}.
`),
      /undeclared source alias/i
    );
  });

  it('rejects kind mismatches between declarations and usage sites', () => {
    assert.throws(
      () => compileSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the principles](skill:principles){context="primary source material"}.
`),
      /declared as source/i
    );
  });
});
