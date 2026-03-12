import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseSkillFrontmatterFile, readPackageMetadata, normalizeDisplayPath } from '../../domain/skills/skill-model.js';
import { readBuildState, compareRecordedSources } from '../../domain/skills/skill-provenance.js';
import { buildSkillGraph, buildSkillStatusMap } from '../../domain/skills/skill-graph.js';
import { buildTransitiveSkillWorkbenchModel } from './build-skill-workbench-model.js';
import { startSkillDevWorkbenchServer } from '../../infrastructure/runtime/skill-dev-workbench-server.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { watchSkillWorkbench } from '../../infrastructure/runtime/watch-skill-workbench.js';
import { runSkillWorkbenchAction } from './run-skill-workbench-action.js';

function listPackagedSkillDirs(repoRoot) {
  const stack = [repoRoot];
  const results = [];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasSkillFile = false;
    let hasPackageFile = false;

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agentpack') continue;
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.name === 'SKILL.md') hasSkillFile = true;
      if (entry.name === 'package.json') hasPackageFile = true;
    }

    if (hasSkillFile && hasPackageFile) {
      results.push(current);
    }
  }

  return results.sort();
}

function findPackageDirByName(repoRoot, packageName) {
  const stack = [repoRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.name !== 'package.json') continue;

      try {
        const pkg = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (pkg.name === packageName) return dirname(fullPath);
      } catch {
        // skip
      }
    }
  }

  const nodeModulesPath = join(repoRoot, 'node_modules', ...packageName.split('/'));
  if (existsSync(join(nodeModulesPath, 'SKILL.md'))) return nodeModulesPath;

  return null;
}

function buildModelForSkill(repoRoot, targetPackageName) {
  const packageDirs = listPackagedSkillDirs(repoRoot);
  const skillGraph = buildSkillGraph(repoRoot, packageDirs, {
    parseSkillFrontmatterFile,
    readPackageMetadata,
    findPackageDirByName: (root, name) => findPackageDirByName(root, name),
    normalizeDisplayPath,
  });

  const buildState = readBuildState(repoRoot);
  const staleSkills = new Set();
  const changedSources = new Set(); // track individual changed source paths

  for (const [packageName, record] of Object.entries(buildState.skills || buildState)) {
    if (typeof record !== 'object' || !record.sources) continue;
    try {
      const changes = compareRecordedSources(repoRoot, record);
      if (changes.length > 0) {
        staleSkills.add(packageName);
        for (const change of changes) changedSources.add(change.path);
      }
    } catch {
      // skip
    }
  }

  const statusMap = buildSkillStatusMap(skillGraph, staleSkills);

  function resolveSkillSources(packageName) {
    const graphNode = skillGraph.get(packageName);
    if (!graphNode) return [];

    const skillFilePath = join(repoRoot, graphNode.skillFile);
    try {
      const metadata = parseSkillFrontmatterFile(skillFilePath);
      return metadata.sources || [];
    } catch {
      return [];
    }
  }

  function resolveSkillRequires(packageName) {
    const graphNode = skillGraph.get(packageName);
    if (!graphNode) return [];

    const skillFilePath = join(repoRoot, graphNode.skillFile);
    try {
      const metadata = parseSkillFrontmatterFile(skillFilePath);
      return metadata.requires || [];
    } catch {
      return [];
    }
  }

  return buildTransitiveSkillWorkbenchModel({
    repoRoot,
    targetPackageName,
    skillGraph,
    statusMap,
    changedSources,
    resolveSkillSources,
    resolveSkillRequires,
  });
}

export async function startSkillDevWorkbench({
  repoRoot,
  skillDir,
  open = true,
  disableBrowser = false,
}) {
  const packageMetadata = readPackageMetadata(skillDir);
  const defaultSkill = packageMetadata.packageName;

  const server = await startSkillDevWorkbenchServer({
    buildModel: (skillPackageName) => buildModelForSkill(repoRoot, skillPackageName),
    defaultSkill,
    onAction(action) {
      return runSkillWorkbenchAction(action, {
        cwd: repoRoot,
        target: skillDir,
        packageName: defaultSkill,
      });
    },
  });

  const watcher = watchSkillWorkbench(repoRoot, skillDir, () => {
    // Model is rebuilt on each request, so no cache to invalidate
  });

  if (open && !disableBrowser) {
    openBrowser(server.url);
  }

  return {
    url: server.url,
    port: server.port,
    refresh() {
      // no-op: models are built on demand per request
    },
    close() {
      watcher.close();
      server.close();
    },
  };
}
