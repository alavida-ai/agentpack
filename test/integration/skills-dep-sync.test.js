import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { addPackagedSkill, createTempRepo } from './fixtures.js';
import { syncSkillDependencies } from '../../packages/agentpack/src/lib/skills.js';

describe('agentpack skill dependency sync', () => {
  it('adds missing managed requires with a "*" range', () => {
    const repo = createTempRepo('dep-sync-add');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/methodology-gary-provost
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {},
        },
      });

      const result = syncSkillDependencies(join(repo.root, 'skills', 'copywriting'));
      const pkg = JSON.parse(readFileSync(join(repo.root, 'skills', 'copywriting', 'package.json'), 'utf-8'));

      assert.deepEqual(result.added, ['@alavida/methodology-gary-provost']);
      assert.deepEqual(result.removed, []);
      assert.equal(result.unchanged, false);
      assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '*');
    } finally {
      repo.cleanup();
    }
  });

  it('removes managed dependencies no longer present in requires while preserving third-party entries', () => {
    const repo = createTempRepo('dep-sync-remove');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/new-dep
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida/old-dep': '^1.0.0',
            lodash: '^4.0.0',
            '@other-org/util': '^2.0.0',
          },
        },
      });

      const result = syncSkillDependencies(join(repo.root, 'skills', 'copywriting'));
      const pkg = JSON.parse(readFileSync(join(repo.root, 'skills', 'copywriting', 'package.json'), 'utf-8'));

      assert.deepEqual(result.added, ['@alavida/new-dep']);
      assert.deepEqual(result.removed, ['@alavida/old-dep']);
      assert.equal(pkg.dependencies['@alavida/new-dep'], '*');
      assert.equal(pkg.dependencies['@alavida/old-dep'], undefined);
      assert.equal(pkg.dependencies.lodash, '^4.0.0');
      assert.equal(pkg.dependencies['@other-org/util'], '^2.0.0');
    } finally {
      repo.cleanup();
    }
  });

  it('preserves existing version ranges and is idempotent', () => {
    const repo = createTempRepo('dep-sync-idempotent');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/methodology-gary-provost
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida/methodology-gary-provost': '^1.0.0',
          },
        },
      });

      const skillDir = join(repo.root, 'skills', 'copywriting');
      const first = syncSkillDependencies(skillDir);
      const firstPackage = readFileSync(join(skillDir, 'package.json'), 'utf-8');
      const second = syncSkillDependencies(skillDir);
      const secondPackage = readFileSync(join(skillDir, 'package.json'), 'utf-8');

      assert.deepEqual(first.added, []);
      assert.deepEqual(first.removed, []);
      assert.equal(first.unchanged, true);
      assert.deepEqual(second.added, []);
      assert.deepEqual(second.removed, []);
      assert.equal(second.unchanged, true);
      assert.equal(firstPackage, secondPackage);
      assert.match(firstPackage, /"\^1\.0\.0"/);
    } finally {
      repo.cleanup();
    }
  });

  it('manages both @alavida and @alavida-ai scopes', () => {
    const repo = createTempRepo('dep-sync-ai-scope');

    try {
      addPackagedSkill(repo.root, 'skills/proof-points', {
        skillMd: `---
name: value-proof-points
description: Proof.
requires:
  - @alavida-ai/value-proof-points
---

# Proof
`,
        packageJson: {
          name: '@alavida-ai/value-proof-points-wrapper',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida-ai/old-skill': '^1.0.0',
          },
        },
      });

      const result = syncSkillDependencies(join(repo.root, 'skills', 'proof-points'));
      const pkg = JSON.parse(readFileSync(join(repo.root, 'skills', 'proof-points', 'package.json'), 'utf-8'));

      assert.deepEqual(result.added, ['@alavida-ai/value-proof-points']);
      assert.deepEqual(result.removed, ['@alavida-ai/old-skill']);
      assert.equal(pkg.dependencies['@alavida-ai/value-proof-points'], '*');
      assert.equal(pkg.dependencies['@alavida-ai/old-skill'], undefined);
    } finally {
      repo.cleanup();
    }
  });
});
