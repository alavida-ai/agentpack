const ALLOWED_RUN_MODES = new Set(['autonomous', 'checkpointed']);
const ALLOWED_REPO_SOURCES = new Set(['synthetic', 'agonda', 'superpowers']);
const ALLOWED_TASK_CLASSES = new Set([
  'consumer-install',
  'authoring',
  'migration',
  'staleness',
  'dependency-debugging',
  'dev-workflow',
  'runtime-drift',
]);

export const REQUIRED_USER_STORY_GROUPS = Object.freeze([
  'new-consumer',
  'new-author',
  'legacy-conversion',
  'staleness-and-provenance',
  'dependency-debugging',
  'dev-and-dashboard',
  'real-repo-objectives',
]);

const STARTER_SCENARIOS = Object.freeze([
  {
    id: 'synthetic/install-package',
    title: 'Install a package into an empty repo',
    userStoryGroups: ['new-consumer'],
    repo: { source: 'synthetic', fixture: 'empty-consumer-repo' },
    taskClass: 'consumer-install',
    runMode: 'autonomous',
    task: {
      prompt: 'Install a skill package, materialize it into the runtime, and confirm the runtime outputs exist.',
      successCriteria: [
        'package install succeeds',
        'materialization outputs exist',
        'status reflects a healthy runtime',
      ],
    },
    budget: { maxMinutes: 10, maxSteps: 25 },
    browser: { required: false },
  },
  {
    id: 'synthetic/new-skill',
    title: 'Author a new source-backed skill',
    userStoryGroups: ['new-author'],
    repo: { source: 'synthetic', fixture: 'new-skill-authoring' },
    taskClass: 'authoring',
    runMode: 'autonomous',
    task: {
      prompt: 'Create a new compiler-mode skill from the repo knowledge files and make it validate, build, and materialize.',
      successCriteria: [
        'new compiler-mode SKILL.md exists',
        'validate passes',
        'compiled and materialized outputs exist',
      ],
    },
    budget: { maxMinutes: 15, maxSteps: 40 },
    browser: { required: false },
  },
  {
    id: 'synthetic/stale-repair',
    title: 'Repair a stale skill after a source change',
    userStoryGroups: ['staleness-and-provenance'],
    repo: { source: 'synthetic', fixture: 'stale-repair' },
    taskClass: 'staleness',
    runMode: 'checkpointed',
    task: {
      prompt: 'Identify which skill is stale after a source change, explain why, and repair it so the stale state clears.',
      successCriteria: [
        'stale skill identified',
        'repair applied',
        'stale state clears after validation/build',
      ],
    },
    budget: { maxMinutes: 15, maxSteps: 45 },
    browser: { required: false },
  },
  {
    id: 'synthetic/runtime-drift',
    title: 'Recover from runtime drift',
    userStoryGroups: ['dependency-debugging'],
    repo: { source: 'synthetic', fixture: 'runtime-drift' },
    taskClass: 'runtime-drift',
    runMode: 'autonomous',
    task: {
      prompt: 'Diagnose why the runtime outputs are out of sync and restore them using agentpack.',
      successCriteria: [
        'runtime drift detected',
        'runtime outputs restored',
      ],
    },
    budget: { maxMinutes: 10, maxSteps: 30 },
    browser: { required: false },
  },
  {
    id: 'synthetic/dev-dashboard',
    title: 'Use skills dev and inspect the graph',
    userStoryGroups: ['dev-and-dashboard'],
    repo: {
      source: 'synthetic',
      fixture: 'dev-dashboard',
      devTarget: 'skills/copywriting',
      expectWorkbenchText: 'value-copywriting',
    },
    taskClass: 'dev-workflow',
    runMode: 'checkpointed',
    task: {
      prompt: 'Inspect the running skills dev workbench, use the graph or `/api/model` to understand it, and explain the dependencies and sources in play. If a workbench is already running, use it rather than trying to restart it.',
      successCriteria: [
        'skills dev starts',
        'graph is inspected',
        'dependency/source relationships are described correctly',
      ],
    },
    budget: { maxMinutes: 15, maxSteps: 40 },
    browser: { required: true },
  },
  {
    id: 'agonda/validate',
    title: 'Validate a real source-backed skill in agonda',
    userStoryGroups: ['real-repo-objectives'],
    repo: { source: 'agonda', defaultPathEnv: 'AGENTPACK_SANDBOX_AGONDA' },
    taskClass: 'authoring',
    runMode: 'autonomous',
    agentConfig: {
      model: 'sonnet',
      effort: 'low',
      maxTurns: 10,
      allowedTools: ['Bash', 'Read', 'Glob', 'Grep', 'Write'],
    },
    task: {
      prompt:
        'Work from the repo root and use the `agentpack` CLI, not repo-specific CLIs. Follow this exact objective: (1) run `agentpack --json skills validate skills/agonda-cli`, (2) run `agentpack --json skills inspect @alavida/agonda-cli`, (3) confirm `.agentpack/compiled.json` exists, (4) write the required eval reports, then stop. Do not wander outside that objective.',
      successCriteria: [
        'validation for the target skill succeeds',
        'inspect for @alavida/agonda-cli succeeds',
        'compiled state is produced',
      ],
    },
    budget: { maxMinutes: 15, maxSteps: 35 },
    browser: { required: false },
  },
  {
    id: 'superpowers/convert-skill',
    title: 'Convert and verify a real skill graph in superpowers',
    userStoryGroups: ['legacy-conversion'],
    repo: { source: 'superpowers', defaultPathEnv: 'AGENTPACK_SANDBOX_SUPERPOWERS' },
    taskClass: 'migration',
    runMode: 'autonomous',
    task: {
      prompt: 'Convert or repair a real skill so it validates cleanly in the new compiler-backed format.',
      successCriteria: [
        'skill validates cleanly',
        'imports and source bindings are explicit',
      ],
    },
    budget: { maxMinutes: 20, maxSteps: 50 },
    browser: { required: false },
  },
]);

