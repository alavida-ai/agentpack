import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { parseAgentpackBlock } from './agentpack-block-parser.js';
import { parseBodyReferences } from './body-reference-parser.js';
import { diagnostic } from './compile-diagnostics.js';

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

function parseFrontmatter(frontmatterText) {
  const fields = {};

  for (const rawLine of frontmatterText.split('\n')) {
    if (!rawLine.trim()) continue;
    const match = rawLine.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]] = parseScalar(match[2]);
  }

  if (!fields.name) {
    throw diagnostic('SKILL.md frontmatter missing "name" field', {
      code: 'missing_name',
      location: { line: 1, column: 1 },
    });
  }

  if (!fields.description) {
    throw diagnostic('SKILL.md frontmatter missing "description" field', {
      code: 'missing_description',
      location: { line: 1, column: 1 },
    });
  }

  return {
    name: fields.name,
    description: fields.description,
  };
}

export function extractFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    throw diagnostic('SKILL.md missing frontmatter', {
      code: 'missing_frontmatter',
      location: { line: 1, column: 1 },
    });
  }

  const endIndex = content.indexOf('\n---', 4);
  if (endIndex === -1) {
    throw diagnostic('SKILL.md has unclosed frontmatter', {
      code: 'unclosed_frontmatter',
      location: { line: 1, column: 1 },
    });
  }

  const frontmatterText = content.slice(4, endIndex);
  const bodyStartIndex = endIndex + 4 + (content[endIndex + 4] === '\n' ? 1 : 0);
  const body = content.slice(bodyStartIndex);
  const frontmatterLineCount = frontmatterText.split('\n').length + 2;

  return {
    frontmatterText,
    metadata: parseFrontmatter(frontmatterText),
    body,
    bodyStartLine: frontmatterLineCount,
  };
}

export function hasLegacyFrontmatterFields(frontmatterText) {
  return (
    /\brequires:\s*(?:\n\s*-\s+.+|\[[^\]]*\]|.+)/m.test(frontmatterText)
    || /\bmetadata:\s*(?:\n(?:\s+.+\n?)*)?\s+sources:/m.test(frontmatterText)
    || /\bsources:\s*(?:\n\s*-\s+.+|\[[^\]]*\])/m.test(frontmatterText)
  );
}

function findAgentpackBlock(tree) {
  const blocks = [];

  visit(tree, 'code', (node) => {
    if (node.lang === 'agentpack') {
      blocks.push(node);
    }
  });

  if (blocks.length === 0) return null;

  if (blocks.length > 1) {
    throw diagnostic('SKILL.md may contain only one agentpack declarations block', {
      code: 'multiple_agentpack_blocks',
      location: blocks[1].position?.start
        ? { line: blocks[1].position.start.line, column: blocks[1].position.start.column }
        : null,
    });
  }

  return blocks[0];
}

function assertNoLegacyFields(frontmatterText) {
  if (/\brequires:\s*(?:\n\s*-\s+.+|\[[^\]]*\]|.+)/m.test(frontmatterText)) {
    throw diagnostic('Legacy requires frontmatter is not supported in compiler-mode skills', {
      code: 'legacy_requires_not_supported',
    });
  }

  if (
    /\bmetadata:\s*(?:\n(?:\s+.+\n?)*)?\s+sources:/m.test(frontmatterText) ||
    /\bsources:\s*(?:\n\s*-\s+.+|\[[^\]]*\])/m.test(frontmatterText)
  ) {
    throw diagnostic('Legacy metadata.sources frontmatter is not supported in compiler-mode skills', {
      code: 'legacy_sources_not_supported',
    });
  }
}

export function parseSkillDocument(content) {
  const { frontmatterText, metadata, body, bodyStartLine } = extractFrontmatter(content);
  assertNoLegacyFields(frontmatterText);
  const tree = unified().use(remarkParse).parse(body);
  const agentpackBlock = findAgentpackBlock(tree);
  const declarations = agentpackBlock
    ? parseAgentpackBlock(agentpackBlock.value, {
      startLine: bodyStartLine + (agentpackBlock.position?.start?.line || 1) - 1,
    })
    : { imports: [], sources: [] };
  const references = parseBodyReferences(tree);

  return {
    metadata,
    imports: declarations.imports,
    sources: declarations.sources,
    references,
  };
}
