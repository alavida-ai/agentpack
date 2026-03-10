import { Command } from 'commander';
import { buildPlugin, inspectPluginBundle, startPluginDev, validatePluginBundle } from '../lib/plugins.js';
import { output } from '../utils/output.js';
import { EXIT_CODES } from '../utils/errors.js';

export function pluginCommand() {
  const cmd = new Command('plugin')
    .description('Inspect and validate bundled plugin packaging');

  cmd
    .command('inspect')
    .description('Inspect the bundle closure implied by a plugin package and its local skill requires')
    .argument('<target>', 'Plugin directory path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectPluginBundle(target);

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Plugin: ${result.pluginName}`);
      output.write(`Package: ${result.packageName}`);
      output.write(`Version: ${result.packageVersion}`);
      output.write(`Path: ${result.pluginPath}`);
      output.write(`Local Skills: ${result.localSkills.length}`);
      output.write(`Direct Bundled Packages: ${result.directPackages.length}`);
      output.write(`Transitive Bundled Packages: ${result.transitivePackages.length}`);

      output.write('');
      output.write('Local Skills:');
      for (const skill of result.localSkills) {
        output.write(`- ${skill.localName}`);
        output.write(`  requires: ${skill.requires.length === 0 ? 'none' : skill.requires.join(', ')}`);
      }

      output.write('');
      output.write('Direct Bundled Packages:');
      if (result.directPackages.length === 0) {
        output.write('- none');
      } else {
        for (const entry of result.directPackages) {
          output.write(`- ${entry.packageName}`);
          output.write(`  skill: ${entry.skillName}`);
          output.write(`  version: ${entry.packageVersion}`);
          output.write(`  source: ${entry.source}`);
        }
      }

      output.write('');
      output.write('Transitive Bundled Packages:');
      if (result.transitivePackages.length === 0) {
        output.write('- none');
      } else {
        for (const entry of result.transitivePackages) {
          output.write(`- ${entry.packageName}`);
          output.write(`  skill: ${entry.skillName}`);
          output.write(`  version: ${entry.packageVersion}`);
          output.write(`  source: ${entry.source}`);
        }
      }

      if (result.unresolvedPackages.length > 0) {
        output.write('');
        output.write('Unresolved Packages:');
        for (const packageName of result.unresolvedPackages) {
          output.write(`- ${packageName}`);
        }
      }
    });

  cmd
    .command('validate')
    .description('Validate that a plugin package can vendor the standalone skills required by its local skills')
    .argument('<target>', 'Plugin directory path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = validatePluginBundle(target);

      if (globalOpts.json) {
        output.json(result);
        if (!result.valid) process.exitCode = EXIT_CODES.VALIDATION;
        return;
      }

      output.write(`Plugin: ${result.pluginName}`);
      output.write(`Package: ${result.packageName}`);
      output.write(`Status: ${result.valid ? 'valid' : 'invalid'}`);
      output.write(`Issues: ${result.issueCount}`);
      output.write(`Direct Bundled Packages: ${result.directPackageCount}`);
      output.write(`Transitive Bundled Packages: ${result.transitivePackageCount}`);

      if (result.issues.length > 0) {
        output.write('');
        output.write('Issues:');
        for (const issue of result.issues) {
          output.write(`- ${issue.code}`);
          output.write(`  message: ${issue.message}`);
          if (issue.packageName) output.write(`  package: ${issue.packageName}`);
          if (issue.skillFile) output.write(`  skill: ${issue.skillFile}`);
        }
      }

      if (!result.valid) {
        process.exitCode = EXIT_CODES.VALIDATION;
      }
    });

  cmd
    .command('build')
    .description('Build a self-contained plugin artifact with vendored standalone skills')
    .option('--clean', 'Remove the previous build output before building')
    .argument('<target>', 'Plugin directory path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = buildPlugin(target, { clean: opts.clean });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Plugin: ${result.pluginName}`);
      output.write(`Output: ${result.outputPath}`);
      output.write(`Local Skills: ${result.localSkills.length}`);
      output.write(`Vendored Skills: ${result.vendoredSkills.length}`);
    });

  cmd
    .command('dev')
    .description('Build a plugin artifact and watch the source tree for rebuilds')
    .option('--clean', 'Remove the previous build output before the initial build')
    .argument('<target>', 'Plugin directory path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const session = startPluginDev(target, {
        clean: opts.clean,
        onBuild(result) {
          if (globalOpts.json) {
            output.json(result);
          } else {
            output.write(`Plugin: ${result.pluginName}`);
            output.write(`Output: ${result.outputPath}`);
            output.write(`Use with: claude --plugin-dir ${result.outputPath}`);
          }
        },
        onRebuild(result) {
          if (result?.error) {
            output.error(`Rebuild failed: ${result.error.message}`);
            return;
          }

          output.write(`Rebuilt plugin: ${result.pluginName}`);
          output.write(`Output: ${result.outputPath}`);
        },
      });

      const stop = () => {
        session.close();
        process.exit(0);
      };

      process.once('SIGTERM', stop);
      process.once('SIGINT', stop);
    });

  return cmd;
}
