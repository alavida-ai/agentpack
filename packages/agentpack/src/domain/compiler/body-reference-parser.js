import { visit } from 'unist-util-visit';
import { diagnostic } from './compile-diagnostics.js';

function flattenText(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (!Array.isArray(node.children)) return '';
  return node.children.map((child) => flattenText(child)).join('');
}

function readContextFromTrailingNode(node, linkNode) {
  const value = typeof node?.value === 'string' ? node.value : '';
  const match = value.match(/^\{context="([^"]+)"\}/);
  if (!match) {
    throw diagnostic(`Missing context for ${linkNode.url}`, {
      code: 'missing_reference_context',
      location: linkNode.position?.start
        ? { line: linkNode.position.start.line, column: linkNode.position.start.column }
        : null,
    });
  }

  return match[1];
}

export function parseBodyReferences(tree) {
  const references = [];

  visit(tree, 'paragraph', (paragraph) => {
    const children = Array.isArray(paragraph.children) ? paragraph.children : [];

    for (let index = 0; index < children.length; index += 1) {
      const node = children[index];
      if (node.type !== 'link' || typeof node.url !== 'string') continue;

      const match = node.url.match(/^(skill|source):(.+)$/);
      if (!match) continue;

      const trailingNode = children[index + 1];
      const context = readContextFromTrailingNode(trailingNode, node);

      references.push({
        kind: match[1],
        alias: match[2],
        label: flattenText(node).trim(),
        context,
        location: node.position?.start
          ? { line: node.position.start.line, column: node.position.start.column }
          : null,
      });
    }
  });

  return references;
}
