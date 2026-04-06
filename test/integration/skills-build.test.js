import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthoredPluginBundleFixture, createScenario, readCompiledState, runCLI, runCLIJson } from './fixtures.js';

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
      const runtimeManifestPath = join(repo.root, 'skills', 'prd-agent', 'dist', 'agentpack.json');
      assert.equal(existsSync(runtimeManifestPath), true);
      const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
      assert.equal(runtimeManifest.packageName, '@alavida/prd-agent');
      assert.equal(runtimeManifest.exports[0].runtimeName, 'prd-agent');
      assert.equal(
        runtimeManifest.exports[0].compiled.sourceBindings.principles.sourcePath,
        'dist/prd-agent/references/prd-principles.md'
      );
      assert.equal(compiledPath(repo.root), join(repo.root, '.agentpack', 'compiled.json'));
      assert.equal(result.json.distPath, 'skills/prd-agent/dist');
    } finally {
      repo.cleanup();
    }
  });

  it('shows plugin and SkillKit next steps after build', () => {
    const repo = createScenario({
      name: 'skills-build-next-steps',
      packages: [
        {
          relPath: 'skills/runtime-agent',
          packageJson: {
            name: '@alavida/runtime-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: runtime-agent
description: Runtime payload skill.
---

\`\`\`agentpack
\`\`\`

Use the runtime helpers in this package.
`,
        },
      ],
    });

    try {
      const result = runCLI(['author', 'build', 'skills/runtime-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Dist Path: skills\/runtime-agent\/dist/);
      assert.match(result.stdout, /plugin/i);
      assert.match(result.stdout, /skillkit@latest install \.\/dist --yes --agent claude-code/i);
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

  it('bundles authored dependency closure into the selected target dist while keeping the package manifest scoped', () => {
    const repo = createAuthoredPluginBundleFixture('skills-build-authored-plugin-bundle');

    try {
      const result = runCLIJson(['author', 'build', 'workbenches/dashboard-creator'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const bundleManifestPath = join(repo.root, 'workbenches', 'dashboard-creator', 'dist', '.agentpack-bundle.json');
      const runtimeManifestPath = join(repo.root, 'workbenches', 'dashboard-creator', 'dist', 'agentpack.json');
      const rootRuntimePath = join(repo.root, 'workbenches', 'dashboard-creator', 'dist', 'dashboard-creator', 'SKILL.md');
      const dependencyRuntimePath = join(repo.root, 'workbenches', 'dashboard-creator', 'dist', 'foundation-primer', 'SKILL.md');

      assert.equal(existsSync(runtimeManifestPath), true);
      assert.equal(existsSync(bundleManifestPath), true);
      assert.equal(existsSync(rootRuntimePath), true);
      assert.equal(existsSync(dependencyRuntimePath), true);

      const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
      assert.deepEqual(runtimeManifest.exports.map((entry) => entry.runtimeName), ['dashboard-creator']);

      const bundleManifest = JSON.parse(readFileSync(bundleManifestPath, 'utf-8'));
      assert.equal(bundleManifest.targetPackageName, '@alavida-ai/dashboard-creator');
      assert.equal(bundleManifest.selectedExportId, '@alavida-ai/dashboard-creator');
      assert.deepEqual(
        bundleManifest.exports.map((entry) => entry.runtimeName).sort(),
        ['dashboard-creator', 'foundation-primer']
      );

      const compiled = readCompiledState(repo.root);
      assert.deepEqual(Object.keys(compiled.packages).sort(), [
        '@alavida-ai/dashboard-creator',
        '@alavida-ai/foundation-primer',
      ]);
    } finally {
      repo.cleanup();
    }
  });

  it('copies declared package runtime payload folders into dist for plugin and skillkit distribution', () => {
    const repo = createScenario({
      name: 'skills-build-runtime-payload',
      packages: [
        {
          relPath: 'skills/runtime-agent',
          packageJson: {
            name: '@alavida/runtime-agent',
            version: '1.0.0',
            files: ['SKILL.md', 'scripts', 'lib', 'data'],
          },
          files: {
            'SKILL.md': `---
name: runtime-agent
description: Runtime payload skill.
---

\`\`\`agentpack
\`\`\`

Use the runtime helpers in this package.
`,
            'scripts/run.ts': 'export const run = () => "ok";\n',
            'lib/helpers.ts': 'export const helper = () => "helper";\n',
            'data/config.json': '{\n  "mode": "runtime"\n}\n',
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/runtime-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(existsSync(join(repo.root, 'skills', 'runtime-agent', 'dist', 'runtime-agent', 'SKILL.md')), true);
      assert.equal(existsSync(join(repo.root, 'skills', 'runtime-agent', 'dist', 'scripts', 'run.ts')), true);
      assert.equal(existsSync(join(repo.root, 'skills', 'runtime-agent', 'dist', 'lib', 'helpers.ts')), true);
      assert.equal(existsSync(join(repo.root, 'skills', 'runtime-agent', 'dist', 'data', 'config.json')), true);
      assert.equal(
        readFileSync(join(repo.root, 'skills', 'runtime-agent', 'dist', 'data', 'config.json'), 'utf-8'),
        '{\n  "mode": "runtime"\n}\n'
      );
    } finally {
      repo.cleanup();
    }
  });

  it('builds runtime artifacts for a root package and keeps declared runtime payload', () => {
    const repo = createScenario({
      name: 'skills-build-root-package',
      files: {
        'package.json': `${JSON.stringify({
          name: '@alavida/root-package',
          version: '1.0.0',
          files: ['SKILL.md', 'skills', 'wiki'],
        }, null, 2)}\n`,
        'SKILL.md': `---
name: root-package
description: Root package skill.
---

\`\`\`agentpack
import childSkill from skill "@alavida/root-package:child"
source handbook = "wiki/handbook.md"
\`\`\`

Use [child skill](skill:childSkill){context="delegated child workflow"}.
Use [handbook](source:handbook){context="root package source material"}.
`,
        'skills/child/SKILL.md': `---
name: root-package:child
description: Child skill.
---

\`\`\`agentpack
source handbook = "wiki/handbook.md"
\`\`\`

Use [handbook](source:handbook){context="child source material"}.
`,
        'wiki/handbook.md': '# Handbook\n',
      },
    });

    try {
      const result = runCLIJson(['author', 'build', 'SKILL.md'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.distPath, './dist');
      assert.equal(existsSync(join(repo.root, 'dist', 'root-package', 'SKILL.md')), true);
      assert.equal(existsSync(join(repo.root, 'dist', 'root-package:child', 'SKILL.md')), true);
      assert.equal(existsSync(join(repo.root, 'dist', 'agentpack.json')), true);
      assert.equal(existsSync(join(repo.root, 'dist', 'wiki', 'handbook.md')), true);
    } finally {
      repo.cleanup();
    }
  });
});

function compiledPath(repoRoot) {
  return join(repoRoot, '.agentpack', 'compiled.json');
}
