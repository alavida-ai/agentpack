import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { compileSkillDocument } from '../compiler/skill-compiler.js';
import { extractFrontmatter, hasLegacyFrontmatterFields } from '../compiler/skill-document-parser.js';
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
    status: typeof fields.status === 'string'
      ? fields.status
      : (typeof fields.metadata?.status === 'string' ? fields.metadata.status : null),
    replacement: typeof fields.replacement === 'string'
      ? fields.replacement
      : (typeof fields.metadata?.replacement === 'string' ? fields.metadata.replacement : null),
    message: typeof fields.message === 'string'
      ? fields.message
      : (typeof fields.metadata?.message === 'string' ? fields.metadata.message : null),
    wraps: typeof fields.metadata?.wraps === 'string'
      ? fields.metadata.wraps
      : (typeof fields.wraps === 'string' ? fields.wraps : null),
    overrides: Array.isArray(fields.overrides)
      ? fields.overrides
      : (Array.isArray(fields.metadata?.overrides) ? fields.metadata.overrides : []),
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
    exportedSkills: null,
  };
}

export function buildCanonicalSkillRequirement(packageName, skillName) {
  if (!packageName || !skillName) return null;
  return `${packageName}:${skillName}`;
}

export function inferPackageRuntimeNamespace(packageName) {
  return packageName?.split('/').pop() || null;
}

export function inferSkillModuleName(skillEntry) {
  if (skillEntry?.isPrimary || skillEntry?.kind === 'primary') {
    return inferPackageRuntimeNamespace(skillEntry?.packageName || null);
  }
  if (skillEntry?.moduleName) return skillEntry.moduleName;
  if (skillEntry?.skillDir) return basename(skillEntry.skillDir);
  return null;
}

export function buildExpectedRuntimeSkillName(packageName, skillEntry) {
  const namespace = inferPackageRuntimeNamespace(packageName);
  if (!namespace) return skillEntry?.declaredName || skillEntry?.name || null;
  if (skillEntry?.isPrimary || skillEntry?.kind === 'primary') return namespace;
  const moduleName = inferSkillModuleName(skillEntry);
  return moduleName ? `${namespace}:${moduleName}` : namespace;
}

function readCompilerSkillExport(skillFile) {
  const content = readFileSync(skillFile, 'utf-8');
  const { frontmatterText } = extractFrontmatter(content);
  if (!content.includes('```agentpack') && hasLegacyFrontmatterFields(frontmatterText)) {
    throw new ValidationError(
      'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
      {
        code: 'legacy_authoring_not_supported',
        path: skillFile,
      }
    );
  }

  const compiled = compileSkillDocument(content);
  const metadata = parseSkillFrontmatterFile(skillFile);

  return {
    name: compiled.metadata.name,
    description: compiled.metadata.description,
    sources: Object.values(compiled.sourceBindings).map((entry) => entry.sourcePath),
    requires: Object.values(compiled.skillImports).map((entry) => entry.target),
    compiled,
    status: metadata.status,
    replacement: metadata.replacement,
    message: metadata.message,
    wraps: metadata.wraps,
    overrides: metadata.overrides,
  };
}

