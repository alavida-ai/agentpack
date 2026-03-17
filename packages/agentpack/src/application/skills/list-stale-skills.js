import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { hashFile as defaultHashFile } from '../../domain/compiler/source-hash.js';
import { normalizeDisplayPath } from '../../domain/skills/skill-model.js';
import { NotFoundError } from '../../utils/errors.js';

function buildCompiledStateMissingError() {
  return new NotFoundError('compiled state not found', {
    code: 'compiled_state_not_found',
    suggestion: 'Run `agentpack author build <target>` first.',
  });
}

function matchStaleSkill(staleSkills, target) {
  if (target.startsWith('@')) {
    return staleSkills.find((skill) => skill.packageName === target) || null;
  }

  return staleSkills.find((skill) => skill.skillFile === target) || null;
}

export function listStaleSkillsFromCompiledState(compiledState, {
  repoRoot,
  hashFile = defaultHashFile,
} = {}) {
  if (!compiledState) {
    throw buildCompiledStateMissingError();
  }

  return Object.values(compiledState.packages || {})
    .map((packageState) => {
      const changedSources = (packageState.sourceFiles || [])
        .map((sourceFile) => ({
          path: sourceFile.path,
          recorded: sourceFile.hash,
          current: hashFile(join(repoRoot, sourceFile.path)),
        }))
        .filter((entry) => entry.recorded !== entry.current);
      const rootSkill = packageState.skills?.find((skill) => skill.id === packageState.root_skill)
        || packageState.skills?.[0]
        || null;

      return {
        packageName: packageState.packageName,
        skillPath: rootSkill?.skillPath || packageState.packagePath,
        skillFile: rootSkill?.skillFile || null,
        changedSources,
      };
    })
    .filter((skill) => skill.changedSources.length > 0)
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function inspectStaleSkillFromCompiledState(staleSkills, target) {
  const match = matchStaleSkill(staleSkills, target);
  if (!match) {
    throw new NotFoundError('stale skill not found', {
      code: 'stale_skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }
  return match;
}

export function listStaleSkillsUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const compiledState = readCompiledState(repoRoot);
  if (!compiledState) {
    throw buildCompiledStateMissingError();
  }
  return listStaleSkillsFromCompiledState(compiledState, { repoRoot });
}

export function inspectStaleSkillUseCase(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const compiledState = readCompiledState(repoRoot);
  if (!compiledState) {
    throw buildCompiledStateMissingError();
  }

  const staleSkills = listStaleSkillsFromCompiledState(compiledState, { repoRoot });
  const normalizedTarget = target.startsWith('@')
    ? target
    : normalizeDisplayPath(repoRoot, target.endsWith('SKILL.md') ? target : join(target, 'SKILL.md'));

  return inspectStaleSkillFromCompiledState(staleSkills, normalizedTarget);
}
