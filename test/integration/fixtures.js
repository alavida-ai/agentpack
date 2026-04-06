/**
 * Shared fixture helpers for integration tests.
 * Creates temp repos with the full agentpack directory structure.
 */

import { lstatSync, mkdirSync, writeFileSync, rmSync, cpSync, readlinkSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export {
  assertGraphEdge,
  createScenario,
  readCompiledState,
  readMaterializationState,
} from './scenario-builder.js';

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
---

\`\`\`agentpack
source sellingPoints = "domains/value/knowledge/selling-points.md"
\`\`\`

Ground this in [selling points](source:sellingPoints){context="primary source material for value messaging"}.
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
      dependencies: {},
    },
  });

  addPackagedSkill(repo.root, 'domains/value/methodology/gary-provost', {
    skillMd: `---
name: methodology-gary-provost
description: Human writing principles.
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
 * Add a packaged skill fixture with SKILL.md and package.json.
 */
export function addPackagedSkill(root, relPath, { skillMd, packageJson }) {
  const skillDir = join(root, relPath);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), ensureAgentpackBlock(skillMd));
  writeFileSync(join(skillDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
}

export function addMultiSkillPackage(root, relPath, { packageJson, rootSkillMd = null, skills }) {
  const packageDir = join(root, relPath);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  if (typeof rootSkillMd === 'string') {
    writeFileSync(join(packageDir, 'SKILL.md'), ensureAgentpackBlock(rootSkillMd));
  }

  for (const skill of skills) {
    const skillDir = join(packageDir, skill.path);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), ensureAgentpackBlock(skill.skillMd));
  }
}

function ensureAgentpackBlock(skillMd) {
  if (skillMd.includes('```agentpack')) {
    return skillMd;
  }

  return `${skillMd.trim()}\n\n\`\`\`agentpack\n\`\`\`\n`;
}

export function createInstalledMultiSkillFixture(name = 'multi-skill') {
  const source = createTempRepo(`${name}-source`);
  const consumer = createRepoFromFixture('consumer', `${name}-consumer`);

  addPackagedSkill(source.root, 'packages/foundation-primer', {
    skillMd: `---
name: foundation-primer
description: Foundation primer.
---

\`\`\`agentpack
\`\`\`

# Foundation Primer
`,
    packageJson: {
      name: '@alavida-ai/foundation-primer',
      version: '1.0.0',
      files: ['dist'],
    },
  });

  addMultiSkillPackage(source.root, 'packages/prd-development', {
    packageJson: {
      name: '@alavida-ai/prd-development',
      version: '0.1.1',
      files: ['dist'],
      dependencies: {
        '@alavida-ai/foundation-primer': 'file:../foundation-primer',
      },
    },
    rootSkillMd: `---
name: prd-development
description: Root workflow.
---

\`\`\`agentpack
import { problem-statement as problemStatement, proto-persona as protoPersona } from skill "@alavida-ai/prd-development"
\`\`\`

Use [problem statement](skill:problemStatement){context="subskill dependency for defining the problem"}.
Use [proto persona](skill:protoPersona){context="subskill dependency for defining the user"}.
`,
    skills: [
      {
        path: 'skills/proto-persona',
        skillMd: `---
name: prd-development:proto-persona
description: Proto persona.
---

\`\`\`agentpack
import foundationPrimer from skill "@alavida-ai/foundation-primer"
\`\`\`

Use [foundation primer](skill:foundationPrimer){context="supporting methodology dependency"}.
`,
      },
      {
        path: 'skills/problem-statement',
        skillMd: `---
name: prd-development:problem-statement
description: Problem statement.
---

\`\`\`agentpack
import { proto-persona as protoPersona } from skill "@alavida-ai/prd-development"
\`\`\`

Use [proto persona](skill:protoPersona){context="subskill dependency for refining the problem framing"}.
`,
      },
    ],
  });

  const foundationBuild = runCLIJson(['author', 'build', 'packages/foundation-primer'], { cwd: source.root });
  if (foundationBuild.exitCode !== 0) {
    throw new Error(`Failed to build fixture package foundation-primer: ${foundationBuild.stderr || foundationBuild.stdout}`);
  }

  const prdBuild = runCLIJson(['author', 'build', 'packages/prd-development'], { cwd: source.root });
  if (prdBuild.exitCode !== 0) {
    throw new Error(`Failed to build fixture package prd-development: ${prdBuild.stderr || prdBuild.stdout}`);
  }

  return {
    source,
    consumer,
    target: join(source.root, 'packages', 'prd-development'),
    dependencyTarget: join(source.root, 'packages', 'foundation-primer'),
    cleanup() {
      source.cleanup();
      consumer.cleanup();
    },
  };
}

