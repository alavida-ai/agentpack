import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { parseSkillFrontmatterFile } from '../../domain/skills/skill-model.js';
import { ensureResolvedExportIsValid, resolveSingleSkillTarget, resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { buildInvalidPackageError } from '../../domain/skills/workspace-graph.js';
import { buildCompiledStateUseCase } from './build-compiled-state.js';
import { ValidationError } from '../../utils/errors.js';

function isCompilerModeDocument(content) {
  return content.includes('```agentpack');
}

function matchesCompiledSkill(repoRoot, target, compiledSkill) {
  let resolved;

  try {
    resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false });
  } catch {
    return false;
  }

  return resolved.package.packageName === compiledSkill.packageName
    && resolved.export.skillFile === compiledSkill.skillFile;
}

export function inspectCompiledSkillUseCase(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  let authoredTarget;
  let resolved;

  try {
    authoredTarget = resolveSkillTarget(repoRoot, target, { includeInstalled: false });
  } catch (error) {
    if (error.code === 'export_invalid' || error.code === 'package_invalid') throw error;
    return null;
  }

  if (authoredTarget.kind === 'package') {
    if (authoredTarget.package?.status === 'invalid') {
      throw buildInvalidPackageError(authoredTarget.package);
    }
    if (authoredTarget.exports.length > 1) return null;
  }

  try {
    resolved = ensureResolvedExportIsValid(
      resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false })
    );
  } catch (error) {
    if (error.code === 'export_invalid' || error.code === 'package_invalid') throw error;
    return null;
  }

  const content = readFileSync(resolved.export.skillFilePath, 'utf-8');
  if (!isCompilerModeDocument(content)) {
    throw new ValidationError(
      'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
      {
        code: 'legacy_authoring_not_supported',
        path: resolved.export.skillFile,
      }
    );
  }

  const compiled = buildCompiledStateUseCase(target, { cwd, persist: false }).artifact;
  const compiledSkill = compiled.skills[0] || null;
  const metadata = parseSkillFrontmatterFile(resolved.export.skillFilePath);

  if (!compiledSkill) return null;
  if (!matchesCompiledSkill(repoRoot, target, compiledSkill)) return null;

  return {
    kind: 'export',
    name: compiledSkill.name,
    description: compiledSkill.description,
    packageName: compiledSkill.packageName,
    packageVersion: compiledSkill.packageVersion,
    skillFile: compiledSkill.skillFile,
    sources: compiledSkill.sourceBindings.map((entry) => entry.sourcePath),
    requires: compiledSkill.skillImports.map((entry) => entry.target),
    status: metadata.status,
    replacement: metadata.replacement,
    message: metadata.message,
    wraps: metadata.wraps,
    overrides: metadata.overrides,
    compiled: {
      generatedAt: compiled.generated_at,
      rootSkill: compiled.root_skill,
      path: resolve(repoRoot, '.agentpack', 'compiled.json'),
    },
  };
}
