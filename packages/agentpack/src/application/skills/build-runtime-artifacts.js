import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

function buildUsagePhrase(runtimeName, context) {
  const normalizedContext = (context || '').trim();
  if (/^(for|to|as)\b/i.test(normalizedContext)) {
    return `/${runtimeName} ${normalizedContext}`;
  }
  return `/${runtimeName} for ${normalizedContext}`;
}

function normalizeSourceContent(content) {
  return content.trim();
}

function buildSourceMaterialSection(repoRoot, occurrences) {
  const sourceEntries = [];
  const seen = new Set();

  for (const occurrence of occurrences) {
    if (occurrence.kind !== 'source') continue;
    const key = `${occurrence.target}::${occurrence.label}::${occurrence.context}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sourceContent = normalizeSourceContent(
      readFileSync(join(repoRoot, occurrence.target), 'utf-8')
    );

    sourceEntries.push([
      `### ${occurrence.label}`,
      '',
      `Use this for ${occurrence.context}.`,
      '',
      sourceContent,
    ].join('\n'));
  }

  if (sourceEntries.length === 0) return '';
  return [
    '## Source Material',
    '',
    ...sourceEntries,
  ].join('\n\n');
}

function buildRuntimeBody(repoRoot, exportNode) {
  const sourceContent = readFileSync(exportNode.skillFilePath, 'utf-8');
  const { body } = extractFrontmatter(sourceContent);
  let runtimeBody = body.replace(/```agentpack[\s\S]*?```/g, '').trim();

  for (const occurrence of exportNode.compiled.occurrences) {
    if (occurrence.kind === 'skill') {
      const authored = `[${occurrence.label}](skill:${occurrence.alias}){context="${occurrence.context}"}`;
      const runtimeText = buildUsagePhrase(inferRuntimeName(occurrence.target), occurrence.context);
      runtimeBody = replaceAllLiteral(runtimeBody, authored, runtimeText);
      continue;
    }

    const authored = `[${occurrence.label}](source:${occurrence.alias}){context="${occurrence.context}"}`;
    runtimeBody = replaceAllLiteral(runtimeBody, authored, occurrence.label);
  }

  const sourceSection = buildSourceMaterialSection(repoRoot, exportNode.compiled.occurrences);
  return [
    runtimeBody,
    sourceSection,
  ]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(runtimeFile, `${buildRuntimeBody(repoRoot, exportNode)}\n`);

    runtimeEntries.set(exportNode.id, {
      runtimeDirPath: runtimeDir,
      runtimePath: `${packagePath}/dist/${exportNode.runtimeName}`.replace(/\/+/g, '/'),
      runtimeFilePath: runtimeFile,
      runtimeFile: `${packagePath}/dist/${exportNode.runtimeName}/SKILL.md`.replace(/\/+/g, '/'),
    });
  }

  return runtimeEntries;
}
