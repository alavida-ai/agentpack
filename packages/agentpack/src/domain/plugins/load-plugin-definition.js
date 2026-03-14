import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { normalizeRepoPath } from '../skills/skill-model.js';
import { findRepoRoot } from '../../lib/context.js';
import { NotFoundError } from '../../utils/errors.js';
import { PluginDiagnosticError } from './plugin-diagnostic-error.js';
import { getPluginRequirementLevel } from './plugin-requirements.js';

function resolvePluginDir(repoRoot, target) {
  const absoluteTarget = resolve(repoRoot, target);
  if (!existsSync(absoluteTarget)) {
    throw new NotFoundError('plugin not found', {
      code: 'plugin_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  return absoluteTarget;
}

function inferPluginPackageName(pluginDir) {
  return `@alavida-ai/plugin-${basename(pluginDir)}`;
}

function readPluginPackageJson(repoRoot, pluginDir, requirementLevel) {
  const packageJsonPath = join(pluginDir, 'package.json');
  const displayPath = normalizeRepoPath(repoRoot, packageJsonPath);
  const example = {
    name: inferPluginPackageName(pluginDir),
    version: '0.1.0',
  };

  if (!existsSync(packageJsonPath)) {
    throw new PluginDiagnosticError('No package.json found for plugin target', {
      code: 'missing_plugin_package_json',
      path: displayPath,
      nextSteps: [
        {
          action: 'create_file',
          path: displayPath,
          reason: 'A plugin must declare package metadata before it can be inspected',
          example,
        },
      ],
      details: {
        requirementLevel,
        missing: ['package.json'],
      },
    });
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    throw new PluginDiagnosticError('Plugin package.json contains invalid JSON', {
      code: 'invalid_plugin_package_json',
      path: displayPath,
      nextSteps: [
        {
          action: 'edit_file',
          path: displayPath,
          reason: 'Inspect and validate require a readable package.json file',
          example,
        },
      ],
      details: {
        requirementLevel,
      },
    });
  }

  const missingFields = ['name', 'version'].filter((field) => !pkg[field]);
  if (missingFields.length > 0) {
    throw new PluginDiagnosticError(`Plugin package.json missing required fields: ${missingFields.join(', ')}`, {
      code: 'missing_plugin_package_fields',
      path: displayPath,
      nextSteps: [
        {
          action: 'edit_file',
          path: displayPath,
          reason: 'A plugin package.json must include required package metadata before inspection can continue',
          example: {
            ...example,
            ...('name' in pkg ? { name: pkg.name } : {}),
            ...('version' in pkg ? { version: pkg.version } : {}),
          },
        },
      ],
      details: {
        requirementLevel,
        missingFields,
      },
    });
  }

  return {
    packageJsonPath,
    packageJson: pkg,
    packageName: pkg.name,
    packageVersion: pkg.version,
  };
}

function readPluginManifest(repoRoot, pluginDir, requirementLevel) {
  const pluginManifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  const displayPath = normalizeRepoPath(repoRoot, pluginManifestPath);

  if (!existsSync(pluginManifestPath)) {
    throw new PluginDiagnosticError('Plugin manifest is missing', {
      code: 'missing_plugin_manifest',
      path: displayPath,
      nextSteps: [
        {
          action: 'create_file',
          path: displayPath,
          reason: 'Plugin commands require .claude-plugin/plugin.json to describe the runtime plugin entrypoint',
          example: {
            name: basename(pluginDir),
            description: 'Describe what this plugin provides.',
          },
        },
      ],
      details: {
        requirementLevel,
        missing: ['.claude-plugin/plugin.json'],
      },
    });
  }

  return {
    pluginManifestPath,
    pluginManifest: JSON.parse(readFileSync(pluginManifestPath, 'utf-8')),
  };
}

export function loadPluginDefinition(target, {
  cwd = process.cwd(),
  requirementLevel = 'inspect',
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const pluginDir = resolvePluginDir(repoRoot, target);
  const requirements = getPluginRequirementLevel(requirementLevel);

  const packageData = readPluginPackageJson(repoRoot, pluginDir, requirementLevel);
  const manifestData = requirements.pluginManifest
    ? readPluginManifest(repoRoot, pluginDir, requirementLevel)
    : {
      pluginManifestPath: join(pluginDir, '.claude-plugin', 'plugin.json'),
      pluginManifest: null,
    };

  return {
    repoRoot,
    pluginDir,
    packageJsonPath: packageData.packageJsonPath,
    packageJson: packageData.packageJson,
    packageName: packageData.packageName,
    packageVersion: packageData.packageVersion,
    pluginManifestPath: manifestData.pluginManifestPath,
    pluginManifest: manifestData.pluginManifest,
  };
}
