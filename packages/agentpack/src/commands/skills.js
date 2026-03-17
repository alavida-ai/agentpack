import { Command } from 'commander';
import {
  disableInstalledSkillsUseCase,
  enableInstalledSkillsUseCase,
  inspectInstalledSkillsStatusUseCase,
  listInstalledSkillsUseCase,
} from '../application/skills/runtime-activation.js';
import { ValidationError } from '../utils/errors.js';
import { output } from '../utils/output.js';

function hideCommand(command) {
  command._hidden = true;
  return command;
}

function renderListResult(result) {
  output.write('Installed skill packages:');

  if (result.packages.length === 0) {
    output.write('');
    output.write('  none');
    return;
  }

  for (const pkg of result.packages) {
    output.write('');
    const versionLabel = pkg.packageVersion ? `@${pkg.packageVersion}` : '';
    const updateLabel = pkg.updateAvailable ? `  newer version: ${pkg.availableVersion}` : '';
    output.write(`  ${pkg.packageName}${versionLabel}${updateLabel}`);
    for (const skillExport of pkg.exports) {
      const marker = skillExport.enabled.length > 0 ? '●' : '○';
      const runtimes = skillExport.enabled.length > 0 ? skillExport.enabled.join(' · ') : '—';
      output.write(`    ${marker} ${skillExport.runtimeName.padEnd(28, ' ')} ${runtimes}`);
    }
  }
}

function renderActivationResult(result) {
  output.write(`Action: ${result.action}`);
  output.write(`Target: ${result.target}`);
  output.write(`Runtimes: ${result.runtimes.join(', ')}`);
  output.write('Exports:');
  for (const exportId of result.exports) {
    output.write(`- ${exportId}`);
  }
}

function renderStatusResult(result) {
  output.write(`Health: ${result.health}`);
  output.write(`Installed Packages: ${result.installedPackageCount}`);
  output.write(`Installed Exports: ${result.installedExportCount}`);
  output.write(`Enabled Packages: ${result.enabledPackageCount}`);
  output.write(`Enabled Exports: ${result.enabledExportCount}`);
  output.write(`Selection Issues: ${result.selectionIssueCount}`);
  output.write(`Runtime Drift: ${result.runtimeDriftCount}`);
  output.write(`Orphaned Materializations: ${result.orphanedMaterializationCount}`);

  if (result.selectionIssues.length > 0) {
    output.write('');
    output.write('Selection Issues:');
    for (const issue of result.selectionIssues) {
      output.write(`- ${issue.target}`);
      output.write(`  issue: ${issue.code}`);
      output.write(`  runtimes: ${issue.runtimes.join(', ')}`);
    }
  }

  if (result.runtimeDrift.length > 0) {
    output.write('');
    output.write('Runtime Drift:');
    for (const install of result.runtimeDrift) {
      output.write(`- ${install.packageName}`);
      for (const issue of install.issues) {
        output.write(`  issue: ${issue.code}`);
        output.write(`  target: ${issue.target}`);
        if (issue.runtimeName) output.write(`  runtime: ${issue.runtimeName}`);
      }
    }
  }

  if (result.orphanedMaterializations.length > 0) {
    output.write('');
    output.write('Orphaned Materializations:');
    for (const entry of result.orphanedMaterializations) {
      output.write(`- ${entry.target}`);
      output.write(`  issue: ${entry.code}`);
    }
  }
}

function removedPackageManagementError(command, npmCommand) {
  return new ValidationError(`agentpack no longer manages package ${command}`, {
    code: 'package_management_removed',
    suggestion: `Use npm to ${command} packages, then rerun the relevant skills command.`,
    nextSteps: [{
      action: 'run_command',
      reason: `Use npm for package ${command}.`,
      example: {
        command: npmCommand,
      },
    }],
  });
}

function removedCommandError(command, replacement) {
  return new ValidationError(`agentpack skills ${command} has been removed`, {
    code: 'command_removed',
    suggestion: replacement,
  });
}

export function skillsCommand() {
  const cmd = new Command('skills')
    .description('List and activate installed skills from node_modules');

  cmd
    .command('list')
    .description('List installed skill packages and enabled runtimes')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = listInstalledSkillsUseCase();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      renderListResult(result);
    });

  cmd
    .command('enable')
    .description('Materialize one installed skill package or export into runtime directories')
    .option('-r, --runtime <runtime>', 'Enable only for the selected runtime', (value, acc = []) => [...acc, value], [])
    .argument('<target>', 'Installed package name, export id, or installed skill path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = enableInstalledSkillsUseCase(target, {
        runtimes: opts.runtime,
      });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      renderActivationResult(result);
    });

  cmd
    .command('disable')
    .description('Remove one installed skill package or export from runtime directories')
    .option('-r, --runtime <runtime>', 'Disable only for the selected runtime', (value, acc = []) => [...acc, value], [])
    .argument('<target>', 'Installed package name, export id, or installed skill path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = disableInstalledSkillsUseCase(target, {
        runtimes: opts.runtime,
      });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      renderActivationResult(result);
    });

  cmd
    .command('status')
    .description('Show installed-vs-enabled runtime health only')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectInstalledSkillsStatusUseCase();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      renderStatusResult(result);
    });

  const installCmd = cmd
    .command('install')
    .argument('[target]', 'Deprecated package target')
    .action((target) => {
      const packageTarget = target || '<package>';
      throw removedPackageManagementError('installation', `npm install ${packageTarget}`);
    });
  hideCommand(installCmd);

  const uninstallCmd = cmd
    .command('uninstall')
    .argument('[target]', 'Deprecated package target')
    .action((target) => {
      const packageTarget = target || '<package>';
      throw removedPackageManagementError('removal', `npm uninstall ${packageTarget}`);
    });
  hideCommand(uninstallCmd);

  const registryCmd = cmd
    .command('registry')
    .action(() => {
      throw removedCommandError('registry', 'Use npm config, .npmrc, or npm login for registry setup.');
    });
  hideCommand(registryCmd);

  const envCmd = cmd
    .command('env')
    .action(() => {
      throw removedCommandError('env', 'Use `agentpack skills list` for inventory and `agentpack skills status` for runtime health.');
    });
  hideCommand(envCmd);

  const missingCmd = cmd
    .command('missing')
    .action(() => {
      throw removedCommandError('missing', 'Use `agentpack skills status` for runtime health and drift.');
    });
  hideCommand(missingCmd);

  const outdatedCmd = cmd
    .command('outdated')
    .action(() => {
      throw removedCommandError('outdated', 'Use npm to inspect package versions and updates.');
    });
  hideCommand(outdatedCmd);

  return cmd;
}
