import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { resolveSingleSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { compileSkillDocument } from '../../domain/compiler/skill-compiler.js';
import { writeCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { hashFile } from '../../domain/compiler/source-hash.js';
import { ValidationError } from '../../utils/errors.js';

function buildCompiledArtifact(repoRoot, resolved, compiled) {
  const sourceFiles = Object.values(compiled.sourceBindings).map((entry) => {
    const absolutePath = join(repoRoot, entry.sourcePath);
    if (!existsSync(absolutePath)) {
      throw new ValidationError(`bound source file not found: ${entry.sourcePath}`, {
        code: 'bound_source_not_found',
        path: absolutePath,
      });
    }

    return {
      id: `source:${entry.sourcePath}`,
      localName: entry.localName,
      path: entry.sourcePath,
      hash: hashFile(absolutePath),
    };
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    root_skill: `skill:${compiled.metadata.name}`,
    skills: [
      {
        id: `skill:${compiled.metadata.name}`,
        name: compiled.metadata.name,
        description: compiled.metadata.description,
        packageName: resolved.package.packageName,
        packageVersion: resolved.package.packageVersion,
        packagePath: resolved.package.packagePath,
        skillPath: resolved.export.skillPath,
        skillFile: resolved.export.skillFile,
        skillImports: Object.values(compiled.skillImports),
        sourceBindings: Object.values(compiled.sourceBindings),
      },
    ],
    sourceFiles,
    occurrences: compiled.occurrences.map((entry) => ({
      source: `skill:${compiled.metadata.name}`,
      ...entry,
    })),
    edges: compiled.edges,
  };
}

export function buildCompiledStateUseCase(target, { cwd = process.cwd(), persist = true } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false });
  const content = readFileSync(resolved.export.skillFilePath, 'utf-8');
  const compiled = compileSkillDocument(content);
  const artifact = buildCompiledArtifact(repoRoot, resolved, compiled);

  if (persist) {
    writeCompiledState(repoRoot, artifact);
  }

  return {
    repoRoot,
    rootSkill: artifact.root_skill,
    compiledPath: '.agentpack/compiled.json',
    skillCount: artifact.skills.length,
    sourceCount: artifact.sourceFiles.length,
    occurrenceCount: artifact.occurrences.length,
    edgeCount: artifact.edges.length,
    artifact,
  };
}
