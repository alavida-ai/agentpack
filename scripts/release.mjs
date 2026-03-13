import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const rootPackagePath = join(repoRoot, 'package.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function run(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf-8',
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    throw error;
  }
}

function runInherited(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

const rootPackage = readJson(rootPackagePath);
const registry = rootPackage.publishConfig?.registry || 'https://registry.npmjs.org/';

runInherited('npx', ['changeset', 'publish']);

const publishedVersion = run(
  'npm',
  ['view', rootPackage.name, 'version', '--registry', registry],
  { allowFailure: true }
);

if (publishedVersion === rootPackage.version) {
  console.log(`${rootPackage.name}@${rootPackage.version} already published; skipping root publish.`);
} else {
  runInherited('npm', ['publish', '--access', 'public']);
}
