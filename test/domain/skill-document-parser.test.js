import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillDocument } from '../../packages/agentpack/src/domain/compiler/skill-document-parser.js';

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

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`;
}

describe('skill document parser', () => {
  it('parses frontmatter, declarations, and contextual body references', () => {
    const parsed = parseSkillDocument(validSkillDocument());

    assert.deepEqual(parsed.metadata, {
      name: 'prd-agent',
      description: 'Create strong PRDs.',
    });

    assert.deepEqual(parsed.imports, [
      {
        packageSpecifier: '@alavida/prd-development',
        defaultImport: 'prd',
        namedImports: [
          {
            importedName: 'proto-persona',
            localName: 'persona',
          },
        ],
      },
    ]);

    assert.deepEqual(parsed.sources, [
      {
        localName: 'principles',
        sourcePath: 'domains/product/knowledge/prd-principles.md',
      },
    ]);

    assert.deepEqual(parsed.references.map((entry) => ({
      kind: entry.kind,
      alias: entry.alias,
      label: entry.label,
      context: entry.context,
    })), [
      {
        kind: 'skill',
        alias: 'prd',
        label: 'the PRD method',
        context: 'for structuring and reviewing the PRD',
      },
      {
        kind: 'source',
        alias: 'principles',
        label: 'our PRD principles',
        context: 'primary source material',
      },
    ]);
  });

  it('rejects a missing agentpack declarations block', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
`),
      /agentpack declarations block/i
    );
  });

  it('rejects duplicate aliases across imports and source bindings', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
source prd = "domains/product/knowledge/prd-principles.md"
\`\`\`
`),
      /duplicate/i
    );
  });

  it('rejects body references without explicit context metadata', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
\`\`\`

Use [the PRD method](skill:prd).
`),
      /missing context/i
    );
  });

  it('rejects malformed import statements', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import from skill "@alavida/prd-development"
\`\`\`
`),
      /unrecognized agentpack declaration|malformed/i
    );
  });

  it('rejects malformed source bindings', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles "domains/product/knowledge/prd-principles.md"
\`\`\`
`),
      /unrecognized agentpack declaration|malformed/i
    );
  });

  it('rejects the legacy frontmatter-only contract', () => {
    assert.throws(
      () => parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
metadata:
  sources:
    - domains/product/knowledge/prd-principles.md
requires:
  - @alavida/prd-development
---

# PRD Agent
`),
      /legacy/i
    );
  });

  it('allows legacy-looking examples in the body when frontmatter is valid', () => {
    const parsed = parseSkillDocument(`---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

\`\`\`yaml
requires:
  - "@alavida/prd-development"
metadata:
  sources:
    - domains/product/knowledge/prd-principles.md
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`);

    assert.deepEqual(parsed.metadata, {
      name: 'prd-agent',
      description: 'Create strong PRDs.',
    });
    assert.equal(parsed.references.length, 1);
  });
});
