import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

function parseScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function foldBlockScalar(lines, startIndex, baseIndent) {
  const values = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      values.push('');
      index += 1;
      continue;
    }

    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    if (indent <= baseIndent) break;

    values.push(rawLine.slice(baseIndent + 2).trimEnd());
    index += 1;
  }

  const folded = values
    .join('\n')
    .split('\n\n')
    .map((chunk) => chunk.split('\n').join(' ').trim())
    .filter((chunk, idx, arr) => chunk.length > 0 || idx < arr.length - 1)
    .join('\n\n')
    .trim();

  return { value: folded, nextIndex: index };
}

function ensureContainer(target, key) {
  if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
    target[key] = {};
  }
  return target[key];
}

export function parseSkillFrontmatterFile(skillFilePath) {
  if (!existsSync(skillFilePath)) {
    throw new NotFoundError(`skill file not found: ${skillFilePath}`, { code: 'skill_not_found' });
  }

  const content = readFileSync(skillFilePath, 'utf-8');
  if (!content.startsWith('---\n')) {
    throw new ValidationError('SKILL.md missing frontmatter', { code: 'missing_frontmatter' });
  }

  const fmEnd = content.indexOf('\n---', 4);
  if (fmEnd === -1) {
    throw new ValidationError('SKILL.md has unclosed frontmatter', { code: 'unclosed_frontmatter' });
  }

  const lines = content.slice(4, fmEnd).split('\n');
  const fields = {};
  let activeArrayKey = null;
  let activeArrayTarget = null;
  let activeParentKey = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const listMatch = rawLine.match(/^(\s*)-\s+(.+)$/);
    if (listMatch && activeArrayKey && activeArrayTarget) {
      activeArrayTarget[activeArrayKey].push(parseScalar(listMatch[2]));
      continue;
    }

    const nestedKeyMatch = rawLine.match(/^\s{2}([A-Za-z][\w-]*):\s*(.*)$/);
    if (nestedKeyMatch && activeParentKey) {
      const [, key, value] = nestedKeyMatch;
      const parent = ensureContainer(fields, activeParentKey);
      if (value === '') {
        parent[key] = [];
        activeArrayKey = key;
        activeArrayTarget = parent;
        continue;
      }

      parent[key] = parseScalar(value);
      activeArrayKey = null;
      activeArrayTarget = null;
      continue;
    }

    const keyMatch = rawLine.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, value] = keyMatch;
    if (value === '>' || value === '|') {
      const { value: blockValue, nextIndex } = foldBlockScalar(lines, index, 0);
      fields[key] = blockValue;
      activeParentKey = null;
      activeArrayKey = null;
      activeArrayTarget = null;
      index = nextIndex - 1;
      continue;
    }

    if (value === '') {
      fields[key] = fields[key] && typeof fields[key] === 'object' && !Array.isArray(fields[key])
        ? fields[key]
        : [];
      activeParentKey = key;
      activeArrayKey = Array.isArray(fields[key]) ? key : null;
      activeArrayTarget = Array.isArray(fields[key]) ? fields : null;
      continue;
    }

    fields[key] = parseScalar(value);
    activeParentKey = null;
    activeArrayKey = null;
    activeArrayTarget = null;
  }

  if (!fields.name) {
    throw new ValidationError('SKILL.md frontmatter missing "name" field', { code: 'missing_name' });
  }
  if (!fields.description) {
    throw new ValidationError('SKILL.md frontmatter missing "description" field', { code: 'missing_description' });
  }

  return {
    name: fields.name,
    description: fields.description,
    sources: Array.isArray(fields.metadata?.sources)
      ? fields.metadata.sources
      : (Array.isArray(fields.sources) ? fields.sources : []),
    requires: Array.isArray(fields.metadata?.requires)
      ? fields.metadata.requires
      : (Array.isArray(fields.requires) ? fields.requires : []),
    status: typeof fields.metadata?.status === 'string' ? fields.metadata.status : null,
    replacement: typeof fields.metadata?.replacement === 'string' ? fields.metadata.replacement : null,
    message: typeof fields.metadata?.message === 'string' ? fields.metadata.message : null,
  };
}

export function normalizeDisplayPath(repoRoot, absolutePath) {
  return relative(repoRoot, absolutePath).split('\\').join('/');
}

export function normalizeRepoPath(repoRoot, absolutePath) {
  return normalizeDisplayPath(repoRoot, absolutePath);
}

export function readPackageMetadata(packageDir) {
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {
      packageName: null,
      packageVersion: null,
      dependencies: {},
      devDependencies: {},
      files: null,
      repository: null,
      publishConfigRegistry: null,
      exportedSkills: null,
    };
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return {
    packageName: pkg.name || null,
    packageVersion: pkg.version || null,
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    files: Array.isArray(pkg.files) ? pkg.files : null,
    repository: pkg.repository || null,
    publishConfigRegistry: pkg.publishConfig?.registry || null,
    exportedSkills: pkg.agentpack?.skills || null,
  };
}

export function buildCanonicalSkillRequirement(packageName, skillName) {
  if (!packageName || !skillName) return null;
  return `${packageName}:${skillName}`;
}

export function readInstalledSkillExports(packageDir) {
  const packageMetadata = readPackageMetadata(packageDir);
  const exports = [];

  if (packageMetadata.exportedSkills && typeof packageMetadata.exportedSkills === 'object') {
    for (const [declaredName, entry] of Object.entries(packageMetadata.exportedSkills)) {
      const relativeSkillFile = typeof entry === 'string' ? entry : entry?.path;
      if (!relativeSkillFile) continue;

      const skillFile = join(packageDir, relativeSkillFile);
      if (!existsSync(skillFile)) continue;

      const metadata = parseSkillFrontmatterFile(skillFile);
      exports.push({
        declaredName,
        name: metadata.name,
        description: metadata.description,
        requires: metadata.requires,
        status: metadata.status,
        replacement: metadata.replacement,
        message: metadata.message,
        skillDir: dirname(skillFile),
        skillFile,
        relativeSkillFile,
      });
    }
  }

  if (exports.length > 0) {
    return exports.sort((a, b) => a.name.localeCompare(b.name));
  }

  const rootSkillFile = join(packageDir, 'SKILL.md');
  if (!existsSync(rootSkillFile)) return [];

  const metadata = parseSkillFrontmatterFile(rootSkillFile);
  return [{
    declaredName: metadata.name,
    name: metadata.name,
    description: metadata.description,
    requires: metadata.requires,
    status: metadata.status,
    replacement: metadata.replacement,
    message: metadata.message,
    skillDir: packageDir,
    skillFile: rootSkillFile,
    relativeSkillFile: 'SKILL.md',
  }];
}
