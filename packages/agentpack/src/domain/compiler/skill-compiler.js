import { parseSkillDocument } from './skill-document-parser.js';
import { diagnostic } from './compile-diagnostics.js';

function buildSkillImports(parsed) {
  const imports = {};

  for (const entry of parsed.imports) {
    if (entry.defaultImport) {
      imports[entry.defaultImport] = {
        kind: 'skill',
        localName: entry.defaultImport,
        packageSpecifier: entry.packageSpecifier,
        importedName: null,
        target: entry.packageSpecifier,
      };
    }

    for (const namedImport of entry.namedImports) {
      imports[namedImport.localName] = {
        kind: 'skill',
        localName: namedImport.localName,
        packageSpecifier: entry.packageSpecifier,
        importedName: namedImport.importedName,
        target: `${entry.packageSpecifier}:${namedImport.importedName}`,
      };
    }
  }

  return imports;
}

function buildSourceBindings(parsed) {
  return Object.fromEntries(
    parsed.sources.map((entry) => [
      entry.localName,
      {
        kind: 'source',
        localName: entry.localName,
        sourcePath: entry.sourcePath,
      },
    ])
  );
}

function aggregateOccurrences(rootSkillId, occurrences) {
  const edgeMap = new Map();

  for (const occurrence of occurrences) {
    const kind = occurrence.kind === 'skill' ? 'skill_usage' : 'source_usage';
    const key = `${kind}::${occurrence.target}`;
    const current = edgeMap.get(key) || {
      source: rootSkillId,
      target: occurrence.target,
      kind,
      labels: [],
      contexts: [],
      occurrenceCount: 0,
    };

    if (!current.labels.includes(occurrence.label)) {
      current.labels.push(occurrence.label);
    }
    if (!current.contexts.includes(occurrence.context)) {
      current.contexts.push(occurrence.context);
    }
    current.occurrenceCount += 1;
    edgeMap.set(key, current);
  }

  return [...edgeMap.values()];
}

export function compileSkillDocument(content) {
  const parsed = parseSkillDocument(content);
  const skillImports = buildSkillImports(parsed);
  const sourceBindings = buildSourceBindings(parsed);
  const rootSkillId = `skill:${parsed.metadata.name}`;
  const occurrences = parsed.references.map((reference) => {
    const primarySymbol = reference.kind === 'skill'
      ? skillImports[reference.alias]
      : sourceBindings[reference.alias];
    const alternateSymbol = reference.kind === 'skill'
      ? sourceBindings[reference.alias]
      : skillImports[reference.alias];
    const symbol = primarySymbol || alternateSymbol || null;

    if (!symbol) {
      throw diagnostic(`Undeclared ${reference.kind} alias: ${reference.alias}`, {
        code: 'undeclared_alias',
        location: reference.location,
      });
    }

    if (symbol.kind !== reference.kind) {
      throw diagnostic(
        `${reference.alias} is declared as ${symbol.kind} but used as ${reference.kind}`,
        {
          code: 'reference_kind_mismatch',
          location: reference.location,
        }
      );
    }

    return {
      kind: reference.kind,
      alias: reference.alias,
      label: reference.label,
      context: reference.context,
      target: reference.kind === 'skill' ? symbol.target : symbol.sourcePath,
      location: reference.location,
    };
  });

  return {
    metadata: parsed.metadata,
    skillImports,
    sourceBindings,
    occurrences,
    edges: aggregateOccurrences(rootSkillId, occurrences),
  };
}
