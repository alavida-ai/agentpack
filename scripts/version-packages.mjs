import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const rootPackagePath = join(repoRoot, 'package.json');
const trackerPackagePath = join(repoRoot, 'packages', 'agentpack-release', 'package.json');
const lockfilePath = join(repoRoot, 'package-lock.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runChangesetVersion() {
  execFileSync('npx', ['changeset', 'version'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function syncRootVersionFromTracker() {
  const trackerPackage = readJson(trackerPackagePath);
  const rootPackage = readJson(rootPackagePath);
  const lockfile = readJson(lockfilePath);

  rootPackage.version = trackerPackage.version;
  lockfile.version = trackerPackage.version;

  if (lockfile.packages?.['']) {
    lockfile.packages[''].version = trackerPackage.version;
  }

  if (lockfile.packages?.['packages/agentpack-release']) {
    lockfile.packages['packages/agentpack-release'].version = trackerPackage.version;
  }

  writeJson(rootPackagePath, rootPackage);
  writeJson(lockfilePath, lockfile);
}

runChangesetVersion();
syncRootVersionFromTracker();
