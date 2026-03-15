import { diagnostic } from './compile-diagnostics.js';

const LOCAL_ALIAS_PATTERN = '[A-Za-z_][\\w]*';
const IMPORTED_NAME_PATTERN = '[A-Za-z_][\\w-]*';

function parseNamedImports(segment, lineNumber) {
  const trimmed = segment.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw diagnostic('Malformed named skill import list', {
      code: 'malformed_skill_import',
      location: { line: lineNumber },
    });
  }

  const entries = trimmed.slice(1, -1).split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) {
    throw diagnostic('Named skill import list cannot be empty', {
      code: 'malformed_skill_import',
      location: { line: lineNumber },
    });
  }

  return entries.map((entry) => {
    const match = entry.match(new RegExp(`^(${IMPORTED_NAME_PATTERN})(?:\\s+as\\s+(${LOCAL_ALIAS_PATTERN}))?$`));
    if (!match) {
      throw diagnostic(`Malformed named skill import entry: ${entry}`, {
        code: 'malformed_skill_import',
        location: { line: lineNumber },
      });
    }

    return {
      importedName: match[1],
      localName: match[2] || match[1],
    };
  });
}

function ensureNoDuplicateAlias(aliasMap, localName, kind, lineNumber) {
  if (aliasMap.has(localName)) {
    throw diagnostic(`Duplicate ${kind} alias: ${localName}`, {
      code: 'duplicate_alias',
      location: { line: lineNumber },
      details: { alias: localName },
    });
  }

  aliasMap.set(localName, true);
}

function parseImportClause(clause, lineNumber, aliasMap) {
  const trimmed = clause.trim();
  const defaultAndNamedMatch = trimmed.match(
    new RegExp(`^(${LOCAL_ALIAS_PATTERN})\\s*,\\s*(\\{[^}]+\\})$`)
  );
  const defaultOnlyMatch = trimmed.match(new RegExp(`^(${LOCAL_ALIAS_PATTERN})$`));

  if (defaultAndNamedMatch) {
    ensureNoDuplicateAlias(aliasMap, defaultAndNamedMatch[1], 'skill import', lineNumber);
    const namedImports = parseNamedImports(defaultAndNamedMatch[2], lineNumber);
    for (const entry of namedImports) {
      ensureNoDuplicateAlias(aliasMap, entry.localName, 'skill import', lineNumber);
    }
    return {
      defaultImport: defaultAndNamedMatch[1],
      namedImports,
    };
  }

  if (trimmed.startsWith('{')) {
    const namedImports = parseNamedImports(trimmed, lineNumber);
    for (const entry of namedImports) {
      ensureNoDuplicateAlias(aliasMap, entry.localName, 'skill import', lineNumber);
    }
    return {
      defaultImport: null,
      namedImports,
    };
  }

  if (defaultOnlyMatch) {
    ensureNoDuplicateAlias(aliasMap, defaultOnlyMatch[1], 'skill import', lineNumber);
    return {
      defaultImport: defaultOnlyMatch[1],
      namedImports: [],
    };
  }

  throw diagnostic(`Malformed skill import clause: ${clause}`, {
    code: 'malformed_skill_import',
    location: { line: lineNumber },
  });
}

export function parseAgentpackBlock(blockValue, { startLine = 1 } = {}) {
  const lines = blockValue.split('\n');
  const aliases = new Map();
  const imports = [];
  const sources = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const lineNumber = startLine + index;
    if (!line) continue;

    const importMatch = line.match(/^import\s+(.+)\s+from\s+skill\s+"([^"]+)"$/);
    if (importMatch) {
      const clause = parseImportClause(importMatch[1], lineNumber, aliases);
      imports.push({
        packageSpecifier: importMatch[2],
        defaultImport: clause.defaultImport,
        namedImports: clause.namedImports,
      });
      continue;
    }

    const sourceMatch = line.match(new RegExp(`^source\\s+(${LOCAL_ALIAS_PATTERN})\\s*=\\s*"([^"]+)"$`));
    if (sourceMatch) {
      ensureNoDuplicateAlias(aliases, sourceMatch[1], 'source binding', lineNumber);
      sources.push({
        localName: sourceMatch[1],
        sourcePath: sourceMatch[2],
      });
      continue;
    }

    throw diagnostic(`Unrecognized agentpack declaration: ${line}`, {
      code: 'invalid_agentpack_declaration',
      location: { line: lineNumber },
    });
  }

  return {
    imports,
    sources,
  };
}
