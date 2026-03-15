import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runClaudeCode({
  scenario,
  cwd,
  systemPrompt,
  checkpointObservations = [],
  commandRunner = defaultCommandRunner,
}) {
  const prompt = buildPrompt({ scenario, checkpointObservations });
  const args = [
    '-p',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-mode',
    'bypassPermissions',
    '--no-session-persistence',
    '--debug-file',
    '/workspace/eval-results/claude-debug.log',
    '--model',
    scenario.agentConfig?.model ?? 'sonnet',
    '--effort',
    scenario.agentConfig?.effort ?? 'low',
    '--max-turns',
    String(scenario.agentConfig?.maxTurns ?? 12),
    '--disallowedTools',
    'AskUserQuestion',
  ];

  if (Array.isArray(scenario.agentConfig?.allowedTools) && scenario.agentConfig.allowedTools.length > 0) {
    args.push('--allowedTools', scenario.agentConfig.allowedTools.join(','));
  }

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  args.push('--');
  args.push(prompt);

  const command = `claude ${args.map(formatArg).join(' ')}`;
  const result = await commandRunner(command, {
    cwd,
    onStdout: (data) => process.stderr.write(data),
    onStderr: (data) => process.stderr.write(data),
  });

  return {
    command,
    exitCode: result.exitCode ?? 0,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
    transcript: parseTranscript(result.stdout ?? ''),
  };
}

export function buildPrompt({ scenario, checkpointObservations = [] }) {
  const sections = [
    `Task: ${scenario.task.prompt}`,
    `Success criteria:\n- ${scenario.task.successCriteria.join('\n- ')}`,
    [
      'Eval artifact contract:',
      '- While working, log major confusion, friction, or wrong turns with `agentpack-log-learning <kind> <severity> <area> "<note>"`.',
      '- Use kind values like `pain_point`, `learning`, or `wrong_turn`.',
      '- Before finishing, write `/workspace/eval-results/report.md` with a concise narrative covering outcome, main pain points, helpful signals, and suggested product fixes.',
      '- Before finishing, write `/workspace/eval-results/report.json` with keys: `outcome`, `confidence`, `summary`, `pain_points`, `learnings`, `helpful_things`.',
      '- Before finishing, write `/workspace/eval-results/summary.md` with a short outcome summary.',
    ].join('\n'),
  ];

  if (checkpointObservations.length > 0) {
    sections.push(`Checkpoint observations:\n- ${checkpointObservations.join('\n- ')}`);
  }

  return sections.join('\n\n');
}

function parseTranscript(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { type: 'stdout', text: line };
    }
  });
}

async function defaultCommandRunner(command, options) {
  const { stdout, stderr } = await execFileAsync('/bin/sh', ['-lc', command], {
    cwd: options.cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  }).catch((error) => ({
    stdout: error.stdout ?? '',
    stderr: error.stderr ?? error.message,
    exitCode: error.code ?? 1,
  }));

  const exitCode = typeof stdout === 'object' ? stdout.exitCode ?? 1 : 0;
  if (typeof stdout === 'object') {
    return stdout;
  }
  return { stdout, stderr, exitCode };
}

function formatArg(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }
  return shellQuote(value);
}

function shellQuote(value) {
  return `'${String(value).replaceAll(`'`, `'\"'\"'`)}'`;
}
