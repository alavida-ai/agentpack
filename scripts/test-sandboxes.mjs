import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const cliPath = join(repoRoot, 'bin', 'agentpack.js');

const defaultSandboxes = {
  agonda: {
    root: '/Users/alexandergirardet/alavida/agonda/.worktrees/agentpack-compiler-sandbox',
    inspectTarget: '@alavida/agonda-cli',
    buildTarget: '@alavida/agonda-cli',
    devTarget: 'skills/agonda-cli',
    expectText: 'agonda-cli',
  },
  superpowers: {
    root: '/Users/alexandergirardet/alavida/superpowers/.worktrees/agentpack-compiler-sandbox',
    inspectTarget: '@alavida/subagent-driven-development',
    buildTarget: '@alavida/subagent-driven-development',
    devTarget: 'skills/subagent-driven-development',
    expectText: 'subagent-driven-development',
  },
};

function parseArgs(argv) {
  const args = {
    agonda: process.env.AGENTPACK_SANDBOX_AGONDA || defaultSandboxes.agonda.root,
    superpowers: process.env.AGENTPACK_SANDBOX_SUPERPOWERS || defaultSandboxes.superpowers.root,
    noBrowserChecks: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--agonda') {
      args.agonda = argv[index + 1] ? resolve(argv[index + 1]) : args.agonda;
      index += 1;
      continue;
    }
    if (arg === '--superpowers') {
      args.superpowers = argv[index + 1] ? resolve(argv[index + 1]) : args.superpowers;
      index += 1;
      continue;
    }
    if (arg === '--no-browser-checks') {
      args.noBrowserChecks = true;
    }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCliJson(cwd, cliArgs) {
  const stdout = execFileSync('node', [cliPath, '--json', ...cliArgs], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

async function waitForWorkbench(child) {
  let output = '';

  return await new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for workbench URL.\nOutput:\n${output}`));
    }, 15000);

    function onData(chunk) {
      output += chunk.toString();
      const match = output.match(/Workbench URL:\s+(http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolvePromise({ url: match[1], output });
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      rejectPromise(new Error(`skills dev exited before exposing a workbench URL (code ${code}).\nOutput:\n${output}`));
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
  });
}

async function checkWorkbench(url, expectedText) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    const nodeCount = await page.locator('[data-node-id]').count();
    const text = await page.locator('body').innerText();
    assert(nodeCount > 0, `Expected workbench at ${url} to render graph nodes`);
    assert(text.includes(expectedText), `Expected workbench at ${url} to contain ${expectedText}`);
    return { url, nodeCount };
  } finally {
    await browser.close();
  }
}

async function runDevCheck(cwd, target, expectedText, { noBrowserChecks = false } = {}) {
  const child = spawn('node', [cliPath, 'skills', 'dev', target], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    const { url } = await waitForWorkbench(child);
    if (noBrowserChecks) return { url, nodeCount: null };
    return await checkWorkbench(url, expectedText);
  } finally {
    child.kill('SIGINT');
    await new Promise((resolvePromise) => child.on('exit', () => resolvePromise()));
  }
}

async function runSandbox(label, config, options) {
  assert(existsSync(config.root), `${label} sandbox not found: ${config.root}`);

  const validate = runCliJson(config.root, ['skills', 'validate']);
  assert(validate.valid === true, `${label} validate failed`);
  assert(validate.count >= 1, `${label} validate returned no skills`);

  const inspect = runCliJson(config.root, ['skills', 'inspect', config.inspectTarget]);
  assert(inspect.name, `${label} inspect did not return a skill name`);

  const build = runCliJson(config.root, ['skills', 'build', config.buildTarget]);
  assert(build.rootSkill, `${label} build did not return a compiled root skill`);

  const materialize = runCliJson(config.root, ['skills', 'materialize']);
  assert(materialize.adapterCount >= 1, `${label} materialize did not emit adapters`);

  const status = runCliJson(config.root, ['skills', 'status']);
  assert(status.health, `${label} status did not return health`);

  const stale = runCliJson(config.root, ['skills', 'stale']);
  assert(typeof stale.count === 'number', `${label} stale did not return a count`);

  const missing = runCliJson(config.root, ['skills', 'missing', config.devTarget]);
  assert(typeof missing.count === 'number', `${label} missing did not return a count`);

  const env = runCliJson(config.root, ['skills', 'env']);
  assert(Array.isArray(env.installs), `${label} env did not return installs`);

  const dev = await runDevCheck(config.root, config.devTarget, config.expectText, options);

  return {
    validateCount: validate.count,
    inspectTarget: config.inspectTarget,
    rootSkill: build.rootSkill,
    adapterCount: materialize.adapterCount,
    health: status.health,
    staleCount: stale.count,
    missingCount: missing.count,
    workbench: dev,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = {
    ok: true,
    sandboxes: {},
  };

  summary.sandboxes.agonda = await runSandbox(
    'agonda',
    { ...defaultSandboxes.agonda, root: args.agonda },
    { noBrowserChecks: args.noBrowserChecks }
  );
  summary.sandboxes.superpowers = await runSandbox(
    'superpowers',
    { ...defaultSandboxes.superpowers, root: args.superpowers },
    { noBrowserChecks: args.noBrowserChecks }
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
