#!/usr/bin/env node

import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow: local node_modules install, package-runner exec, or monorepo workspace dev
const isLocal = __dirname.includes(`${sep}node_modules${sep}`);
const ua = process.env.npm_config_user_agent || '';
const isPackageRunner = Boolean(
  process.env.npm_execpath          // npx / npm exec sets this
  || process.env._npx_is_active     // npx >=7 marker
  || process.env.npm_command === 'exec'
  || (ua.startsWith('pnpm/') && process.env.PNPM_HOME)   // pnpm dlx
  || ua.startsWith('yarn/')                                // yarn dlx
);
const isWorkspaceDev = __dirname.includes('packages/agentpack/bin');

if (!isLocal && !isPackageRunner && !isWorkspaceDev) {
  console.error('@alavida/agentpack is not installed.');
  console.error('');
  console.error('Install it as a dev dependency:');
  console.error('  npm add -D @alavida/agentpack');
  console.error('');
  console.error('Or run directly:');
  console.error('  npx @alavida/agentpack@latest --help');
  process.exit(1);
}

const { run } = await import('../src/cli.js');
run(process.argv);
