import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readBuildState as readBuildStateRecord,
  writeBuildState as writeBuildStateRecord,
} from '../../infrastructure/fs/build-state-repository.js';

export function hashFile(filePath) {
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `sha256:${digest}`;
}

export function readBuildState(repoRoot) {
  return readBuildStateRecord(repoRoot);
}

export function writeBuildState(repoRoot, state) {
  writeBuildStateRecord(repoRoot, state);
}

export function compareRecordedSources(repoRoot, record) {
  const changes = [];
  const recordedSources = record.sources || {};

  for (const [sourcePath, sourceRecord] of Object.entries(recordedSources)) {
    const absoluteSourcePath = join(repoRoot, sourcePath);
    const currentHash = hashFile(absoluteSourcePath);
    const recordedHash = sourceRecord.hash;

    if (currentHash !== recordedHash) {
      changes.push({
        path: sourcePath,
        recorded: recordedHash,
        current: currentHash,
      });
    }
  }

  return changes;
}

export function buildStateRecordForPackageDir(repoRoot, packageDir, {
  parseSkillFrontmatterFile,
  readPackageMetadata,
  normalizeDisplayPath,
} = {}) {
  const skillFile = join(packageDir, 'SKILL.md');
  const metadata = parseSkillFrontmatterFile(skillFile);
  const packageMetadata = readPackageMetadata(packageDir);
  const sources = {};

  for (const sourcePath of metadata.sources) {
    sources[sourcePath] = {
      hash: hashFile(join(repoRoot, sourcePath)),
    };
  }

  return {
    packageName: packageMetadata.packageName,
    record: {
      package_version: packageMetadata.packageVersion,
      skill_path: normalizeDisplayPath(repoRoot, packageDir),
      skill_file: normalizeDisplayPath(repoRoot, skillFile),
      sources,
      requires: metadata.requires,
    },
  };
}
