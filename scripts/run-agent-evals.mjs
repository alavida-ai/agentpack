#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { getScenario, listScenarios } from './agent-eval/scenarios.js';
import { createSyntheticRepo } from './agent-eval/create-synthetic-repo.mjs';
import { prepareSandbox } from './agent-eval/prepare-sandbox.mjs';
import { runClaudeCode } from './agent-eval/run-claude-code.mjs';
import { gradeRun } from './agent-eval/grade-run.mjs';
import { redactSecrets, collectSecrets } from './agent-eval/redact-secrets.mjs';
import { runBrowserChecks } from './agent-eval/run-browser-checks.mjs';
import { writeResultBundle } from './agent-eval/write-result-bundle.mjs';
import { uploadLocalRepoToSandbox } from './agent-eval/upload-local-repo.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  for (const scenario of listScenarios()) {
    process.stdout.write(`${scenario.id}\t${scenario.title}\n`);
  }
  process.exit(0);
}

if (!args.scenario) {
  console.error('Missing required --scenario <id>');
  process.exit(1);
}

const scenario = getScenario(args.scenario);
const runId = args.runId ?? randomUUID();

if (args.dryRun) {
  process.stdout.write(
    JSON.stringify(
      {
        mode: 'dry-run',
        runId,
        scenario,
        willUseSandbox: true,
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(0);
}

const sandboxPrep = await prepareSandbox({
  scenario,
  runId,
});

const commandLog = [];
let bundlePath;
let localRepoFixture = null;
let workbenchHandle = null;
let browserDesktop = null;

try {
  const taskRepo = await resolveTaskRepo(scenario, process.env);
  localRepoFixture = taskRepo.cleanup ? taskRepo : null;
  const taskRepoPath = taskRepo.path;
  await uploadLocalRepoToSandbox({
    localRoot: taskRepoPath,
    remoteRoot: sandboxPrep.paths.taskRepo,
    sandbox: sandboxPrep.sandbox,
  });
  await uploadLocalRepoToSandbox({
    localRoot: process.cwd(),
    remoteRoot: sandboxPrep.paths.toolRoot,
    sandbox: sandboxPrep.sandbox,
  });

  await runSandboxCommand({
    sandbox: sandboxPrep.sandbox,
    commandLog,
    command: [
      `cd ${sandboxPrep.paths.taskRepo}`,
      'if [ ! -d .git ]; then',
      '  git init -q',
      '  git config user.name "Agentpack Eval"',
      '  git config user.email "agentpack-eval@example.com"',
      '  git add -A',
      '  git commit -qm "sandbox snapshot" || true',
      'fi',
    ].join('\n'),
    cwd: sandboxPrep.paths.taskRepo,
    env: sandboxPrep.auth.env,
  });

  for (const command of sandboxPrep.bootstrapCommands) {
    await runSandboxCommand({
      sandbox: sandboxPrep.sandbox,
      commandLog,
      command,
      cwd: sandboxPrep.paths.root,
      env: sandboxPrep.auth.env,
    });
  }

  await runSandboxCommand({
    sandbox: sandboxPrep.sandbox,
    commandLog,
    command: `cd ${sandboxPrep.paths.toolRoot} && npm install && npm install -g @anthropic-ai/claude-code ./packages/agentpack`,
    cwd: sandboxPrep.paths.toolRoot,
    env: sandboxPrep.auth.env,
  });

  const authStatusResult = await runSandboxCommand({
    sandbox: sandboxPrep.sandbox,
    commandLog,
    command: 'claude auth status --json',
    cwd: sandboxPrep.paths.root,
    env: sandboxPrep.auth.env,
  });
  const authStatus = parseJson(authStatusResult.stdout, 'claude auth status');

  await runSandboxCommand({
    sandbox: sandboxPrep.sandbox,
    commandLog,
    command: 'agentpack skills --help >/dev/null',
    cwd: sandboxPrep.paths.taskRepo,
    env: sandboxPrep.auth.env,
  });

  let browserRuntime = null;
  const checkpointObservations = [];
  if (scenario.browser.required) {
    browserRuntime = await startWorkbenchForScenario({
      scenario,
      sandbox: sandboxPrep.sandbox,
      taskRepoPath: sandboxPrep.paths.taskRepo,
      authEnv: sandboxPrep.auth.env,
      commandLog,
    });
    workbenchHandle = browserRuntime.handle;
    checkpointObservations.push(
      `The local workbench is running at ${browserRuntime.publicUrl}.`,
      `You can inspect its graph API at ${browserRuntime.publicUrl}/api/model.`,
    );
  }

  const run = await runClaudeCode({
    scenario,
    cwd: sandboxPrep.paths.taskRepo,
    checkpointObservations,
    commandRunner: (command, options) =>
      runSandboxCommand({
        sandbox: sandboxPrep.sandbox,
        commandLog,
        command,
        cwd: options.cwd,
        env: sandboxPrep.auth.env,
        timeoutMs: scenario.budget.maxMinutes * 60 * 1000,
      }),
  });

  await ensureSandboxReports({
    sandbox: sandboxPrep.sandbox,
    paths: sandboxPrep.paths,
    authEnv: sandboxPrep.auth.env,
    scenario,
    run,
    commandLog,
  });

  const browserArtifacts = browserRuntime
    ? await collectBrowserArtifacts({
      sandbox: sandboxPrep.sandbox,
      desktop: browserDesktop ??= await createBrowserDesktop(sandboxPrep),
      scenario,
      browserRuntime,
      resultRoot: sandboxPrep.paths.resultRoot,
    })
    : { browser: [], screenshots: [], extraFiles: [] };

  const collected = await collectSandboxArtifacts({
    sandbox: sandboxPrep.sandbox,
    resultRoot: sandboxPrep.paths.resultRoot,
    browserArtifacts,
  });

  const grader = gradeRun({
    run,
    learningLog: collected.learningLog,
    report: collected.report,
  });

  const secrets = collectSecrets({ env: process.env, auth: sandboxPrep.auth });

  bundlePath = await writeResultBundle({
    runId,
    scenario,
    sandbox: redactSecrets({
      provider: 'e2b',
      sandboxId: sandboxPrep.sandbox.sandboxId,
      authStatus,
    }, secrets),
    transcript: redactSecrets(run.transcript, secrets),
    commands: redactSecrets(commandLog, secrets),
    browser: redactSecrets(collected.browser, secrets),
    learningLog: redactSecrets(collected.learningLog, secrets),
    grader,
    report: redactSecrets(collected.report, secrets),
    reportMarkdown: redactSecrets(collected.reportMarkdown, secrets),
    summary: redactSecrets(collected.summaryMarkdown, secrets),
    screenshots: collected.screenshots,
    fileDiff: redactSecrets(collected.fileDiff, secrets),
    extraFiles: redactSecrets(collected.extraFiles, secrets),
  });

  process.stdout.write(
    JSON.stringify(
      {
        mode: 'live',
        runId,
        bundlePath,
        objectiveStatus: grader.objectiveCompletion.status,
        friction: grader.productFriction.rating,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (workbenchHandle?.kill) {
    await workbenchHandle.kill().catch(() => {});
  }
  if (browserDesktop?.kill) {
    await browserDesktop.kill().catch(() => {});
  }
  localRepoFixture?.cleanup?.();
  if (process.env.AGENTPACK_KEEP_E2B_SANDBOX !== '1') {
    await sandboxPrep.sandbox.kill().catch(() => {});
  }
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    list: false,
    scenario: null,
    runId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--list') {
      parsed.list = true;
      continue;
    }
    if (arg === '--scenario') {
      parsed.scenario = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--run-id') {
      parsed.runId = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

async function resolveTaskRepo(scenario, env) {
  switch (scenario.repo.source) {
    case 'synthetic': {
      const repo = await createSyntheticRepo(scenario.repo.fixture);
      return {
        path: repo.root,
        cleanup: repo.cleanup,
      };
    }
    case 'agonda':
      return {
        path: env[scenario.repo.defaultPathEnv]
          ?? '/Users/alexandergirardet/alavida/agonda/.worktrees/agentpack-compiler-sandbox',
      };
    case 'superpowers':
      return {
        path: env[scenario.repo.defaultPathEnv]
          ?? '/Users/alexandergirardet/alavida/superpowers/.worktrees/agentpack-compiler-sandbox',
      };
    default:
      throw new Error(`Live agent evals for repo source "${scenario.repo.source}" are not implemented yet`);
  }
}

async function runSandboxCommand({
  sandbox,
  commandLog,
  command,
  cwd,
  env,
  timeoutMs = 0,
  onStdout,
  onStderr,
}) {
  const startedAt = new Date().toISOString();
  const handle = await sandbox.commands.start(command, {
    cwd,
    envs: env,
    timeoutMs,
    onStdout,
    onStderr,
  });
  const result = await handle.wait();
  commandLog.push({
    ts: startedAt,
    command,
    cwd,
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(
      `sandbox command failed: ${command}\n${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
    );
  }
  return result;
}

async function collectSandboxArtifacts({ sandbox, resultRoot, browserArtifacts = { browser: [], screenshots: [], extraFiles: [] } }) {
  const learningLog = await readNdjsonIfExists(sandbox, `${resultRoot}/learning-log.ndjson`);
  const reportMarkdown = await readTextIfExists(sandbox, `${resultRoot}/report.md`);
  const report = (await readJsonIfExists(sandbox, `${resultRoot}/report.json`))
    ?? buildFallbackReportFromMarkdown(reportMarkdown, learningLog);
  const summaryMarkdown =
    (await readTextIfExists(sandbox, `${resultRoot}/summary.md`))
    ?? buildFallbackSummaryMarkdown(report);
  const fileDiff = await readTextIfExists(sandbox, `${resultRoot}/file-diff.patch`);
  const claudeDebugLog = await readTextIfExists(sandbox, `${resultRoot}/claude-debug.log`);

  return {
    learningLog,
    report,
    reportMarkdown:
      reportMarkdown ?? buildFallbackReportMarkdown(report),
    summaryMarkdown,
    fileDiff: fileDiff ?? '',
    browser: browserArtifacts.browser,
    screenshots: browserArtifacts.screenshots,
    extraFiles: claudeDebugLog
      ? [...browserArtifacts.extraFiles, { path: 'logs/claude-debug.log', data: claudeDebugLog }]
      : browserArtifacts.extraFiles,
  };
}

async function ensureSandboxReports({ sandbox, paths, authEnv, scenario, run, commandLog }) {
  const reportPath = `${paths.resultRoot}/report.json`;
  if (await sandbox.files.exists(reportPath)) {
    return;
  }

  const handoff = {
    scenarioId: scenario.id,
    title: scenario.title,
    objectivePrompt: scenario.task.prompt,
    successCriteria: scenario.task.successCriteria,
    commandSummary: commandLog.map((entry) => ({
      command: entry.command,
      exitCode: entry.exitCode,
      stdout: truncate(entry.stdout, 1200),
      stderr: truncate(entry.stderr, 1200),
    })),
    transcriptTail: run.transcript.slice(-40),
  };

  await sandbox.files.write(
    `${paths.resultRoot}/controller-handoff.json`,
    JSON.stringify(handoff, null, 2),
  );

  await runClaudeCode({
    scenario: {
      id: `${scenario.id}:report-only`,
      task: {
        prompt:
          'Read `/workspace/eval-results/controller-handoff.json` and `/workspace/eval-results/learning-log.ndjson` if present. Then write `/workspace/eval-results/report.md`, `/workspace/eval-results/report.json`, and `/workspace/eval-results/summary.md`. Do not do anything else.',
        successCriteria: [
          'report.md is written',
          'report.json is written',
          'summary.md is written',
        ],
      },
      agentConfig: {
        model: 'sonnet',
        effort: 'low',
        maxTurns: 4,
        allowedTools: ['Read', 'Write', 'Bash'],
      },
    },
    cwd: paths.taskRepo,
    commandRunner: (command, options) =>
      runSandboxCommand({
        sandbox,
        commandLog,
        command,
        cwd: options.cwd,
        env: authEnv,
        timeoutMs: 2 * 60 * 1000,
      }),
  });
}

async function readTextIfExists(sandbox, path) {
  if (!(await sandbox.files.exists(path))) {
    return null;
  }
  return sandbox.files.read(path);
}

async function readJsonIfExists(sandbox, path) {
  const text = await readTextIfExists(sandbox, path);
  if (!text) {
    return null;
  }
  return parseJson(text, path);
}

async function readNdjsonIfExists(sandbox, path) {
  const text = await readTextIfExists(sandbox, path);
  if (!text) {
    return [];
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJson(line, path));
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`failed to parse ${label}: ${error.message}`);
  }
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function buildFallbackReport(learningLog) {
  return {
    outcome: 'unknown',
    confidence: 0,
    summary:
      learningLog.length > 0
        ? 'The agent completed the run without writing a final report. Review the learning log.'
        : 'The agent completed the run without writing structured feedback artifacts.',
    pain_points: learningLog.filter((entry) => entry.kind === 'pain_point' || entry.kind === 'wrong_turn'),
    learnings: learningLog.filter((entry) => entry.kind === 'learning').map((entry) => entry.note).filter(Boolean),
    helpful_things: [],
  };
}

function buildFallbackReportFromMarkdown(reportMarkdown, learningLog) {
  if (!reportMarkdown) {
    return buildFallbackReport(learningLog);
  }

  const lines = reportMarkdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const outcomeLine = lines.find((line) => line.toLowerCase().startsWith('**success**') || line.toLowerCase().startsWith('**failure**'));
  const outcome = outcomeLine?.toLowerCase().includes('success') ? 'success' : 'unknown';
  const summary = lines.find((line) => !line.startsWith('#') && !line.startsWith('- ') && !line.match(/^\d+\./))
    ?? 'Agent-authored markdown report captured without structured JSON.';

  return {
    outcome,
    confidence: 0,
    summary,
    pain_points: learningLog.filter((entry) => entry.kind === 'pain_point' || entry.kind === 'wrong_turn'),
    learnings: learningLog.filter((entry) => entry.kind === 'learning').map((entry) => entry.note).filter(Boolean),
    helpful_things: [],
  };
}

function buildFallbackReportMarkdown(report) {
  return [
    '# Agentpack Eval Report',
    '',
    '## Outcome',
    report.summary || 'No final markdown report was produced by the agent.',
    '',
    '## Pain Points',
    ...(report.pain_points?.length
      ? report.pain_points.map((point, index) => `${index + 1}. ${point.note ?? point.what_was_confusing ?? 'Unspecified pain point'}`)
      : ['No structured pain points were recorded.']),
    '',
  ].join('\n');
}

function buildFallbackSummaryMarkdown(report) {
  return ['# Run Summary', '', report.summary || 'No summary generated.'].join('\n');
}

async function startWorkbenchForScenario({
  scenario,
  sandbox,
  taskRepoPath,
  authEnv,
  commandLog,
}) {
  const devTarget = scenario.repo.devTarget;
  if (!devTarget) {
    throw new Error(`browser-required scenario ${scenario.id} is missing repo.devTarget`);
  }

  let output = '';
  let resolved;
  const command = `AGENTPACK_DISABLE_BROWSER=1 agentpack skills dev ${shellQuote(devTarget)}`;
  const startedAt = new Date().toISOString();
  const handle = await sandbox.commands.start(command, {
    cwd: taskRepoPath,
    envs: authEnv,
    timeoutMs: 0,
    onStdout(data) {
      output += data;
      const match = output.match(/Workbench URL:\s+(http:\/\/127\.0\.0\.1:(\d+))/);
      if (match) {
        resolved ??= {
          localUrl: match[1],
          port: Number.parseInt(match[2], 10),
          publicUrl: `https://${sandbox.getHost(Number.parseInt(match[2], 10))}`,
        };
      }
    },
    onStderr(data) {
      output += data;
    },
  });

  commandLog.push({
    ts: startedAt,
    command,
    cwd: taskRepoPath,
    exitCode: null,
    stdout: '',
    stderr: '',
    background: true,
  });

  const waitResult = await waitForWorkbenchUrl(handle, () => resolved, () => output);
  return {
    handle,
    ...waitResult,
  };
}

async function waitForWorkbenchUrl(handle, getResolved, getOutput) {
  const waitPromise = handle.wait().then((result) => {
    if (getResolved()) return getResolved();
    throw new Error(
      `skills dev exited before exposing a workbench URL.\n${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
    );
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (getResolved()) {
      waitPromise.catch(() => {});
      return getResolved();
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  handle.kill().catch(() => {});
  await waitPromise.catch(() => {});
  throw new Error(`Timed out waiting for workbench URL.\n${getOutput()}`);
}

async function collectBrowserArtifacts({
  sandbox,
  desktop,
  scenario,
  browserRuntime,
  resultRoot,
}) {
  const browserCheck = await runBrowserChecks({
    url: browserRuntime.publicUrl,
    outputDir: 'eval-results/browser',
    desktop,
    assertPage: async () => checkWorkbenchWithPlaywright({
      url: browserRuntime.publicUrl,
      expectedText: scenario.repo.expectWorkbenchText,
    }),
  });

  return {
    browser: browserCheck.events,
    screenshots: [
      {
        path: 'screenshots/browser-screenshot.png',
        data: Buffer.from(browserCheck.screenshotBytes),
      },
      ...browserCheck.extraScreenshots.map((entry) => ({
        path: `screenshots/${entry.path.split('/').pop()}`,
        data: Buffer.from(entry.data),
      })),
    ],
    extraFiles: [],
  };
}

async function createBrowserDesktop(sandboxPrep) {
  const { Sandbox } = await import('@e2b/desktop');
  return Sandbox.create({
    apiKey: sandboxPrep.apiKey,
    timeoutMs: 15 * 60 * 1000,
    metadata: {
      app: 'agentpack-agent-eval-browser',
      runId: sandboxPrep.sandbox.sandboxId,
      scenarioId: sandboxPrep.scenario.id,
    },
  });
}

async function checkWorkbenchWithPlaywright({ url, expectedText }) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByTestId('skill-graph').waitFor();

    const nodeCount = await page.locator('[data-node-id]').count();
    const bodyText = await page.locator('body').innerText();

    if (expectedText && !bodyText.includes(expectedText)) {
      throw new Error(`Workbench did not contain expected text: ${expectedText}`);
    }
    if (nodeCount <= 0) {
      throw new Error('Workbench rendered zero graph nodes');
    }

    const screenshot = await page.screenshot();
    return {
      nodeCount,
      labels: await page.locator('[data-node-id]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-node-id')).filter(Boolean)
      ),
      screenshot,
    };
  } finally {
    await browser.close();
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll(`'`, `'\"'\"'`)}'`;
}
