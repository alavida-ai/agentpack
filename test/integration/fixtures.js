/**
 * Shared fixture helpers for integration tests.
 * Creates temp repos with the full agentpack directory structure.
 */

import { lstatSync, mkdirSync, writeFileSync, rmSync, cpSync, readlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', '..', 'bin', 'agentpack.js');
const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');

function uniqueTempRoot(name) {
  return join(
    tmpdir(),
    `agentpack-${name}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/**
 * Create a temp repo with configurable agentpack structure.
 * Returns { root, cleanup }.
 */
export function createTempRepo(name = 'integration') {
  const root = uniqueTempRoot(name);
  mkdirSync(join(root, '.git'), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function createRepoFromFixture(fixtureName, name = fixtureName) {
  const root = uniqueTempRoot(name);
  cpSync(join(FIXTURES_ROOT, fixtureName), root, { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function createValidateFixture() {
  const repo = createTempRepo('skills-validate');

  mkdirSync(join(repo.root, 'domains', 'value', 'knowledge'), { recursive: true });
  writeFileSync(
    join(repo.root, 'domains', 'value', 'knowledge', 'selling-points.md'),
    '# Selling Points\n'
  );

  addPackagedSkill(repo.root, 'domains/value/skills/copywriting', {
    skillMd: `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`,
    packageJson: {
      name: '@alavida/value-copywriting',
      version: '1.2.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida/knowledge-base.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      files: ['SKILL.md'],
      dependencies: {
        '@alavida/methodology-gary-provost': '^1.0.0',
      },
    },
  });

  addPackagedSkill(repo.root, 'domains/value/methodology/gary-provost', {
    skillMd: `---
name: methodology-gary-provost
description: Human writing principles.
metadata:
  sources: []
requires: []
---

# Gary Provost
`,
    packageJson: {
      name: '@alavida/methodology-gary-provost',
      version: '1.0.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida/knowledge-base.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      files: ['SKILL.md'],
    },
  });

  return repo;
}

export function createPluginBundleFixture() {
  const repo = createTempRepo('plugin-bundle');

  addPackagedSkill(repo.root, 'packages/skills/value-proof-points', {
    skillMd: `---
name: value-proof-points
description: Evidence-backed proof points for value messaging.
metadata:
  sources: []
requires:
  - @alavida-ai/methodology-gary-provost
---

# Value Proof Points
`,
    packageJson: {
      name: '@alavida-ai/value-proof-points',
      version: '1.0.1',
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida-ai/alavida.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      files: ['SKILL.md'],
      dependencies: {
        '@alavida-ai/methodology-gary-provost': '^1.0.0',
      },
    },
  });

  addPackagedSkill(repo.root, 'packages/skills/value-copywriting', {
    skillMd: `---
name: value-copywriting
description: Messaging and copywriting guidance.
metadata:
  sources: []
requires:
  - @alavida-ai/methodology-gary-provost
---

# Value Copywriting
`,
    packageJson: {
      name: '@alavida-ai/value-copywriting',
      version: '1.0.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida-ai/alavida.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      files: ['SKILL.md'],
      dependencies: {
        '@alavida-ai/methodology-gary-provost': '^1.0.0',
      },
    },
  });

  addPackagedSkill(repo.root, 'packages/skills/methodology-gary-provost', {
    skillMd: `---
name: methodology-gary-provost
description: Sentence rhythm guidance from Gary Provost.
metadata:
  sources: []
requires: []
---

# Gary Provost
`,
    packageJson: {
      name: '@alavida-ai/methodology-gary-provost',
      version: '1.0.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida-ai/alavida.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      files: ['SKILL.md'],
    },
  });

  const pluginDir = join(repo.root, 'plugins', 'website-dev');
  mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(pluginDir, 'skills', 'proof-points'), { recursive: true });
  mkdirSync(join(pluginDir, 'skills', 'copywriting'), { recursive: true });

  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'website-dev',
        description: 'Website execution harness plugin.',
      },
      null,
      2
    ) + '\n'
  );

  writeFileSync(
    join(pluginDir, 'package.json'),
    JSON.stringify(
      {
        name: '@alavida-ai/plugin-website-dev',
        version: '0.5.0',
        publishConfig: {
          registry: 'https://npm.pkg.github.com',
        },
        devDependencies: {
          '@alavida-ai/value-copywriting': '^1.0.0',
          '@alavida-ai/value-proof-points': '^1.0.1',
        },
        files: ['.claude-plugin', 'skills'],
      },
      null,
      2
    ) + '\n'
  );

  writeFileSync(
    join(pluginDir, 'skills', 'proof-points', 'SKILL.md'),
    `---
name: proof-points
description: Use when the user needs evidence-backed proof.
metadata:
  sources: []
requires:
  - @alavida-ai/value-proof-points
---

# Proof Points
`
  );

  writeFileSync(
    join(pluginDir, 'skills', 'copywriting', 'SKILL.md'),
    `---
name: copywriting
description: Use when the user needs messaging and copywriting help.
metadata:
  sources: []
requires:
  - @alavida-ai/value-copywriting
---

# Copywriting
`
  );

  return repo;
}

/**
 * Add workspaces with .workbench markers to a temp repo.
 */
export function addWorkspaces(root, workspaces) {
  for (const ws of workspaces) {
    const wsDir = join(root, 'workspace', 'active', ws.path);
    mkdirSync(wsDir, { recursive: true });
    const lines = [];
    if (ws.workbench) lines.push(`workbench: ${ws.workbench}`);
    if (ws.domain) lines.push(`domain: ${ws.domain}`);
    if (ws.created) lines.push(`created: ${ws.created}`);
    writeFileSync(join(wsDir, '.workbench'), lines.join('\n') + '\n');
  }
}

/**
 * Add a marketplace.json and settings to a temp repo.
 */
export function addMarketplace(root, { name, plugins }) {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });

  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name, plugins })
  );
}

/**
 * Add a workbench directory with plugin.json, skills, and hooks.
 */
export function addWorkbench(root, relPath, { pluginJson, skills = [], hooksJson } = {}) {
  const wbDir = join(root, relPath);
  mkdirSync(wbDir, { recursive: true });
  writeFileSync(join(wbDir, 'workbench.json'), JSON.stringify({ primitives: {} }));

  if (pluginJson) {
    mkdirSync(join(wbDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(wbDir, '.claude-plugin', 'plugin.json'), JSON.stringify(pluginJson));
  }

  for (const skill of skills) {
    mkdirSync(join(wbDir, 'skills', skill.name), { recursive: true });
    if (skill.content) {
      writeFileSync(join(wbDir, 'skills', skill.name, 'SKILL.md'), skill.content);
    }
  }

  if (hooksJson) {
    mkdirSync(join(wbDir, 'hooks'), { recursive: true });
    writeFileSync(join(wbDir, 'hooks', 'hooks.json'), JSON.stringify(hooksJson));
  }
}

/**
 * Add a packaged skill fixture with SKILL.md and package.json.
 */
export function addPackagedSkill(root, relPath, { skillMd, packageJson }) {
  const skillDir = join(root, relPath);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
  writeFileSync(join(skillDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
}

export function addMultiSkillPackage(root, relPath, { packageJson, skills }) {
  const packageDir = join(root, relPath);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');

  for (const skill of skills) {
    const skillDir = join(packageDir, skill.path);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), skill.skillMd);
  }
}

export function createInstalledMultiSkillFixture(name = 'multi-skill') {
  const source = createTempRepo(`${name}-source`);
  const consumer = createRepoFromFixture('consumer', `${name}-consumer`);

  addPackagedSkill(source.root, 'packages/foundation-primer', {
    skillMd: `---
name: foundation-primer
description: Foundation primer.
metadata:
  sources: []
requires: []
---

# Foundation Primer
`,
    packageJson: {
      name: '@alavida-ai/foundation-primer',
      version: '1.0.0',
      files: ['SKILL.md'],
    },
  });

  addMultiSkillPackage(source.root, 'packages/prd-development', {
    packageJson: {
      name: '@alavida-ai/prd-development',
      version: '0.1.1',
      files: ['skills'],
      agentpack: {
        skills: {
          'prd-development': { path: 'skills/prd-development/SKILL.md' },
          'proto-persona': { path: 'skills/proto-persona/SKILL.md' },
          'problem-statement': { path: 'skills/problem-statement/SKILL.md' },
        },
      },
      dependencies: {
        '@alavida-ai/foundation-primer': 'file:../foundation-primer',
      },
    },
    skills: [
      {
        path: 'skills/prd-development',
        skillMd: `---
name: prd-development
description: Root workflow.
metadata:
  sources: []
requires:
  - @alavida-ai/prd-development:problem-statement
  - @alavida-ai/prd-development:proto-persona
---

# PRD Development
`,
      },
      {
        path: 'skills/proto-persona',
        skillMd: `---
name: proto-persona
description: Proto persona.
metadata:
  sources: []
requires: []
---

# Proto Persona
`,
      },
      {
        path: 'skills/problem-statement',
        skillMd: `---
name: problem-statement
description: Problem statement.
metadata:
  sources: []
requires:
  - @alavida-ai/prd-development:proto-persona
---

# Problem Statement
`,
      },
    ],
  });

  return {
    source,
    consumer,
    target: join(source.root, 'packages', 'prd-development'),
    cleanup() {
      source.cleanup();
      consumer.cleanup();
    },
  };
}

export function readPathState(pathValue) {
  try {
    const stat = lstatSync(pathValue);
    return {
      exists: true,
      isSymlink: stat.isSymbolicLink(),
      isDirectory: stat.isDirectory(),
      target: stat.isSymbolicLink() ? readlinkSync(pathValue) : null,
    };
  } catch {
    return {
      exists: false,
      isSymlink: false,
      isDirectory: false,
      target: null,
    };
  }
}

/**
 * Run the agentpack CLI with given args against a temp repo.
 * Returns { stdout, stderr, exitCode }.
 */
export function runCLI(args, { cwd, env = {} } = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, AGENTPACK_DISABLE_BROWSER: '1', ...env },
    encoding: 'utf-8',
    timeout: 10000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

export function runCLIAsync(args, { cwd, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, AGENTPACK_DISABLE_BROWSER: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export function startCLI(args, { cwd, env = {} } = {}) {
  const child = spawn('node', [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, AGENTPACK_DISABLE_BROWSER: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let closed = false;

  const closePromise = new Promise((resolve) => {
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('close', (code) => {
      closed = true;
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });

  return {
    child,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    waitForOutput(pattern, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          const combined = stdout + stderr;
          const matches = pattern instanceof RegExp
            ? pattern.test(combined)
            : combined.includes(pattern);
          if (matches) {
            clearInterval(timer);
            resolve(combined);
            return;
          }
          if (closed) {
            clearInterval(timer);
            reject(new Error(`process exited before matching output: ${combined}`));
            return;
          }
          if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`timed out waiting for output: ${combined}`));
          }
        }, 50);
      });
    },
    async stop(signal = 'SIGTERM') {
      if (!closed) child.kill(signal);
      return closePromise;
    },
  };
}

export async function runCLIJsonAsync(args, opts) {
  const result = await runCLIAsync(['--json', ...args], opts);
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return { ...result, json: null };
  }
  try {
    return { ...result, json: JSON.parse(result.stdout) };
  } catch {
    return { ...result, json: null };
  }
}

/**
 * Run the CLI with --json and parse the output.
 */
export function runCLIJson(args, opts) {
  const result = runCLI(['--json', ...args], opts);
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return { ...result, json: null };
  }
  try {
    return { ...result, json: JSON.parse(result.stdout) };
  } catch {
    return { ...result, json: null };
  }
}
