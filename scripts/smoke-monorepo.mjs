import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBuildState, generateSkillsCatalog } from '../packages/agentpack/src/lib/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    repo: null,
    inspectTarget: null,
    installTarget: null,
    touchSource: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      args.repo = argv[index + 1] ? resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }
    if (arg === '--inspect-target') {
      args.inspectTarget = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === '--install-target') {
      args.installTarget = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === '--touch-source') {
      args.touchSource = argv[index + 1] || null;
      index += 1;
    }
  }

  if (!args.repo) {
    throw new Error('Missing required --repo <path>');
  }

  if (!args.inspectTarget) {
    throw new Error('Missing required --inspect-target <path-or-package>');
  }

  if (!args.installTarget) {
    throw new Error('Missing required --install-target <path-or-package>');
  }

  return args;
}

function runCli(repoRoot, cliArgs) {
  const cliPath = join(__dirname, '..', 'bin', 'agentpack.js');
  const stdout = execFileSync('node', [cliPath, '--json', ...cliArgs], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
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
  const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');
  const catalogPath = join(repoRoot, '.agentpack', 'catalog.json');
  const touchSourcePath = args.touchSource ? join(repoRoot, args.touchSource) : null;
  const originalTouchedSource = touchSourcePath && existsSync(touchSourcePath)
    ? readFileSync(touchSourcePath, 'utf-8')
    : null;

  try {
    writeJson(catalogPath, generateSkillsCatalog({ cwd: repoRoot }));
    writeJson(buildStatePath, generateBuildState({ cwd: repoRoot }));

    const inspected = runCli(repoRoot, ['skills', 'inspect', args.inspectTarget]);
    assert(inspected.name, 'inspect did not return a skill name');
    assert(inspected.packageName, 'inspect did not return a package name');

    const validated = runCli(repoRoot, ['skills', 'validate', args.installTarget]);
    assert(validated.valid === true, 'validate did not return a valid packaged skill');
    assert(Array.isArray(validated.nextSteps), 'validate did not return nextSteps');

    const installed = runCli(repoRoot, ['skills', 'install', args.installTarget]);
    assert(installed.installs, 'install did not return install state');

    const env = runCli(repoRoot, ['skills', 'env']);
    assert(
      env.installs.some((install) => install.packageName === inspected.packageName),
      `env did not include installed package ${inspected.packageName}`
    );

    const missing = runCli(repoRoot, ['skills', 'missing']);
    assert(missing.count === 0, 'missing dependencies detected in expected-complete environment');

    const dependencies = runCli(repoRoot, ['skills', 'dependencies', inspected.packageName]);
    assert(dependencies.packageName === inspected.packageName, 'dependencies did not resolve the installed skill');

    const status = runCli(repoRoot, ['skills', 'status']);
    assert(status.installedCount >= 1, 'status did not report installed skills');

    let staleResult = null;
    if (touchSourcePath && originalTouchedSource !== null) {
      writeFileSync(
        touchSourcePath,
        `${originalTouchedSource.trimEnd()}\n\n<!-- agentpack smoke marker -->\n`
      );
      staleResult = runCli(repoRoot, ['skills', 'stale']);
      assert(staleResult.count >= 1, 'touching a source did not produce stale output');
      writeFileSync(touchSourcePath, originalTouchedSource);
    }

    const uninstalled = runCli(repoRoot, ['skills', 'uninstall', inspected.packageName]);
    assert(
      Array.isArray(uninstalled.removed) && uninstalled.removed.includes(inspected.packageName),
      'uninstall did not remove the direct skill'
    );

    console.log(JSON.stringify({
      ok: true,
      repo: repoRoot,
      inspectTarget: args.inspectTarget,
      installTarget: args.installTarget,
      packageName: inspected.packageName,
      checks: [
        'inspect',
        'validate',
        'install',
        'env',
        'missing',
        'dependencies',
        'status',
        ...(staleResult ? ['stale'] : []),
        'uninstall',
      ],
    }, null, 2));
  } finally {
    if (touchSourcePath && originalTouchedSource !== null) {
      writeFileSync(touchSourcePath, originalTouchedSource);
    }
    rmSync(join(repoRoot, 'node_modules'), { recursive: true, force: true });
    rmSync(join(repoRoot, '.agentpack', 'install.json'), { force: true });
    rmSync(join(repoRoot, '.claude', 'skills'), { recursive: true, force: true });
    rmSync(join(repoRoot, '.agents', 'skills'), { recursive: true, force: true });
  }
}

main();
