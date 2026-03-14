import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  generateBuildState,
  generateSkillsCatalog,
  inspectSkill,
  inspectSkillsEnv,
  installSkills,
  listStaleSkills,
  resolveInstallTargets,
  uninstallSkills,
} from '../packages/agentpack/src/lib/skills.js';

function parseArgs(argv) {
  const args = { repo: null, workbench: 'domains/value/workbenches/consumer/website-dev' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      args.repo = argv[index + 1] ? resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    if (arg === '--workbench') {
      args.workbench = argv[index + 1] || args.workbench;
      index += 1;
    }
  }

  if (!args.repo) {
    throw new Error('Missing required --repo <path> argument');
  }

  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.repo;
  const workbenchPath = args.workbench;
  const sourcePath = join(repoRoot, 'domains/value/knowledge/value-proposition.md');
  const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');
  const catalogPath = join(repoRoot, '.agentpack', 'catalog.json');
  const originalSource = readFileSync(sourcePath, 'utf-8');

  try {
    writeJson(catalogPath, generateSkillsCatalog({ cwd: repoRoot }));
    writeJson(buildStatePath, generateBuildState({ cwd: repoRoot }));

    const inspected = inspectSkill(
      'domains/value/workbenches/consumer/website-dev/skills/copywriting',
      { cwd: repoRoot }
    );
    assert(inspected.name === 'copywriting', 'Failed to inspect real website-dev copywriting skill');
    assert(
      inspected.requires.includes('@alavida/value-copywriting'),
      'Real website-dev copywriting skill does not declare the expected package dependency'
    );

    const targets = resolveInstallTargets({ workbench: workbenchPath, cwd: repoRoot });
    assert(targets.length === 1, `Expected exactly one direct workbench root, got ${targets.length}`);
    assert(
      targets[0].endsWith('workspace/active/architecture/intent-adoption/spike/packages/value-copywriting'),
      `Unexpected inferred root: ${targets[0]}`
    );

    const installed = installSkills(targets, { cwd: repoRoot });
    assert(installed.installs['@alavida/value-copywriting'], 'Direct skill was not installed');
    assert(
      installed.installs['@alavida/methodology-gary-provost'],
      'Transitive dependency was not installed'
    );

    const env = inspectSkillsEnv({ cwd: repoRoot });
    assert(env.installs.length === 2, `Expected 2 installed skills, got ${env.installs.length}`);

    writeFileSync(
      sourcePath,
      `${originalSource.trimEnd()}\n\n<!-- agentpack live validation marker -->\n`
    );

    const stale = listStaleSkills({ cwd: repoRoot });
    const staleCopywriting = stale.find((skill) => skill.packageName === '@alavida/value-copywriting');
    assert(staleCopywriting, 'Expected value-copywriting to become stale after a real source change');
    assert(
      staleCopywriting.changedSources.some((entry) => entry.path === 'domains/value/knowledge/value-proposition.md'),
      'Expected stale output to point at the changed real source file'
    );

    writeFileSync(sourcePath, originalSource);
    const clean = listStaleSkills({ cwd: repoRoot });
    assert(clean.length === 0, 'Stale state did not clear after restoring the source file');

    const removed = uninstallSkills('@alavida/value-copywriting', { cwd: repoRoot });
    assert(
      removed.removed.includes('@alavida/value-copywriting'),
      'Direct skill was not removed during uninstall'
    );
    assert(
      removed.removed.includes('@alavida/methodology-gary-provost'),
      'Transitive dependency was not removed during uninstall reconciliation'
    );

    const finalEnv = inspectSkillsEnv({ cwd: repoRoot });
    assert(finalEnv.installs.length === 0, 'Runtime environment was not cleaned after uninstall');

    console.log(JSON.stringify({
      ok: true,
      repo: repoRoot,
      workbench: workbenchPath,
      checks: [
        'inspect real local workbench skill',
        'infer real dependency roots',
        'install and materialize real package chain',
        'inspect runtime env',
        'detect stale after real source change',
        'uninstall and reconcile without manual cleanup',
      ],
    }, null, 2));
  } finally {
    writeFileSync(sourcePath, originalSource);
    rmSync(join(repoRoot, 'node_modules'), { recursive: true, force: true });
    rmSync(join(repoRoot, '.agentpack', 'install.json'), { force: true });
    rmSync(join(repoRoot, '.claude', 'skills'), { recursive: true, force: true });
    rmSync(join(repoRoot, '.agents', 'skills'), { recursive: true, force: true });
  }
}

main();
