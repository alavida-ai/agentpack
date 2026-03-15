import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

function uniqueTempRoot(name) {
  return join(
    tmpdir(),
    `agentpack-${name}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function createTempRepo(name = 'scenario') {
  const root = uniqueTempRoot(name);
  mkdirSync(join(root, '.git'), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function ensureParentDir(pathValue) {
  mkdirSync(dirname(pathValue), { recursive: true });
}

function writeJson(pathValue, value) {
  ensureParentDir(pathValue);
  writeFileSync(pathValue, JSON.stringify(value, null, 2) + '\n');
}

function writeText(pathValue, value) {
  ensureParentDir(pathValue);
  writeFileSync(pathValue, value);
}

export function createScenario({
  name = 'scenario',
  sources = {},
  files = {},
  packages = [],
  adapterDirs = ['.claude/skills', '.agents/skills'],
} = {}) {
  const repo = createTempRepo(name);

  mkdirSync(join(repo.root, '.agentpack'), { recursive: true });
  for (const adapterDir of adapterDirs) {
    mkdirSync(join(repo.root, adapterDir), { recursive: true });
  }

  for (const [sourcePath, content] of Object.entries(sources)) {
    writeText(join(repo.root, sourcePath), content);
  }

  for (const [filePath, content] of Object.entries(files)) {
    writeText(join(repo.root, filePath), content);
  }

  for (const pkg of packages) {
    const packageDir = join(repo.root, pkg.relPath);
    mkdirSync(packageDir, { recursive: true });

    if (pkg.packageJson) {
      writeJson(join(packageDir, 'package.json'), pkg.packageJson);
    }

    if (typeof pkg.skillMd === 'string') {
      writeText(join(packageDir, 'SKILL.md'), pkg.skillMd);
      continue;
    }

    for (const [filePath, content] of Object.entries(pkg.files || {})) {
      writeText(join(packageDir, filePath), content);
    }

    for (const skill of pkg.skills || []) {
      writeText(join(packageDir, skill.path, 'SKILL.md'), skill.skillMd);
    }
  }

  return repo;
}

export function readCompiledState(repoRoot) {
  const compiledPath = join(repoRoot, '.agentpack', 'compiled.json');
  if (!existsSync(compiledPath)) return null;
  return JSON.parse(readFileSync(compiledPath, 'utf-8'));
}

export function readMaterializationState(repoRoot) {
  const materializationPath = join(repoRoot, '.agentpack', 'materialization-state.json');
  if (!existsSync(materializationPath)) return null;
  return JSON.parse(readFileSync(materializationPath, 'utf-8'));
}

export function assertGraphEdge(compiledState, expected) {
  assert.ok(compiledState, 'compiled state is required');
  const match = (compiledState.edges || []).find((edge) => (
    edge.source === expected.source
    && edge.target === expected.target
    && (expected.kind === undefined || edge.kind === expected.kind)
  ));
  assert.ok(
    match,
    `expected compiled graph edge ${JSON.stringify(expected)} in ${JSON.stringify(compiledState.edges || [])}`
  );
}
