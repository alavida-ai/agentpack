import { join } from 'node:path';
import { parseSkillFrontmatterFile, readPackageMetadata } from '../../domain/skills/skill-model.js';
import { readBuildState, compareRecordedSources } from '../../domain/skills/skill-provenance.js';
import { buildSkillWorkbenchModel } from './build-skill-workbench-model.js';
import { startSkillDevWorkbenchServer } from '../../infrastructure/runtime/skill-dev-workbench-server.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { watchSkillWorkbench } from '../../infrastructure/runtime/watch-skill-workbench.js';
import { runSkillWorkbenchAction } from './run-skill-workbench-action.js';

function getSelectedSkillStatus(repoRoot, packageName) {
  const state = readBuildState(repoRoot);
  const record = state.skills?.[packageName] || state[packageName];
  if (!record) return 'unknown';
  return compareRecordedSources(repoRoot, record).length > 0 ? 'stale' : 'current';
}

export function buildCurrentSkillWorkbenchModel(repoRoot, skillDir) {
  const metadata = parseSkillFrontmatterFile(join(skillDir, 'SKILL.md'));
  const packageMetadata = readPackageMetadata(skillDir);
  const selectedStatus = packageMetadata.packageName
    ? getSelectedSkillStatus(repoRoot, packageMetadata.packageName)
    : 'unknown';

  return buildSkillWorkbenchModel({
    repoRoot,
    selectedSkill: {
      name: metadata.name,
      packageName: packageMetadata.packageName || metadata.name,
      skillFile: join(skillDir, 'SKILL.md'),
      sources: metadata.sources,
      requires: metadata.requires,
    },
    dependencyRecords: metadata.requires.map((packageName) => ({
      packageName,
      status: 'unknown',
    })),
    sourceStatuses: new Map(
      metadata.sources.map((source) => [source, selectedStatus === 'stale' ? 'changed' : 'current'])
    ),
    selectedStatus,
  });
}

export async function startSkillDevWorkbench({
  repoRoot,
  skillDir,
  open = true,
  disableBrowser = false,
}) {
  const initialModel = buildCurrentSkillWorkbenchModel(repoRoot, skillDir);
  const server = await startSkillDevWorkbenchServer({
    model: initialModel,
    onAction(action) {
      return runSkillWorkbenchAction(action, {
        cwd: repoRoot,
        target: skillDir,
        packageName: initialModel.selected.packageName,
      });
    },
  });
  const watcher = watchSkillWorkbench(repoRoot, skillDir, () => {
    server.updateModel(buildCurrentSkillWorkbenchModel(repoRoot, skillDir));
  });

  if (open && !disableBrowser) {
    openBrowser(server.url);
  }

  return {
    url: server.url,
    port: server.port,
    refresh() {
      server.updateModel(buildCurrentSkillWorkbenchModel(repoRoot, skillDir));
    },
    close() {
      watcher.close();
      server.close();
    },
  };
}
