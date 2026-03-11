import { validateSkills } from '../../lib/skills.js';

export function validateSkillsUseCase(target, options) {
  return validateSkills(target, options);
}
