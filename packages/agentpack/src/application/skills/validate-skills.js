import { readFileSync } from 'node:fs';
import { buildCompiledStateUseCase } from './build-compiled-state.js';
import { listAuthoredSkillPackages } from '../../domain/skills/skill-catalog.js';
import { resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { CompilerDiagnosticError } from '../../domain/compiler/compile-diagnostics.js';
import { extractFrontmatter, hasLegacyFrontmatterFields } from '../../domain/compiler/skill-document-parser.js';
import { findRepoRoot } from '../../lib/context.js';
import { validatePackagedSkillExport } from '../../lib/skills.js';
import { writeCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { AgentpackError } from '../../utils/errors.js';
import { collectDiagnosticNextSteps } from '../../domain/skills/workspace-graph.js';

function toValidationIssue(error) {
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    return {
      code: error.code,
      message: error.message,
      ...(error.path ? { path: error.path } : {}),
      ...(error.location ? { location: error.location } : {}),
      ...(error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
    };
  }

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

function compilerValidationResult(buildResult, packageValidation, resolvedExport) {
  const skill = buildResult.artifact.skills.find((entry) => entry.exportId === resolvedExport.id)
    || buildResult.artifact.skills[0];

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
        ...(packageValidation.details ? { details: packageValidation.details } : {}),
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

function compilerGraphFailure(resolved) {
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
        nextSteps: collectDiagnosticNextSteps(resolved.export.diagnostics),
        issues: resolved.export.diagnostics.map((diagnostic) => toValidationIssue(diagnostic)),
      },
    ],
  };
}

function compilerPackageFailure(resolved) {
  return {
    valid: false,
    count: 1,
    validCount: 0,
    invalidCount: 1,
    skills: [
      {
        valid: false,
        key: resolved.package.packageName,
        name: null,
        packageName: resolved.package.packageName,
        packageVersion: resolved.package.packageVersion,
        skillFile: null,
        packagePath: resolved.package.packagePath,
        status: null,
        replacement: null,
        nextSteps: collectDiagnosticNextSteps(resolved.package.diagnostics),
        issues: resolved.package.diagnostics.map((diagnostic) => toValidationIssue(diagnostic)),
      },
    ],
  };
}
function validateResolvedCompilerExport(repoRoot, resolved, options = {}) {
  if (!resolved.export) {
    return compilerPackageFailure(resolved);
  }
  if (resolved.export.status === 'invalid') {
    return compilerGraphFailure(resolved);
  }

  const content = readFileSync(resolved.export.skillFilePath, 'utf-8');
  const { frontmatterText } = extractFrontmatter(content);
  if (!content.includes('```agentpack') && hasLegacyFrontmatterFields(frontmatterText)) {
    return compilerGraphFailure(resolved);
  }

  const packageValidation = validatePackagedSkillExport(repoRoot, resolved.package, resolved.export, options);

  try {
    const buildResult = buildCompiledStateUseCase(resolved.export.skillFilePath, { ...options, persist: false });
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
    return compilerValidationResult(buildResult, packageValidation, resolved.export);
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

function resolveValidationTargets(repoRoot, target, options = {}) {
  if (target) {
    const resolved = resolveSkillTarget(repoRoot, target, {
      includeInstalled: false,
      cwd: options.cwd,
    });
    if (resolved.kind === 'package' && resolved.exports.length === 0 && resolved.package.diagnostics?.length > 0) {
      return [{ package: resolved.package, export: null }];
    }
    return resolved.kind === 'export'
      ? [{ package: resolved.package, export: resolved.export }]
      : resolved.exports.map((entry) => ({ package: resolved.package, export: entry }));
  }

  return listAuthoredSkillPackages(repoRoot)
    .flatMap((pkg) => {
      if (pkg.exports.length === 0 && pkg.diagnostics?.length > 0) {
        return [{ package: pkg, export: null }];
      }
      return pkg.exports.map((entry) => ({ package: pkg, export: entry }));
    });
}

export function validateSkillsUseCase(target, options = {}) {
  const cwd = options.cwd || process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const targets = resolveValidationTargets(repoRoot, target, { cwd });
  const skills = targets
    .flatMap((resolved) => validateResolvedCompilerExport(
      repoRoot,
      resolved,
      target ? options : { ...options, persist: false }
    ).skills)
    .sort((a, b) => (a.key || a.packageName || a.packagePath).localeCompare(b.key || b.packageName || b.packagePath));

  const validCount = skills.filter((skill) => skill.valid).length;
  const invalidCount = skills.length - validCount;
  const result = {
    valid: invalidCount === 0,
    count: skills.length,
    validCount,
    invalidCount,
    skills,
  };

  if (target) return result;
  return result;
}
