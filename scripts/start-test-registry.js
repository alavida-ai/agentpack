import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startRegistry } from '../test/integration/registry-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const port = Number(process.env.AGENTPACK_TEST_REGISTRY_PORT || '4873');

const registry = await startRegistry({ repoRoot, port });

process.stdout.write(`${JSON.stringify({ url: registry.url, root: registry.root })}\n`);

const stop = async () => {
  await registry.stop();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
