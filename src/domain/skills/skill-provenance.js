import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function hashFile(filePath) {
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `sha256:${digest}`;
}

export function readBuildState(repoRoot) {
  const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');
  if (!existsSync(buildStatePath)) {
    return { version: 1, skills: {} };
  }

  return JSON.parse(readFileSync(buildStatePath, 'utf-8'));
}

export function writeBuildState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'build-state.json'), JSON.stringify(state, null, 2) + '\n');
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
