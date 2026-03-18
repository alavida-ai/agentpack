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

  for (const occurrence of occurrences) {
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

function mapCompiledForRuntime(exportNode, runtimeName, sourceReferences) {
  const sourcePathByAuthoredPath = new Map(
    [...sourceReferences.values()].map((reference) => [
      reference.sourcePath,
      buildManifestSourcePath(runtimeName, reference.fileName),
    ])
  );

  const mapSourceTarget = (target) => sourcePathByAuthoredPath.get(target) || target;

  return {
    skillImports: Object.fromEntries(
      Object.entries(exportNode.compiled.skillImports || {}).map(([key, value]) => [key, { ...value }])
    ),
    sourceBindings: Object.fromEntries(
      Object.entries(exportNode.compiled.sourceBindings || {}).map(([key, value]) => [key, {
        ...value,
        sourcePath: mapSourceTarget(value.sourcePath),
      }])
    ),
    occurrences: (exportNode.compiled.occurrences || []).map((entry) => ({
      ...entry,
      target: entry.kind === 'source' ? mapSourceTarget(entry.target) : entry.target,
    })),
    edges: (exportNode.compiled.edges || []).map((edge) => ({
      ...edge,
      target: edge.kind === 'source_usage' ? mapSourceTarget(edge.target) : edge.target,
    })),
  };
}

function buildRuntimeManifest(packageNode, manifestExports) {
  return {
    version: 1,
    packageName: packageNode.packageName,
    packageVersion: packageNode.packageVersion,
    exports: manifestExports.sort((a, b) => a.runtimeName.localeCompare(b.runtimeName)),
  };
}

function buildRuntimeBody(exportNode, sourceReferences) {
  const sourceContent = readFileSync(exportNode.skillFilePath, 'utf-8');
  const { body } = extractFrontmatter(sourceContent);
  let runtimeBody = body.replace(/```agentpack[\s\S]*?```/g, '').trim();

  for (const occurrence of exportNode.compiled.occurrences) {
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

function buildRuntimeDocument(exportNode, runtimeBody) {
  const sourceContent = readFileSync(exportNode.skillFilePath, 'utf-8');
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

export function buildRuntimeArtifacts(repoRoot, resolved) {
  const packageDir = resolved?.package?.packageDir;
  const packagePath = resolved?.package?.packagePath;
  const exportNodes = resolved?.package?.exports || [];
  if (!packageDir || !packagePath) return new Map();

  const distRoot = join(packageDir, 'dist');
  rmSync(distRoot, { recursive: true, force: true });
  mkdirSync(distRoot, { recursive: true });

  const runtimeEntries = new Map();
  const manifestExports = [];

  for (const exportNode of exportNodes) {
    const runtimeDir = join(distRoot, exportNode.runtimeName);
    const runtimeFile = join(runtimeDir, 'SKILL.md');
    const referencesDir = join(runtimeDir, 'references');
    const sourceReferences = collectSourceReferenceFiles(exportNode.compiled.occurrences);
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

    const runtimeBody = buildRuntimeBody(exportNode, sourceReferences);
    writeFileSync(runtimeFile, `${buildRuntimeDocument(exportNode, runtimeBody)}\n`);

    manifestExports.push({
      id: exportNode.id,
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
      runtimeDir: `dist/${exportNode.runtimeName}`,
      runtimeFile: `dist/${exportNode.runtimeName}/SKILL.md`,
      compiled: mapCompiledForRuntime(exportNode, exportNode.runtimeName, sourceReferences),
    });

    runtimeEntries.set(exportNode.id, {
      runtimeDirPath: runtimeDir,
      runtimePath: `${packagePath}/dist/${exportNode.runtimeName}`.replace(/\/+/g, '/'),
      runtimeFilePath: runtimeFile,
      runtimeFile: `${packagePath}/dist/${exportNode.runtimeName}/SKILL.md`.replace(/\/+/g, '/'),
    });
  }

  writeFileSync(
    join(distRoot, 'agentpack.json'),
    `${JSON.stringify(buildRuntimeManifest(resolved.package, manifestExports), null, 2)}\n`
  );

  return runtimeEntries;
}
