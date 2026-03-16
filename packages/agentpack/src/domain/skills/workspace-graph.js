import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { compileSkillDocument } from '../compiler/skill-compiler.js';
import { AgentpackError, ValidationError } from '../../utils/errors.js';
import {
  listPackageSkillEntries,
  normalizeDisplayPath,
  parseSkillFrontmatterFile,
  readPackageMetadata,
} from './skill-model.js';

function isIgnoredEntry(name) {
  return name === '.git' || name === 'node_modules' || name === '.agentpack';
}

function isCompilerModeDocument(content) {
  return content.includes('```agentpack');
}

function listAuthoredPackageDirs(repoRoot) {
  const stack = [repoRoot];
  const results = [];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasPackageFile = false;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnoredEntry(entry.name)) continue;
        stack.push(join(current, entry.name));
        continue;
      }
      if (entry.name === 'package.json') hasPackageFile = true;
    }

    if (!hasPackageFile) continue;

    const packageMetadata = readPackageMetadata(current);
    if (!packageMetadata.packageName) continue;
    if (listPackageSkillEntries(current).length === 0 && !packageMetadata.exportedSkills) continue;
    results.push(current);
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function defaultExportName(entry, packageName) {
  if (entry.kind === 'primary') {
    const segments = packageName.split('/');
    return segments[segments.length - 1] || packageName;
  }
  return basename(entry.skillDir);
}

function buildNextSteps(error, displayPath) {
  if (error?.code === 'legacy_export_table_not_supported') {
    return [{
      action: 'edit_file',
      path: displayPath,
      reason: 'Replace `agentpack.skills` with `agentpack.root`, then discover named exports from the filesystem.',
    }];
  }

  if (error?.code === 'invalid_agentpack_declaration' && /source\s+\w+\s+from\s+"[^"]+"/i.test(error.message || '')) {
    return [{
      action: 'edit_file',
      path: displayPath,
      reason: 'Replace unsupported source declaration syntax with `source alias = "repo-relative-path"`.',
    }];
  }

  if (error?.code === 'legacy_authoring_not_supported') {
    return [{
      action: 'edit_file',
      path: displayPath,
      reason: 'Convert this skill to compiler-mode authoring with one `agentpack` block and explicit body references.',
    }];
  }

  return [{
    action: 'edit_file',
    path: displayPath,
    reason: 'Fix the compiler error in this skill export, then rerun the command.',
  }];
}

function buildDiagnostic(repoRoot, scope, pathValue, error, extra = {}) {
  const displayPath = pathValue ? normalizeDisplayPath(repoRoot, pathValue) : null;
  return {
    code: error?.code || 'compiler_error',
    message: error?.message || String(error),
    level: 'error',
    scope,
    ...(displayPath ? { path: displayPath } : {}),
    ...(error?.location ? { location: error.location } : {}),
    ...extra,
    nextSteps: buildNextSteps(error, displayPath),
  };
}

function compileExportNode(repoRoot, packageNode, entry) {
  let frontmatter = null;
  try {
    frontmatter = parseSkillFrontmatterFile(entry.skillFile);
  } catch {
    frontmatter = null;
  }

  const declaredName = frontmatter?.name || defaultExportName(entry, packageNode.packageName);
  const exportId = entry.kind === 'primary'
    ? packageNode.packageName
    : `${packageNode.packageName}:${declaredName}`;
  const baseNode = {
    id: exportId,
    kind: entry.kind,
    packageName: packageNode.packageName,
    packageVersion: packageNode.packageVersion,
    packageDir: packageNode.packageDir,
    packagePath: packageNode.packagePath,
    declaredName,
    name: declaredName,
    description: frontmatter?.description || null,
    skillDirPath: entry.skillDir,
    skillFilePath: entry.skillFile,
    skillPath: normalizeDisplayPath(repoRoot, entry.skillDir),
    skillFile: normalizeDisplayPath(repoRoot, entry.skillFile),
    relativeSkillFile: entry.relativeSkillFile,
    key: exportId,
    isPrimary: entry.kind === 'primary',
    diagnostics: [],
    compiled: null,
    sources: [],
    requires: [],
    status: 'valid',
    replacement: frontmatter?.replacement || null,
    message: frontmatter?.message || null,
    wraps: frontmatter?.wraps || null,
    overrides: frontmatter?.overrides || [],
  };

  try {
    const content = readFileSync(entry.skillFile, 'utf-8');
    if (!isCompilerModeDocument(content)) {
      throw new ValidationError(
        'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
        {
          code: 'legacy_authoring_not_supported',
          path: entry.skillFile,
        }
      );
    }

    const compiled = compileSkillDocument(content);
    return {
      ...baseNode,
      name: compiled.metadata.name,
      description: compiled.metadata.description,
      compiled,
      sources: Object.values(compiled.sourceBindings).map((binding) => binding.sourcePath),
      requires: Object.values(compiled.skillImports).map((skillImport) => skillImport.target),
      lifecycleStatus: frontmatter?.status || null,
    };
  } catch (error) {
    return {
      ...baseNode,
      status: 'invalid',
      diagnostics: [buildDiagnostic(repoRoot, 'export', entry.skillFile, error, { exportId })],
    };
  }
}

