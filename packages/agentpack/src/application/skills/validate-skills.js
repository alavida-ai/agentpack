import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { buildCompiledStateUseCase } from './build-compiled-state.js';
import { listAuthoredSkillPackageDirs, listAuthoredSkillPackages } from '../../domain/skills/skill-catalog.js';
import { resolveSingleSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { CompilerDiagnosticError } from '../../domain/compiler/compile-diagnostics.js';
import { findRepoRoot } from '../../lib/context.js';
import { findPackageDirByName, validatePackagedSkillExport } from '../../lib/skills.js';
import { writeCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { AgentpackError } from '../../utils/errors.js';
import { normalizeDisplayPath, readPackageMetadata } from '../../domain/skills/skill-model.js';

function isCompilerModeDocument(content) {
  return content.includes('```agentpack');
}

function toValidationIssue(error) {
  if (error instanceof CompilerDiagnosticError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.location ? { location: error.location } : {}),
    };
  }

  if (error instanceof AgentpackError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path ? { path: error.path } : {}),
      ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
    };
  }

  return {
    code: 'validation_error',
    message: error.message || String(error),
  };
}

function compilerValidationResult(buildResult, packageValidation) {
  const skill = buildResult.artifact.skills[0];

  return {
    valid: true,
    count: 1,
    validCount: 1,
    invalidCount: 0,
    skills: [
      {
        valid: true,
        key: skill.id,
        name: skill.name,
        packageName: skill.packageName,
        packageVersion: skill.packageVersion,
        skillFile: skill.skillFile,
        packagePath: skill.packagePath,
        status: packageValidation.status,
        replacement: packageValidation.replacement,
        nextSteps: packageValidation.nextSteps,
        issues: [],
      },
    ],
  };
}

function compilerValidationFailure(resolved, error) {
  return {
    valid: false,
    count: 1,
    validCount: 0,
    invalidCount: 1,
    skills: [
      {
        valid: false,
        key: resolved.export.key,
        name: resolved.export.name || null,
        packageName: resolved.package.packageName,
        packageVersion: resolved.package.packageVersion,
        skillFile: resolved.export.skillFile,
        packagePath: resolved.package.packagePath,
        status: null,
        replacement: null,
        nextSteps: [],
        issues: [toValidationIssue(error)],
      },
    ],
  };
}

function compilerLegacyFailure(resolved) {
  return {
    valid: false,
    count: 1,
    validCount: 0,
    invalidCount: 1,
    skills: [
      {
        valid: false,
        key: resolved.export.key,
        name: resolved.export.name || null,
        packageName: resolved.package.packageName,
        packageVersion: resolved.package.packageVersion,
        skillFile: resolved.export.skillFile,
        packagePath: resolved.package.packagePath,
        status: null,
        replacement: null,
        nextSteps: [],
        issues: [
          {
            code: 'legacy_authoring_not_supported',
            message: 'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
            path: resolved.export.skillFile,
          },
        ],
      },
    ],
  };
}

function compilerLegacyFailureFromPath(repoRoot, skillFilePath, packageDir = null) {
  const resolvedPackageDir = packageDir || dirname(skillFilePath);
  const packageMetadata = readPackageMetadata(resolvedPackageDir);
  const packagePath = normalizeDisplayPath(repoRoot, resolvedPackageDir);
  const skillFile = normalizeDisplayPath(repoRoot, skillFilePath);

  return {
    valid: false,
    count: 1,
    validCount: 0,
    invalidCount: 1,
    skills: [
      {
        valid: false,
        key: packageMetadata.packageName || skillFile,
        name: null,
        packageName: packageMetadata.packageName,
        packageVersion: packageMetadata.packageVersion,
        skillFile,
        packagePath,
        status: null,
        replacement: null,
        nextSteps: [],
        issues: [
          {
            code: 'legacy_authoring_not_supported',
            message: 'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
            path: skillFile,
          },
        ],
      },
    ],
  };
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
  const skillFile = join(packageDir, 'SKILL.md');
  return existsSync(skillFile) ? skillFile : null;
}

function validateCompilerTarget(repoRoot, target, options = {}) {
  let resolved;
  try {
    resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false });
  } catch {
    const legacySkillFile = resolveLegacySkillFile(repoRoot, target);
    if (!legacySkillFile) throw new AgentpackError('skill not found', { code: 'skill_not_found' });
    const content = readFileSync(legacySkillFile, 'utf-8');
    if (!isCompilerModeDocument(content)) {
      return compilerLegacyFailureFromPath(repoRoot, legacySkillFile, dirname(legacySkillFile));
    }
    throw new AgentpackError('skill not found', { code: 'skill_not_found' });
  }
  const content = readFileSync(resolved.export.skillFilePath, 'utf-8');

  if (!isCompilerModeDocument(content)) {
    return compilerLegacyFailure(resolved);
  }

  const packageValidation = validatePackagedSkillExport(repoRoot, resolved.package, resolved.export);

  try {
    const buildResult = buildCompiledStateUseCase(target, { ...options, persist: false });
    const issues = [...packageValidation.issues];
    if (issues.length > 0) {
      return {
        valid: false,
        count: 1,
        validCount: 0,
        invalidCount: 1,
        skills: [
          {
            ...packageValidation,
            valid: false,
            issues,
          },
        ],
      };
    }

    if (options.persist !== false) {
      writeCompiledState(buildResult.repoRoot, buildResult.artifact);
    }
    return compilerValidationResult(buildResult, packageValidation);
  } catch (error) {
    if (packageValidation.issues.length > 0) {
      return {
        valid: false,
        count: 1,
        validCount: 0,
        invalidCount: 1,
        skills: [
          {
            ...packageValidation,
            valid: false,
            issues: [...packageValidation.issues, toValidationIssue(error)],
          },
        ],
      };
    }

    return compilerValidationFailure(resolved, error);
  }
}

export function validateSkillsUseCase(target, options = {}) {
  const cwd = options.cwd || process.cwd();
  const repoRoot = findRepoRoot(cwd);

  if (!target) {
    const authoredTargets = listAuthoredSkillPackages(repoRoot)
      .flatMap((pkg) => pkg.exports.map((entry) => entry.skillPath));
    const discoveredPackageDirs = new Set(listAuthoredSkillPackageDirs(repoRoot));
    const coveredPackageDirs = new Set(
      listAuthoredSkillPackages(repoRoot).map((pkg) => pkg.packageDir)
    );

    for (const packageDir of discoveredPackageDirs) {
      if (coveredPackageDirs.has(packageDir)) continue;
      const rootSkillFile = join(packageDir, 'SKILL.md');
      if (existsSync(rootSkillFile)) {
        authoredTargets.push(normalizeDisplayPath(repoRoot, packageDir));
      }
    }

    const skills = authoredTargets
      .flatMap((authoredTarget) => validateCompilerTarget(repoRoot, authoredTarget, { ...options, persist: false }).skills)
      .sort((a, b) => (a.key || a.packageName || a.packagePath).localeCompare(b.key || b.packageName || b.packagePath));

    const validCount = skills.filter((skill) => skill.valid).length;
    const invalidCount = skills.length - validCount;

    return {
      valid: invalidCount === 0,
      count: skills.length,
      validCount,
      invalidCount,
      skills,
    };
  }

  return validateCompilerTarget(repoRoot, target, options);
}
