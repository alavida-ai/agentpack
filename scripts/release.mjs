import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const rootPackagePath = join(repoRoot, 'package.json');
const packagesDir = join(repoRoot, 'packages');

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

function readJsonFromGit(revision, relativePath) {
  const source = run('git', ['show', `${revision}:${relativePath}`], { allowFailure: true });
  if (!source) return null;
  return JSON.parse(source);
}

function listPackageManifestPaths() {
  const manifestPaths = ['package.json'];
  if (!existsSync(packagesDir)) return manifestPaths;

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relativePath = `packages/${entry.name}/package.json`;
    if (existsSync(join(repoRoot, relativePath))) {
      manifestPaths.push(relativePath);
    }
  }

  return manifestPaths;
}

function listVersionBumpedPackages() {
  return listPackageManifestPaths()
    .map((manifestPath) => {
      const currentPackage = readJson(join(repoRoot, manifestPath));
      const previousPackage = readJsonFromGit('HEAD^', manifestPath);

      if (manifestPath !== 'package.json') {
        if (!previousPackage) return null;
        if (previousPackage.version === currentPackage.version) return null;
      }
      if (currentPackage.private) return null;

      return {
        manifestPath,
        packageName: currentPackage.name,
        version: currentPackage.version,
        registry: currentPackage.publishConfig?.registry || 'https://registry.npmjs.org/',
        workspace: manifestPath === 'package.json' ? null : currentPackage.name,
      };
    })
    .filter(Boolean);
}

function publishPackage(pkg) {
  const publishedVersion = run(
    'npm',
    ['view', pkg.packageName, 'version', '--registry', pkg.registry],
    { allowFailure: true }
  );

  if (publishedVersion === pkg.version) {
    console.log(`${pkg.packageName}@${pkg.version} already published; skipping.`);
    return;
  }

  const args = ['publish'];
  if (pkg.workspace) {
    args.push('--workspace', pkg.workspace);
  }
  runInherited('npm', args);
}

const packagesToPublish = listVersionBumpedPackages();

if (packagesToPublish.length === 0) {
  console.log('No version-bumped publishable packages found in HEAD^..HEAD; skipping publish.');
} else {
  for (const pkg of packagesToPublish) {
    publishPackage(pkg);
  }
}
