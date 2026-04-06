import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPackageMetadata } from '../../domain/skills/skill-model.js';

function normalizeFileEntry(entry) {
  return String(entry || '').replace(/\/+$/, '');
}

function shouldCopyEntry(entry) {
  if (!entry) return false;
  if (entry === 'SKILL.md') return false;
  if (entry === 'dist') return false;
  if (entry === 'skills') return false;
  return true;
}

export function copyPackageRuntimePayload(repoRoot, packagePath, distRoot) {
  const packageDir = join(repoRoot, packagePath);
  const packageMetadata = readPackageMetadata(packageDir);
  const fileEntries = (packageMetadata.files || [])
    .map(normalizeFileEntry)
    .filter(shouldCopyEntry);

  for (const entry of fileEntries) {
    const sourcePath = join(packageDir, entry);
    if (!existsSync(sourcePath)) continue;
    cpSync(sourcePath, join(distRoot, entry), { recursive: true });
  }
}
