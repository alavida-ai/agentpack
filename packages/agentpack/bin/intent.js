#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function findIntentPackageJson(startDir) {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, 'node_modules', '@tanstack', 'intent', 'package.json');
    if (existsSync(candidate)) return candidate;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

try {
  const packageJsonPath = findIntentPackageJson(packageRoot);
  if (!packageJsonPath) {
    const error = new Error('@tanstack/intent is not installed');
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }

  const intentPackageRoot = dirname(packageJsonPath);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const cliRelativePath = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.intent;

  if (!cliRelativePath) {
    throw new Error('@tanstack/intent does not expose an intent cli binary');
  }

  const result = spawnSync(process.execPath, [join(intentPackageRoot, cliRelativePath), ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 0);
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' || e?.code === 'MODULE_NOT_FOUND') {
    console.error('@tanstack/intent is not installed.');
    console.error('');
    console.error('Install it as a dev dependency:')
    console.error('  npm add -D @tanstack/intent');
    console.error('');
    console.error('Or run directly:')
    console.error('  npx @tanstack/intent@latest list');
    process.exit(1);
  }
  throw e;
}
