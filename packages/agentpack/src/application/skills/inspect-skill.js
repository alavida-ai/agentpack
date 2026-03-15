import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { inspectCompiledSkillUseCase } from './inspect-compiled-skill.js';
import { findRepoRoot } from '../../lib/context.js';
import { resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { findPackageDirByName } from '../../lib/skills.js';
import { ValidationError } from '../../utils/errors.js';
import { inspectSkill } from '../../lib/skills.js';

function isCompilerModeDocument(content) {
  return content.includes('```agentpack');
}

function resolveLegacySkillFile(repoRoot, target) {
  const absoluteTarget = isAbsolute(target) ? target : resolve(repoRoot, target);
  if (existsSync(absoluteTarget)) {
    if (absoluteTarget.endsWith('SKILL.md')) return absoluteTarget;
    const skillFile = join(absoluteTarget, 'SKILL.md');
    if (existsSync(skillFile)) return skillFile;
  }

  if (!target.startsWith('@')) return null;

  const packageDir = findPackageDirByName(repoRoot, target);
  if (!packageDir) return null;

  const rootSkillFile = join(packageDir, 'SKILL.md');
  return existsSync(rootSkillFile) ? rootSkillFile : null;
}

function assertNoLegacyAuthoredTarget(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  let authored;

  try {
    authored = resolveSkillTarget(repoRoot, target, { includeInstalled: false });
  } catch {
    const legacySkillFile = resolveLegacySkillFile(repoRoot, target);
    if (!legacySkillFile) return;

    const content = readFileSync(legacySkillFile, 'utf-8');
    if (isCompilerModeDocument(content)) return;

    throw new ValidationError(
      'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
      {
        code: 'legacy_authoring_not_supported',
        path: legacySkillFile,
      }
    );
  }

  const authoredExports = authored.kind === 'package' ? authored.exports : [authored.export];
  const legacyExport = authoredExports.find((entry) => {
    const content = readFileSync(entry.skillFilePath, 'utf-8');
    return !isCompilerModeDocument(content);
  });

  if (!legacyExport) return;

  throw new ValidationError(
    'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
    {
      code: 'legacy_authoring_not_supported',
      path: legacyExport.skillFile,
    }
  );
}

export function inspectSkillUseCase(target, options = {}) {
  const compiled = inspectCompiledSkillUseCase(target, options);
  if (compiled) return compiled;
  assertNoLegacyAuthoredTarget(target, options);
  return inspectSkill(target, options);
}