function registerTarget(targets, key, value) {
  if (!key) return;
  targets[key] = value;
}

function toTargetRef(kind, packageNode, exportNode = null) {
  return exportNode
    ? { kind, packageName: packageNode.packageName, exportId: exportNode.id }
    : { kind, packageName: packageNode.packageName };
}

function buildPackageNode(repoRoot, packageDir) {
  const packageMetadata = readPackageMetadata(packageDir);
  const packageNode = {
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    packageDir,
    packagePath: normalizeDisplayPath(repoRoot, packageDir),
    packageMetadata,
    primaryExport: null,
    exports: [],
    status: 'valid',
    diagnostics: [],
  };

  const skillEntries = listPackageSkillEntries(packageDir);
  if (skillEntries.length === 0 && packageMetadata.exportedSkills) {
    packageNode.status = 'invalid';
    packageNode.diagnostics = [
      buildDiagnostic(
        repoRoot,
        'package',
        join(packageDir, 'package.json'),
        new AgentpackError(
          'package.json agentpack.skills export tables are no longer supported. Use agentpack.root and discover skills from the package filesystem.',
          { code: 'legacy_export_table_not_supported' }
        ),
        { packageName: packageNode.packageName }
      ),
    ];
    return {
      packageNode,
      exportNodes: [],
    };
  }

  const exportNodes = skillEntries.map((entry) => compileExportNode(repoRoot, packageNode, entry));
  const primaryExport = exportNodes.find((entry) => entry.isPrimary) || null;
  packageNode.primaryExport = primaryExport?.id || null;
  packageNode.exports = exportNodes.map((entry) => entry.id).sort((a, b) => a.localeCompare(b));
  packageNode.status = exportNodes.some((entry) => entry.status === 'invalid') ? 'invalid' : 'valid';
  packageNode.diagnostics = exportNodes.flatMap((entry) => entry.diagnostics);

  return {
    packageNode,
    exportNodes,
  };
}

export function buildAuthoredWorkspaceGraph(repoRoot) {
  const packages = {};
  const exports = {};
  const targets = {};
  const diagnostics = [];

  for (const packageDir of listAuthoredPackageDirs(repoRoot)) {
    const { packageNode, exportNodes } = buildPackageNode(repoRoot, packageDir);
    packages[packageNode.packageName] = packageNode;
    diagnostics.push(...packageNode.diagnostics);

    registerTarget(targets, packageNode.packageName, toTargetRef('package', packageNode));
    registerTarget(targets, packageNode.packagePath, toTargetRef('package', packageNode));
    registerTarget(targets, packageNode.packageDir, toTargetRef('package', packageNode));

    for (const exportNode of exportNodes) {
      exports[exportNode.id] = exportNode;
      if (!exportNode.isPrimary) {
        registerTarget(targets, exportNode.id, toTargetRef('export', packageNode, exportNode));
        registerTarget(targets, exportNode.skillPath, toTargetRef('export', packageNode, exportNode));
        registerTarget(targets, exportNode.skillDirPath, toTargetRef('export', packageNode, exportNode));
      }
      registerTarget(targets, exportNode.skillFile, toTargetRef('export', packageNode, exportNode));
      registerTarget(targets, exportNode.skillFilePath, toTargetRef('export', packageNode, exportNode));
    }
  }

  return {
    packages,
    exports,
    targets,
    diagnostics,
  };
}

export function collectDiagnosticNextSteps(diagnostics) {
  const seen = new Set();
  const nextSteps = [];

  for (const diagnostic of diagnostics || []) {
    for (const step of diagnostic.nextSteps || []) {
      const key = JSON.stringify(step);
      if (seen.has(key)) continue;
      seen.add(key);
      nextSteps.push(step);
    }
  }

  return nextSteps;
}

export function buildInvalidExportError(exportNode) {
  const diagnostics = exportNode?.diagnostics || [];
  const primaryMessage = diagnostics.length === 1
    ? diagnostics[0].message
    : `skill export is invalid: ${exportNode?.id || 'unknown export'}`;
  return new ValidationError(`skill export is invalid: ${exportNode?.id || 'unknown export'}`, {
    code: 'export_invalid',
    suggestion: primaryMessage,
    path: exportNode?.skillFile || null,
    nextSteps: collectDiagnosticNextSteps(diagnostics),
    details: {
      exportId: exportNode?.id || null,
      diagnostics,
    },
  });
}

export function buildInvalidPackageError(packageNode) {
  const diagnostics = packageNode?.diagnostics || [];
  const primaryMessage = diagnostics.length === 1
    ? diagnostics[0].message
    : `skill package is invalid: ${packageNode?.packageName || 'unknown package'}`;
  return new ValidationError(`skill package is invalid: ${packageNode?.packageName || 'unknown package'}`, {
    code: 'package_invalid',
    path: packageNode?.packagePath || null,
    suggestion: primaryMessage,
    nextSteps: collectDiagnosticNextSteps(diagnostics),
    details: {
      packageName: packageNode?.packageName || null,
      diagnostics,
    },
  });
}
