import { inspectCompiledSkillUseCase } from './inspect-compiled-skill.js';
import { inspectAuthoredSkillUseCase } from './inspect-authored-skill.js';

export function inspectSkillUseCase(target, options = {}) {
  const compiled = inspectCompiledSkillUseCase(target, options);
  if (compiled) return compiled;
  return inspectAuthoredSkillUseCase(target, options);
}
