import { lstatSync, readlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function readPathType(pathValue) {
  try {
    const stat = lstatSync(pathValue);
    return {
      exists: true,
      isSymlink: stat.isSymbolicLink(),
      type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
    };
  } catch {
    return {
      exists: false,
      isSymlink: false,
      type: null,
    };
  }
}

export function inspectRecordedMaterialization(repoRoot, {
  target,
  expectedSourcePath,
  packageName,
  runtimeName = null,
} = {}) {
  const absTarget = resolve(repoRoot, target);
  const expectedTarget = resolve(repoRoot, expectedSourcePath);
  const pathState = readPathType(absTarget);

  if (!pathState.exists) {
    return {
      packageName,
      runtimeName,
      target,
      expectedSourcePath,
      code: 'missing_path',
    };
  }

  if (!pathState.isSymlink) {
    return {
      packageName,
      runtimeName,
      target,
      expectedSourcePath,
      code: 'wrong_type',
      actualType: pathState.type,
    };
  }

  const rawLinkTarget = readlinkSync(absTarget);
  const actualTarget = resolve(join(absTarget, '..'), rawLinkTarget);
  if (actualTarget !== expectedTarget) {
    return {
      packageName,
      runtimeName,
      target,
      expectedSourcePath,
      code: 'wrong_target',
      actualTarget,
    };
  }

  const resolvedState = readPathType(actualTarget);
  if (!resolvedState.exists) {
    return {
      packageName,
      runtimeName,
      target,
      expectedSourcePath,
      code: 'dangling_target',
      actualTarget,
    };
  }

  return null;
}

export function inspectMaterializedSkills(repoRoot, state) {
  const runtimeDrift = [];
  const ownedTargets = new Set();

  for (const [packageName, install] of Object.entries(state.installs || {})) {
    const issues = [];

    for (const skill of install.skills || []) {
      for (const materialization of skill.materializations || []) {
        ownedTargets.add(materialization.target);
        const issue = inspectRecordedMaterialization(repoRoot, {
          target: materialization.target,
          expectedSourcePath: skill.source_skill_path,
          packageName,
          runtimeName: skill.runtime_name,
        });
        if (issue) issues.push(issue);
      }
    }

    if (issues.length > 0) {
      runtimeDrift.push({
        packageName,
        issues,
      });
    }
  }

  const orphanedMaterializations = [];
  for (const root of [
    join(repoRoot, '.claude', 'skills'),
    join(repoRoot, '.agents', 'skills'),
  ]) {
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relativeTarget = root.startsWith(join(repoRoot, '.claude'))
        ? `.claude/skills/${entry.name}`
        : `.agents/skills/${entry.name}`;
      if (ownedTargets.has(relativeTarget)) continue;

      const absPath = join(root, entry.name);
      const pathState = readPathType(absPath);
      orphanedMaterializations.push({
        target: relativeTarget,
        code: 'orphaned_materialization',
        actualType: pathState.isSymlink ? 'symlink' : pathState.type,
      });
    }
  }

  runtimeDrift.sort((a, b) => a.packageName.localeCompare(b.packageName));
  orphanedMaterializations.sort((a, b) => a.target.localeCompare(b.target));

  return {
    runtimeDriftCount: runtimeDrift.length,
    runtimeDrift,
    orphanedMaterializationCount: orphanedMaterializations.length,
    orphanedMaterializations,
  };
}
