import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function hashFile(filePath) {
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `sha256:${digest}`;
}
