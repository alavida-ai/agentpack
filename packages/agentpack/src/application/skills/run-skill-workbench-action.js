import { inspectStaleSkillUseCase } from './list-stale-skills.js';
import { validateSkillsUseCase } from './validate-skills.js';

export function runSkillWorkbenchAction(action, context) {
  if (action === 'check-stale') {
    return inspectStaleSkillUseCase(context.packageName, { cwd: context.cwd });
  }

  if (action === 'validate-skill') {
    return validateSkillsUseCase(context.target, { cwd: context.cwd });
  }

  if (action === 'refresh') {
    return { refreshed: true };
  }

  throw new Error(`Unsupported workbench action: ${action}`);
}
