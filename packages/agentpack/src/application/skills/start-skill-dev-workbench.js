import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashFile } from '../../domain/compiler/source-hash.js';
import { buildTransitiveSkillWorkbenchModel } from './build-skill-workbench-model.js';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { startSkillDevWorkbenchServer } from '../../infrastructure/runtime/skill-dev-workbench-server.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { watchSkillWorkbench } from '../../infrastructure/runtime/watch-skill-workbench.js';
import { runSkillWorkbenchAction } from './run-skill-workbench-action.js';
import { resolveSingleSkillTarget } from '../../domain/skills/skill-target-resolution.js';

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
  const compiledState = readCompiledState(repoRoot);
  if (compiledState) {
    const compiledModel = buildModelFromCompiledState(repoRoot, compiledState, targetPackageName);
    if (compiledModel) return compiledModel;
  }
  return null;
}

function explainCompiledSourceStatus(status) {
  if (status === 'changed') return 'Changed since compiled state was built';
  return 'Current against compiled state';
}

function inferDependencyName(target) {
  const [packageName, exportedName] = target.split(':');
  if (exportedName) return exportedName;
  return packageName.split('/').pop();
}

function buildModelFromCompiledState(repoRoot, compiledState, targetPackageName) {
  const selectedSkill = (compiledState.skills || []).find((skill) => skill.packageName === targetPackageName);
  if (!selectedSkill) return null;

  const changedSources = new Set();
  const sourceNodes = (compiledState.sourceFiles || []).map((sourceFile) => {
    const currentHash = hashFile(join(repoRoot, sourceFile.path));
    const changed = currentHash !== sourceFile.hash;
    if (changed) changedSources.add(sourceFile.path);

    return {
      id: `source:${sourceFile.path}`,
      type: 'source',
      path: sourceFile.path,
      status: changed ? 'changed' : 'current',
      explanation: explainCompiledSourceStatus(changed ? 'changed' : 'current'),
      depth: 0,
      usedBy: [selectedSkill.packageName],
    };
  });

  const dependencyNodes = (selectedSkill.skillImports || []).map((skillImport) => ({
    id: skillImport.target,
    type: 'dependency',
    packageName: skillImport.target,
    name: inferDependencyName(skillImport.target),
    description: null,
    version: null,
    status: 'unknown',
    explanation: 'No compiled dependency lifecycle state available yet',
    depth: 1,
  }));

  const selectedStatus = changedSources.size > 0 ? 'stale' : 'current';
  const selectedNode = {
    id: selectedSkill.packageName,
    type: 'skill',
    packageName: selectedSkill.packageName,
    name: selectedSkill.name,
    description: selectedSkill.description || null,
    version: selectedSkill.packageVersion || null,
    status: selectedStatus,
    explanation: selectedStatus === 'stale'
      ? `Stale because one or more compiled sources changed: ${[...changedSources].join(', ')}`
      : 'Current against compiled state',
    depth: 0,
  };

  const edges = [];
  for (const edge of compiledState.edges || []) {
    if (edge.kind === 'source_usage') {
      edges.push({
        source: `source:${edge.target}`,
        target: selectedSkill.packageName,
        kind: 'provenance',
      });
    }
    if (edge.kind === 'skill_usage') {
      edges.push({
        source: selectedSkill.packageName,
        target: edge.target,
        kind: 'requires',
      });
    }
  }

  return {
    selected: selectedNode,
    nodes: [...sourceNodes, selectedNode, ...dependencyNodes],
    edges,
  };
}

export async function startSkillDevWorkbench({
  repoRoot,
  skillDir,
  open = true,
  disableBrowser = false,
}) {
  const resolved = resolveSingleSkillTarget(repoRoot, skillDir, { includeInstalled: false });
  const defaultSkill = resolved.package.packageName;

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
