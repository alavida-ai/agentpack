import { basename, extname, join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extractFrontmatter } from '../../domain/compiler/skill-document-parser.js';

function inferRuntimeName(target) {
  const [packageName, exportName] = target.split(':');
  const packageRuntime = packageName.split('/').pop() || target;
  return exportName ? `${packageRuntime}:${exportName}` : packageRuntime;
}

function replaceAllLiteral(input, searchValue, replacement) {
  if (!searchValue) return input;
  return input.split(searchValue).join(replacement);
}

function buildUsagePhrase(label, runtimeName) {
  const command = `\`/${runtimeName}\``;
  return `${label} (${command})`;
}

function buildReferenceFileName(sourcePath, usedNames) {
  const extension = extname(sourcePath);
  const stem = basename(sourcePath, extension);
  const suffix = extension || '';
  let candidate = `${stem}${suffix}`;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${stem}-${index}${suffix}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function collectSourceReferenceFiles(occurrences) {
  const references = new Map();
  const usedNames = new Set();

  for (const occurrence of occurrences || []) {
    if (occurrence.kind !== 'source') continue;
    if (references.has(occurrence.target)) continue;

    references.set(occurrence.target, {
      sourcePath: occurrence.target,
      fileName: buildReferenceFileName(occurrence.target, usedNames),
    });
  }

  return references;
}

function buildManifestSourcePath(runtimeName, fileName) {
  return `dist/${runtimeName}/references/${fileName}`;
}

function mapCompiledForRuntime(compiled, runtimeName, sourceReferences) {
  const sourcePathByAuthoredPath = new Map(
    [...sourceReferences.values()].map((reference) => [
      reference.sourcePath,
      buildManifestSourcePath(runtimeName, reference.fileName),
    ])
  );

  const mapSourceTarget = (target) => sourcePathByAuthoredPath.get(target) || target;

  return {
    skillImports: Object.fromEntries(
      Object.entries(compiled?.skillImports || {}).map(([key, value]) => [key, { ...value }])
    ),
    sourceBindings: Object.fromEntries(
      Object.entries(compiled?.sourceBindings || {}).map(([key, value]) => [key, {
        ...value,
        sourcePath: mapSourceTarget(value.sourcePath),
      }])
    ),
    occurrences: (compiled?.occurrences || []).map((entry) => ({
      ...entry,
      target: entry.kind === 'source' ? mapSourceTarget(entry.target) : entry.target,
    })),
    edges: (compiled?.edges || []).map((edge) => ({
      ...edge,
      target: edge.kind === 'source_usage' ? mapSourceTarget(edge.target) : edge.target,
    })),
  };
}

function buildRuntimeManifest(packageInfo, manifestExports) {
  return {
    version: 1,
    packageName: packageInfo.packageName,
    packageVersion: packageInfo.packageVersion,
    exports: manifestExports.sort((a, b) => a.runtimeName.localeCompare(b.runtimeName)),
  };
}

function buildRuntimeBody(runtimeExport, sourceReferences) {
  const sourceContent = readFileSync(runtimeExport.skillFilePath, 'utf-8');
  const { body } = extractFrontmatter(sourceContent);
  let runtimeBody = body.replace(/```agentpack[\s\S]*?```/g, '').trim();

  for (const occurrence of runtimeExport.compiled.occurrences || []) {
    if (occurrence.kind === 'skill') {
      const authored = `[${occurrence.label}](skill:${occurrence.alias}){context="${occurrence.context}"}`;
      const runtimeText = buildUsagePhrase(occurrence.label, inferRuntimeName(occurrence.target));
      runtimeBody = replaceAllLiteral(runtimeBody, authored, runtimeText);
      continue;
    }

    const authored = `[${occurrence.label}](source:${occurrence.alias}){context="${occurrence.context}"}`;
    const reference = sourceReferences.get(occurrence.target);
    const runtimeText = `[${occurrence.label}](references/${reference.fileName}){context="${occurrence.context}"}`;
    runtimeBody = replaceAllLiteral(runtimeBody, authored, runtimeText);
  }

  return runtimeBody.replace(/\n{3,}/g, '\n\n').trim();
}

function buildRuntimeDocument(skillFilePath, runtimeBody) {
  const sourceContent = readFileSync(skillFilePath, 'utf-8');
  const { frontmatterText } = extractFrontmatter(sourceContent);

  return [
    '---',
    frontmatterText.trim(),
    '---',
    '',
    runtimeBody,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export function writeRuntimeArtifacts(repoRoot, {
  distRoot,
  packagePath,
  runtimeExports,
  packageInfo,
  manifestRuntimeNames = null,
  clear = true,
} = {}) {
  if (!distRoot || packagePath == null) return {
    runtimeEntries: new Map(),
    manifestExports: [],
  };

  if (clear) {
    rmSync(distRoot, { recursive: true, force: true });
  }
  mkdirSync(distRoot, { recursive: true });

  const runtimeEntries = new Map();
  const manifestExports = [];
  const allowedManifestNames = manifestRuntimeNames ? new Set(manifestRuntimeNames) : null;

  for (const runtimeExport of runtimeExports || []) {
    const runtimeDir = join(distRoot, runtimeExport.runtimeName);
    const runtimeFile = join(runtimeDir, 'SKILL.md');
    const referencesDir = join(runtimeDir, 'references');
    const sourceReferences = collectSourceReferenceFiles(runtimeExport.compiled.occurrences);
    mkdirSync(runtimeDir, { recursive: true });

    if (sourceReferences.size > 0) {
      mkdirSync(referencesDir, { recursive: true });
      for (const reference of sourceReferences.values()) {
        writeFileSync(
          join(referencesDir, reference.fileName),
          readFileSync(join(repoRoot, reference.sourcePath), 'utf-8')
        );
      }
    }

    const runtimeBody = buildRuntimeBody(runtimeExport, sourceReferences);
    writeFileSync(runtimeFile, `${buildRuntimeDocument(runtimeExport.skillFilePath, runtimeBody)}\n`);

    const manifestEntry = {
      id: runtimeExport.exportId,
      declaredName: runtimeExport.declaredName,
      moduleName: runtimeExport.moduleName,
      runtimeName: runtimeExport.runtimeName,
      description: runtimeExport.description,
      status: runtimeExport.status || null,
      replacement: runtimeExport.replacement || null,
      message: runtimeExport.message || null,
      wraps: runtimeExport.wraps || null,
      overrides: runtimeExport.overrides || [],
      isPrimary: Boolean(runtimeExport.isPrimary),
      runtimeDir: `dist/${runtimeExport.runtimeName}`,
      runtimeFile: `dist/${runtimeExport.runtimeName}/SKILL.md`,
      compiled: mapCompiledForRuntime(runtimeExport.compiled, runtimeExport.runtimeName, sourceReferences),
    };

    if (!allowedManifestNames || allowedManifestNames.has(runtimeExport.runtimeName)) {
      manifestExports.push(manifestEntry);
    }

    runtimeEntries.set(runtimeExport.exportId, {
      runtimeDirPath: runtimeDir,
      runtimePath: `${packagePath}/dist/${runtimeExport.runtimeName}`.replace(/\/+/g, '/'),
      runtimeFilePath: runtimeFile,
      runtimeFile: `${packagePath}/dist/${runtimeExport.runtimeName}/SKILL.md`.replace(/\/+/g, '/'),
      manifestEntry,
    });
  }

  if (packageInfo) {
    writeFileSync(
      join(distRoot, 'agentpack.json'),
      `${JSON.stringify(buildRuntimeManifest(packageInfo, manifestExports), null, 2)}\n`
    );
  }

  return {
    runtimeEntries,
    manifestExports,
  };
}

function toRuntimeExport(exportNode) {
  return {
    exportId: exportNode.id,
    declaredName: exportNode.declaredName,
    moduleName: exportNode.moduleName,
    runtimeName: exportNode.runtimeName,
    description: exportNode.description,
    status: exportNode.lifecycleStatus || null,
    replacement: exportNode.replacement || null,
    message: exportNode.message || null,
    wraps: exportNode.wraps || null,
    overrides: exportNode.overrides || [],
    isPrimary: Boolean(exportNode.isPrimary),
    skillFilePath: exportNode.skillFilePath,
    compiled: exportNode.compiled,
  };
}

export function buildRuntimeArtifacts(repoRoot, resolved) {
  const packageDir = resolved?.package?.packageDir;
  const packagePath = resolved?.package?.packagePath;
  const exportNodes = resolved?.package?.exports || [];
  if (!packageDir || packagePath == null) return new Map();

  const { runtimeEntries } = writeRuntimeArtifacts(repoRoot, {
    distRoot: join(packageDir, 'dist'),
    packagePath,
    runtimeExports: exportNodes.map(toRuntimeExport),
    packageInfo: resolved.package,
  });

  return runtimeEntries;
}