export function listScenarios() {
  return STARTER_SCENARIOS.map((scenario) => structuredClone(scenario));
}

export function getScenario(id) {
  const scenario = STARTER_SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) {
    throw new Error(`scenario.not_found: ${id}`);
  }
  return structuredClone(scenario);
}

export function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') {
    throw new Error('scenario.invalid: expected object');
  }

  assertString('scenario.id', scenario.id);
  assertString('scenario.title', scenario.title);
  assertStringArray('scenario.userStoryGroups', scenario.userStoryGroups);
  assertObject('scenario.repo', scenario.repo);
  assertString('scenario.repo.source', scenario.repo.source);
  assertOneOf('scenario.repo.source', scenario.repo.source, ALLOWED_REPO_SOURCES);
  assertString('scenario.taskClass', scenario.taskClass);
  assertOneOf('scenario.taskClass', scenario.taskClass, ALLOWED_TASK_CLASSES);
  assertString('scenario.runMode', scenario.runMode);
  assertOneOf('scenario.runMode', scenario.runMode, ALLOWED_RUN_MODES);
  assertObject('scenario.task', scenario.task);
  assertString('scenario.task.prompt', scenario.task.prompt);
  assertStringArray('scenario.task.successCriteria', scenario.task.successCriteria);
  assertObject('scenario.budget', scenario.budget);
  assertPositiveInteger('scenario.budget.maxMinutes', scenario.budget.maxMinutes);
  assertPositiveInteger('scenario.budget.maxSteps', scenario.budget.maxSteps);
  assertObject('scenario.browser', scenario.browser);
  if (typeof scenario.browser.required !== 'boolean') {
    throw new Error('scenario.browser.required must be a boolean');
  }

  for (const group of scenario.userStoryGroups) {
    if (!REQUIRED_USER_STORY_GROUPS.includes(group)) {
      throw new Error(`scenario.userStoryGroups contains unknown group: ${group}`);
    }
  }

  return scenario;
}

function assertObject(field, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function assertString(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertStringArray(field, value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${field} must be a non-empty string array`);
  }
}

function assertPositiveInteger(field, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertOneOf(field, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`${field} must be one of: ${[...allowed].join(', ')}`);
  }
}
