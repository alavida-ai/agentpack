import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario } from '../integration/scenario-builder.js';
import { buildCompiledStateUseCase } from '../../packages/agentpack/src/application/skills/build-compiled-state.js';
import { resolveSkillDevWorkbenchModel } from '../../packages/agentpack/src/application/skills/start-skill-dev-workbench.js';

describe('resolveSkillDevWorkbenchModel', () => {
  it('hydrates external dependency metadata and supports navigating to internal and external graphs', () => {
    const rootSourcePath = 'domains/value/knowledge/tone-of-voice.md';
    const externalSourcePath = 'domains/research/knowledge/interview-notes.md';
    const repo = createScenario({
      name: 'resolve-skill-dev-workbench-model',
      sources: {
        [rootSourcePath]: '# Voice\n',
        [externalSourcePath]: '# Interview Notes\n',
      },
      packages: [
        {
          relPath: 'skills/copywriting',
          packageJson: {
            name: '@alavida/value-copywriting',
            version: '1.0.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: value-copywriting
description: Root workflow.
---

\`\`\`agentpack
import kickoff from skill "@alavida/value-copywriting:kickoff"
import research from skill "@alavida/research"
\`\`\`

Use [kickoff](skill:kickoff){context="entrypoint sub-skill"}.
Use [research](skill:research){context="external dependency"}.
`,
            'skills/kickoff/SKILL.md': `---
name: value-copywriting:kickoff
description: Kickoff the copy brief.
---

\`\`\`agentpack
source toneOfVoice = "${rootSourcePath}"
\`\`\`

Ground this in [tone of voice](source:toneOfVoice){context="primary writing guidance"}.
`,
          },
        },
        {
          relPath: 'skills/research',
          packageJson: {
            name: '@alavida/research',
            version: '2.3.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: research
description: Gather supporting evidence.
---

\`\`\`agentpack
source interviews = "${externalSourcePath}"
\`\`\`

Ground this in [interview notes](source:interviews){context="primary research source"}.
`,
        },
      ],
    });

    try {
      buildCompiledStateUseCase('skills/copywriting', { cwd: repo.root, persist: true });

      const rootModel = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/copywriting',
      });
      assert.equal(rootModel.selected.id, '@alavida/value-copywriting');
      assert.equal(rootModel.selected.sourceCount, 1);
      assert.deepEqual(
        rootModel.edges.filter((edge) => edge.kind === 'provenance'),
        [
          {
            source: `source:${rootSourcePath}`,
            target: '@alavida/value-copywriting:kickoff',
            kind: 'provenance',
          },
        ]
      );
      assert.equal(
        rootModel.nodes.find((node) => node.id === '@alavida/research')?.description,
        'Gather supporting evidence.'
      );
      assert.equal(
        rootModel.nodes.find((node) => node.id === '@alavida/research')?.version,
        '2.3.0'
      );

      const subskillModel = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/copywriting',
        requestedTarget: '@alavida/value-copywriting:kickoff',
      });
      assert.equal(subskillModel.selected.id, '@alavida/value-copywriting:kickoff');
      assert.deepEqual(
        subskillModel.nodes.filter((node) => node.type === 'source').map((node) => node.path),
        [rootSourcePath]
      );

      buildCompiledStateUseCase('skills/research', { cwd: repo.root, persist: true });

      const externalModel = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/copywriting',
        requestedTarget: '@alavida/research',
      });
      assert.equal(externalModel.selected.id, '@alavida/research');
      assert.deepEqual(
        externalModel.nodes.filter((node) => node.type === 'source').map((node) => node.path),
        [externalSourcePath]
      );

      const noSourcesRepo = createScenario({
        name: 'resolve-skill-dev-workbench-model-no-sources',
        packages: [
          {
            relPath: 'skills/agonda-architect',
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

Use [architect](skill:architect){context="sub-skill"}.
`,
              'skills/architect/SKILL.md': `---
name: agonda-architect:architect
description: Design the architecture.
---

\`\`\`agentpack
\`\`\`

# Architect
`,
            },
          },
        ],
      });

      try {
        buildCompiledStateUseCase('skills/agonda-architect', { cwd: noSourcesRepo.root, persist: true });

        const noSourcesModel = resolveSkillDevWorkbenchModel({
          repoRoot: noSourcesRepo.root,
          defaultTarget: 'skills/agonda-architect',
        });
        assert.equal(noSourcesModel.selected.id, '@alavida/agonda-architect');
        assert.equal(noSourcesModel.selected.sourceCount, 0);
        assert.match(noSourcesModel.selected.sourceSummary, /no bound source material/i);
      } finally {
        noSourcesRepo.cleanup();
      }
    } finally {
      repo.cleanup();
    }
  });

  it('reads the existing compiled state when navigating instead of rebuilding the package', () => {
    const repo = createScenario({
      name: 'resolve-skill-dev-workbench-model-no-rebuild-navigation',
      packages: [
        {
          relPath: 'skills/copywriting',
          packageJson: {
            name: '@alavida/value-copywriting',
            version: '1.0.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: value-copywriting
description: Root workflow.
---

\`\`\`agentpack
import kickoff from skill "@alavida/value-copywriting:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="entrypoint sub-skill"}.
`,
            'skills/kickoff/SKILL.md': `---
name: value-copywriting:kickoff
description: Kickoff the copy brief.
---

\`\`\`agentpack
\`\`\`

# Kickoff
`,
          },
        },
      ],
    });

    try {
      buildCompiledStateUseCase('skills/copywriting', { cwd: repo.root, persist: true });

      const model = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/copywriting',
      });
      assert.equal(model.selected.id, '@alavida/value-copywriting');

      // Break the authored source after the compiled state exists. Navigation should still read
      // the previously compiled graph instead of forcing a rebuild on every request.
      const brokenRootPath = join(repo.root, 'skills', 'copywriting', 'SKILL.md');
      writeFileSync(
        brokenRootPath,
        `---
name: value-copywriting
description: Broken root workflow.
---

\`\`\`agentpack
import kickoff from skill "@alavida/value-copywriting:kickoff"

Use [kickoff](skill:kickoff){context="entrypoint sub-skill"}.
`
      );

      const subskillModel = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/copywriting',
        requestedTarget: '@alavida/value-copywriting:kickoff',
      });
      assert.equal(subskillModel.selected.id, '@alavida/value-copywriting:kickoff');
    } finally {
      repo.cleanup();
    }
  });

  it('marks directly impacted sub-skills stale and the selected root affected', () => {
    const sourcePath = 'domains/platform/knowledge/commercial-model.md';
    const repo = createScenario({
      name: 'resolve-skill-dev-workbench-model-status-propagation',
      sources: {
        [sourcePath]: '# Commercial Model\n',
      },
      packages: [
        {
          relPath: 'skills/monorepo-architecture',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '1.0.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: monorepo-architecture
description: Root workflow.
---

\`\`\`agentpack
import overview from skill "@alavida/monorepo-architecture:monorepo-overview"
import authoring from skill "@alavida/monorepo-architecture:domain-authoring"
\`\`\`

Use [overview](skill:overview){context="overview dependency"}.
Use [authoring](skill:authoring){context="authoring dependency"}.
`,
            'skills/monorepo-overview/SKILL.md': `---
name: monorepo-architecture:monorepo-overview
description: Overview module.
---

\`\`\`agentpack
source commercialModel = "${sourcePath}"
\`\`\`

Ground this in [commercial model](source:commercialModel){context="primary source"}.
`,
            'skills/domain-authoring/SKILL.md': `---
name: monorepo-architecture:domain-authoring
description: Domain authoring module.
---

\`\`\`agentpack
\`\`\`

# Domain Authoring
`,
          },
        },
      ],
    });

    try {
      buildCompiledStateUseCase('skills/monorepo-architecture', { cwd: repo.root, persist: true });

      writeFileSync(join(repo.root, sourcePath), '# Commercial Model\n\nChanged.\n');

      const model = resolveSkillDevWorkbenchModel({
        repoRoot: repo.root,
        defaultTarget: 'skills/monorepo-architecture',
      });

      assert.equal(model.selected.id, '@alavida/monorepo-architecture');
      assert.equal(model.selected.status, 'affected');
      assert.match(model.selected.explanation, /commercial-model\.md/i);

      assert.equal(
        model.nodes.find((node) => node.id === '@alavida/monorepo-architecture:monorepo-overview')?.status,
        'stale'
      );
      assert.equal(
        model.nodes.find((node) => node.id === '@alavida/monorepo-architecture:domain-authoring')?.status,
        'current'
      );
      assert.equal(
        model.nodes.find((node) => node.path === sourcePath)?.status,
        'changed'
      );
    } finally {
      repo.cleanup();
    }
  });
});