function listNestedSkillFiles(rootDir) {
  if (!existsSync(rootDir)) return [];

  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === 'SKILL.md') files.push(entryPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

export function listPackageSkillEntries(packageDir) {
  const entries = [];
  const rootSkillFile = join(packageDir, 'SKILL.md');
  const skillRootDir = join(packageDir, 'skills');

  if (existsSync(rootSkillFile)) {
    entries.push({
      kind: 'primary',
      skillDir: packageDir,
      skillFile: rootSkillFile,
      relativeSkillFile: 'SKILL.md',
    });
  }

  for (const skillFile of listNestedSkillFiles(skillRootDir)) {
    entries.push({
      kind: 'named',
      skillDir: dirname(skillFile),
      skillFile,
      relativeSkillFile: relative(packageDir, skillFile).split('\\').join('/'),
    });
  }

  return entries;
}

export function readAuthoredSkillExports(packageDir) {
  const exports = [];
  const skillEntries = listPackageSkillEntries(packageDir);
  const packageMetadata = readPackageMetadata(packageDir);

  for (const entry of skillEntries) {
    const metadata = readCompilerSkillExport(entry.skillFile);
    const moduleName = entry.kind === 'primary'
      ? inferPackageRuntimeNamespace(packageMetadata.packageName)
      : basename(entry.skillDir);
    exports.push({
      declaredName: metadata.name,
      name: moduleName,
      moduleName,
      runtimeName: buildExpectedRuntimeSkillName(packageMetadata.packageName, {
        ...entry,
        moduleName,
      }),
      description: metadata.description,
      sources: metadata.sources,
      requires: metadata.requires,
      status: metadata.status,
      replacement: metadata.replacement,
      message: metadata.message,
      wraps: metadata.wraps,
      overrides: metadata.overrides,
      compiled: metadata.compiled,
      skillDir: entry.skillDir,
      skillFile: entry.skillFile,
      relativeSkillFile: entry.relativeSkillFile,
      isPrimary: entry.kind === 'primary',
    });
  }

  return exports.sort((a, b) => a.name.localeCompare(b.name));
}

function buildInstalledExportId(packageName, runtimeName) {
  const namespace = inferPackageRuntimeNamespace(packageName);
  if (!packageName || !runtimeName || !namespace) return null;
  if (runtimeName === namespace) return packageName;
  if (runtimeName.startsWith(`${namespace}:`)) {
    return `${packageName}:${runtimeName.slice(namespace.length + 1)}`;
  }
  return `${packageName}:${runtimeName}`;
}

function readInstalledSkillManifest(packageDir) {
  const manifestPath = join(packageDir, 'dist', 'agentpack.json');
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

function resolveManifestRepoPath(repoRoot, packageDir, pathValue) {
  if (!pathValue) return null;
  return normalizeDisplayPath(repoRoot, join(packageDir, pathValue));
}

function mapManifestCompiled(repoRoot, packageDir, compiled) {
  if (!compiled) return null;

  const mapSourcePath = (pathValue) => resolveManifestRepoPath(repoRoot, packageDir, pathValue);

  return {
    skillImports: Object.fromEntries(
      Object.entries(compiled.skillImports || {}).map(([key, value]) => [key, { ...value }])
    ),
    sourceBindings: Object.fromEntries(
      Object.entries(compiled.sourceBindings || {}).map(([key, value]) => [key, {
        ...value,
        sourcePath: mapSourcePath(value.sourcePath),
      }])
    ),
    occurrences: (compiled.occurrences || []).map((entry) => ({
      ...entry,
      target: entry.kind === 'source' ? mapSourcePath(entry.target) : entry.target,
    })),
    edges: (compiled.edges || []).map((edge) => ({
      ...edge,
      target: edge.kind === 'source_usage' ? mapSourcePath(edge.target) : edge.target,
    })),
  };
}

function readInstalledManifestExports(repoRoot, packageDir) {
  const packageMetadata = readPackageMetadata(packageDir);
  const manifest = readInstalledSkillManifest(packageDir);
  if (!manifest?.exports || !packageMetadata.packageName) return [];

  return manifest.exports.map((entry) => {
    const runtimeDir = entry.runtimeDir || `dist/${entry.runtimeName}`;
    const runtimeFile = entry.runtimeFile || `${runtimeDir}/SKILL.md`;
    const exportId = entry.id || buildInstalledExportId(packageMetadata.packageName, entry.runtimeName);
    const skillDir = join(packageDir, runtimeDir);
    const skillFile = join(packageDir, runtimeFile);

    return {
      declaredName: entry.declaredName || entry.runtimeName,
      name: entry.moduleName || (entry.isPrimary ? inferPackageRuntimeNamespace(packageMetadata.packageName) : entry.runtimeName),
      moduleName: entry.moduleName || null,
      runtimeName: entry.runtimeName,
      description: entry.description || null,
      sources: (entry.compiled?.sourceBindings ? Object.values(entry.compiled.sourceBindings) : []).map((source) =>
        resolveManifestRepoPath(repoRoot, packageDir, source.sourcePath)
      ),
      requires: (entry.compiled?.skillImports ? Object.values(entry.compiled.skillImports) : []).map((skillImport) => skillImport.target),
      status: entry.status || null,
      replacement: entry.replacement || null,
      message: entry.message || null,
      wraps: entry.wraps || null,
      overrides: entry.overrides || [],
      compiled: mapManifestCompiled(repoRoot, packageDir, entry.compiled),
      skillDir,
      skillFile,
      relativeSkillFile: runtimeFile,
      isPrimary: Boolean(entry.isPrimary),
      id: exportId,
    };
  }).sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
}

function hasDistSkillDirectories(packageDir) {
  const distDir = join(packageDir, 'dist');
  if (!existsSync(distDir)) return false;

  let entries = [];
  try {
    entries = readdirSync(distDir, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => {
    if (!entry.isDirectory()) return false;
    return existsSync(join(distDir, entry.name, 'SKILL.md'));
  });
}

function readInstalledDistDirectoryExports(packageDir) {
  const packageMetadata = readPackageMetadata(packageDir);
  const namespace = inferPackageRuntimeNamespace(packageMetadata.packageName);
  const distDir = join(packageDir, 'dist');
  if (!packageMetadata.packageName || !namespace || !existsSync(distDir)) return [];

  let entries = [];
  try {
    entries = readdirSync(distDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      if (!existsSync(join(distDir, entry.name, 'SKILL.md'))) return false;
      if (!namespace) return false;
      return entry.name === namespace || entry.name.startsWith(`${namespace}:`);
    })
    .map((entry) => {
      const runtimeName = entry.name;
      const skillDir = join(distDir, runtimeName);
      const skillFile = join(skillDir, 'SKILL.md');
      const metadata = parseSkillFrontmatterFile(skillFile);
      const isPrimary = runtimeName === namespace;
      const moduleName = isPrimary && namespace
        ? namespace
        : (runtimeName.startsWith(`${namespace}:`) ? runtimeName.slice(namespace.length + 1) : runtimeName);

      return {
        declaredName: metadata.name,
        name: moduleName,
        moduleName,
        runtimeName,
        description: metadata.description,
        sources: [],
        requires: [],
        status: metadata.status,
        replacement: metadata.replacement,
        message: metadata.message,
        wraps: metadata.wraps,
        overrides: metadata.overrides,
        compiled: null,
        skillDir,
        skillFile,
        relativeSkillFile: relative(packageDir, skillFile).split('\\').join('/'),
        isPrimary,
        id: buildInstalledExportId(packageMetadata.packageName, runtimeName),
      };
    })
    .sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
}

export function hasInstalledSkillArtifacts(packageDir) {
  return Boolean(readInstalledSkillManifest(packageDir))
    || hasDistSkillDirectories(packageDir)
    || listPackageSkillEntries(packageDir).length > 0;
}

export function readInstalledSkillExports(repoRoot, packageDir) {
  const fromManifest = readInstalledManifestExports(repoRoot, packageDir);
  if (fromManifest.length > 0) return fromManifest;

  const fromDistDirectories = readInstalledDistDirectoryExports(packageDir);
  if (fromDistDirectories.length > 0) return fromDistDirectories;

  return readAuthoredSkillExports(packageDir).map((entry) => ({
    ...entry,
    id: entry.isPrimary
      ? readPackageMetadata(packageDir).packageName
      : buildCanonicalSkillRequirement(readPackageMetadata(packageDir).packageName, entry.moduleName),
  }));
}
