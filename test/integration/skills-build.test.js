import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createScenario, readCompiledState, runCLIJson } from './fixtures.js';

describe('agentpack skills build', () => {
  it('builds compiled state for a compiler-mode packaged skill', () => {
    const repo = createScenario({
      name: 'skills-build-compiler-mode',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.rootSkill, 'skill:prd-agent');
      assert.equal(result.json.skillCount, 1);
      assert.equal(result.json.sourceCount, 1);
      assert.equal(result.json.edgeCount, 2);

      const compiled = readCompiledState(repo.root);
      assert.ok(compiled);
      assert.equal(compiled.version, 2);
      assert.equal(compiled.active_package, '@alavida/prd-agent');
      assert.equal(compiled.packages['@alavida/prd-agent'].root_skill, 'skill:prd-agent');
      assert.equal(compiled.packages['@alavida/prd-agent'].skills[0].packageName, '@alavida/prd-agent');
      assert.equal(
        compiled.packages['@alavida/prd-agent'].sourceFiles[0].path,
        'domains/product/knowledge/prd-principles.md'
      );
      assert.equal(compiled.packages['@alavida/prd-agent'].edges.length, 2);
      assert.equal(compiled.packages['@alavida/prd-agent'].occurrences.length, 2);
      assert.equal(compiled.packages['@alavida/prd-agent'].skills[0].skillFile, 'skills/prd-agent/SKILL.md');
      assert.equal(compiledPath(repo.root), join(repo.root, '.agentpack', 'compiled.json'));
    } finally {
      repo.cleanup();
    }
  });

  it('merges package build output without clobbering other compiled packages', () => {
    const repo = createScenario({
      name: 'skills-build-multi-package-merge',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
        'domains/product/knowledge/research-principles.md': '# Research\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
        {
          relPath: 'skills/research-agent',
          packageJson: {
            name: '@alavida/research-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: research-agent
description: Perform research.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/research-principles.md"
\`\`\`

Ground this in [research principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      let result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      result = runCLIJson(['author', 'build', 'skills/research-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const compiled = readCompiledState(repo.root);
      assert.deepEqual(Object.keys(compiled.packages).sort(), [
        '@alavida/prd-agent',
        '@alavida/research-agent',
      ]);
      assert.equal(compiled.active_package, '@alavida/research-agent');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when a declared source binding does not exist', () => {
    const repo = createScenario({
      name: 'skills-build-missing-source',
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.error, 'bound_source_not_found');
      assert.match(result.json.message, /bound source file not found/i);
    } finally {
      repo.cleanup();
    }
  });

  it('resolves relative build targets from the current working directory', () => {
    const repo = createScenario({
      name: 'skills-build-relative-target',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'workbenches/creator/agonda-architect',
          packageJson: {
            name: '@alavida/agonda-architect',
            version: '1.0.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: agonda-architect
description: Root workflow.
---

\`\`\`agentpack
import architect from skill "@alavida/agonda-architect:architect"
\`\`\`

Use [architect](skill:architect){context="primary entrypoint"}.
`,
            'skills/architect/SKILL.md': `---
name: agonda-architect:architect
description: Architecture workflow.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [principles](source:principles){context="primary source material"}.
`,
          },
        },
      ],
    });

    try {
      const nestedCwd = join(repo.root, 'workbenches', 'creator', 'agonda-architect');
      const result = runCLIJson(['author', 'build', 'skills/architect'], { cwd: nestedCwd });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      const compiled = readCompiledState(repo.root);
      assert.equal(compiled.active_package, '@alavida/agonda-architect');
    } finally {
      repo.cleanup();
    }
  });
});

function compiledPath(repoRoot) {
  return join(repoRoot, '.agentpack', 'compiled.json');
}
