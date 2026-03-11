import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outfile = resolve(root, 'src', 'dashboard', 'dist', 'dashboard.js');

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src', 'dashboard', 'main.jsx')],
  bundle: true,
  format: 'esm',
  outfile,
  sourcemap: false,
  jsx: 'automatic',
});