export function createAuthoredMultiSkillFixture(name = 'authored-multi-skill') {
  const repo = createTempRepo(name);

  mkdirSync(join(repo.root, 'domains', 'planning', 'knowledge'), { recursive: true });
  writeFileSync(join(repo.root, 'domains', 'planning', 'knowledge', 'kickoff.md'), '# Kickoff\n');
  writeFileSync(join(repo.root, 'domains', 'planning', 'knowledge', 'recap.md'), '# Recap\n');

  addMultiSkillPackage(repo.root, 'workbenches/planning-kit', {
    packageJson: {
      name: '@alavida-ai/planning-kit',
      version: '0.1.0',
      files: ['SKILL.md', 'skills'],
      repository: {
        type: 'git',
        url: 'git+https://github.com/alavida-ai/agentpack.git',
      },
      publishConfig: {
        registry: 'https://npm.pkg.github.com',
      },
      agentpack: {
        root: 'skills',
      },
    },
    rootSkillMd: `---
name: planning-kit
description: Primary planning package skill.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="primary package entrypoint delegates to the kickoff workflow"}.
`,
    skills: [
      {
        path: 'skills/kickoff',
        skillMd: `---
name: planning-kit:kickoff
description: Plan the kickoff.
---

\`\`\`agentpack
source kickoffSource = "domains/planning/knowledge/kickoff.md"
\`\`\`

Use [the kickoff source](source:kickoffSource){context="source material for kickoff planning"}.
`,
      },
      {
        path: 'skills/recap',
        skillMd: `---
name: planning-kit:recap
description: Plan the recap.
---

\`\`\`agentpack
source recapSource = "domains/planning/knowledge/recap.md"
\`\`\`

Use [the recap source](source:recapSource){context="source material for recap planning"}.
`,
      },
    ],
  });

  return repo;
}

export function createAuthoredPluginBundleFixture(name = 'authored-plugin-bundle') {
  const repo = createTempRepo(name);

  mkdirSync(join(repo.root, 'domains', 'design', 'knowledge'), { recursive: true });
  writeFileSync(join(repo.root, 'domains', 'design', 'knowledge', 'guidelines.md'), '# Guidelines\n');
  writeFileSync(join(repo.root, 'domains', 'design', 'knowledge', 'dashboard.md'), '# Dashboard\n');
  mkdirSync(join(repo.root, 'plugins', 'dashboard-plugin', '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(repo.root, 'plugins', 'dashboard-plugin', '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'dashboard-plugin',
        version: '0.1.0',
        skills: './skills',
      },
      null,
      2
    ) + '\n'
  );

  addPackagedSkill(repo.root, 'skills/foundation-primer', {
    skillMd: `---
name: foundation-primer
description: Foundation primer.
---

\`\`\`agentpack
source guidelines = "domains/design/knowledge/guidelines.md"
\`\`\`

Use [guidelines](source:guidelines){context="foundation guidance"}.
`,
    packageJson: {
      name: '@alavida-ai/foundation-primer',
      version: '1.0.0',
      files: ['SKILL.md'],
    },
  });

  addPackagedSkill(repo.root, 'workbenches/dashboard-creator', {
    skillMd: `---
name: dashboard-creator
description: Dashboard creation workflow.
---

\`\`\`agentpack
import foundationPrimer from skill "@alavida-ai/foundation-primer"
source dashboard = "domains/design/knowledge/dashboard.md"
\`\`\`

Use [foundation primer](skill:foundationPrimer){context="shared design system guidance"}.
Use [dashboard brief](source:dashboard){context="dashboard-specific source material"}.
`,
    packageJson: {
      name: '@alavida-ai/dashboard-creator',
      version: '1.0.0',
      files: ['SKILL.md', 'scripts', 'lib', 'data'],
      dependencies: {
        '@alavida-ai/foundation-primer': '*',
      },
    },
  });
  mkdirSync(join(repo.root, 'workbenches', 'dashboard-creator', 'scripts'), { recursive: true });
  mkdirSync(join(repo.root, 'workbenches', 'dashboard-creator', 'lib'), { recursive: true });
  mkdirSync(join(repo.root, 'workbenches', 'dashboard-creator', 'data'), { recursive: true });
  writeFileSync(
    join(repo.root, 'workbenches', 'dashboard-creator', 'scripts', 'project.ts'),
    'export function listProjects() { return ["demo"]; }\n'
  );
  writeFileSync(
    join(repo.root, 'workbenches', 'dashboard-creator', 'lib', 'client.ts'),
    'export const client = { name: "demo" };\n'
  );
  writeFileSync(
    join(repo.root, 'workbenches', 'dashboard-creator', 'data', 'config.json'),
    '{\n  "mode": "demo"\n}\n'
  );

  return repo;
}

export function createAuthorPluginSyncFixture(name = 'author-plugin-sync') {
  const repo = createAuthoredPluginBundleFixture(name);
  return {
    ...repo,
    pluginDir: join(repo.root, 'plugins', 'dashboard-plugin'),
    packageDir: join(repo.root, 'workbenches', 'dashboard-creator'),
    makePluginSkillsSymlink() {
      symlinkSync('../../workbenches/dashboard-creator/dist', join(repo.root, 'plugins', 'dashboard-plugin', 'skills'));
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
export function runCLI(args, { cwd, env = {}, timeoutMs = 10000 } = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, AGENTPACK_DISABLE_BROWSER: '1', ...env },
    encoding: 'utf-8',
    timeout: timeoutMs,
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

export function runNpm(args, { cwd, env = {}, timeoutMs = 20000 } = {}) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const finalArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, finalArgs, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}
