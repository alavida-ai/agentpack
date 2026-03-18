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

  const runtimeEntries = new Map();

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

    runtimeEntries.set(exportNode.id, {
      runtimeDirPath: runtimeDir,
      runtimePath: `${packagePath}/dist/${exportNode.runtimeName}`.replace(/\/+/g, '/'),
      runtimeFilePath: runtimeFile,
      runtimeFile: `${packagePath}/dist/${exportNode.runtimeName}/SKILL.md`.replace(/\/+/g, '/'),
    });
  }

  return runtimeEntries;
}
