import { inspectStaleSkill, listStaleSkills } from '../../lib/skills.js';

export function listStaleSkillsUseCase(options) {
  return listStaleSkills(options);
}

export function inspectStaleSkillUseCase(target, options) {
  return inspectStaleSkill(target, options);
}
