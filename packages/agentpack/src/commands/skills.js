import { Command } from 'commander';
import { buildCompiledStateUseCase } from '../application/skills/build-compiled-state.js';
import { inspectSkillUseCase } from '../application/skills/inspect-skill.js';
import { inspectStaleSkillUseCase, listStaleSkillsUseCase } from '../application/skills/list-stale-skills.js';
import { materializeCompiledStateUseCase } from '../application/skills/materialize-compiled-state.js';
import { validateSkillsUseCase } from '../application/skills/validate-skills.js';
import {
  inspectMissingSkillDependencies,
  inspectSkillsStatus,
  inspectRegistryConfig,
  inspectSkillsEnv,
  installSkills,
  listOutdatedSkills,
  resolveInstallTargets,
  cleanupSkillDevSession,
  startSkillDev,
  unlinkSkill,
  uninstallSkills,
} from '../lib/skills.js';
import { output } from '../utils/output.js';
import { EXIT_CODES } from '../utils/errors.js';

export function skillsCommand() {
  const cmd = new Command('skills')
    .description('Inspect and manage package-backed skills');

  const devCmd = cmd
    .command('dev')
    .description('Link one local packaged skill for local Claude and agent discovery')
    .option('--no-sync', 'Skip syncing managed package dependencies from requires')
    .option('--no-dashboard', 'Skip starting the local skill development workbench')
    .argument('[target]', 'Packaged skill directory or SKILL.md path')
    .action(async (target, opts, command) => {
      if (!target) {
        command.help({ error: true });
      }
      const globalOpts = command.optsWithGlobals();
      const session = startSkillDev(target, {
        sync: opts.sync,
        dashboard: opts.dashboard,
        onStart(result) {
          if (globalOpts.json) {
            output.json(result);
            return;
          }

          output.write(`Linked Skill: ${result.name}`);
          output.write(`Path: ${result.path}`);
          output.write(`Synced Added: ${result.synced.added.length}`);
          output.write(`Synced Removed: ${result.synced.removed.length}`);
          output.write(`Linked Skills: ${result.linkedSkills.length}`);
          for (const link of result.links) {
            output.write(`Linked: ${link}`);
          }
          if (result.workbench?.enabled) {
            output.write(`Workbench URL: ${result.workbench.url}`);
          }
          output.write('Note: if your current agent session was already running, start a fresh session to pick up newly linked skills.');
          if (result.unresolved.length > 0) {
            output.write('Unresolved Dependencies:');
            for (const dependency of result.unresolved) {
              output.write(`- ${dependency}`);
            }
            output.write('Are you sure those skills are installed or available locally?');
          }
        },
        onRebuild(result) {
          if (result?.error) {
            output.error(`Skill dev rebuild failed: ${result.error.message}`);
            return;
          }

          output.write(`Reloaded Skill: ${result.name}`);
          output.write(`Path: ${result.path}`);
        },
      });

      await session.ready;
    });

  devCmd
    .command('cleanup')
    .description('Remove recorded skills dev links for a stale session')
    .option('--force', 'Remove recorded links even if the session pid still appears alive')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = cleanupSkillDevSession({ force: opts.force });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Cleaned: ${result.cleaned}`);
      if (result.name) output.write(`Root Skill: ${result.name}`);
      for (const removed of result.removed) {
        output.write(`Removed: ${removed}`);
      }
    });

  cmd
    .command('unlink')
    .description('Remove one locally linked skill from Claude and agent discovery paths')
    .option('--recursive', 'Remove the active dev root and its recorded transitive links')
    .argument('<name>', 'Skill frontmatter name')
    .action((name, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = unlinkSkill(name, { recursive: opts.recursive });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Unlinked Skill: ${result.name}`);
      for (const removed of result.removed) {
        output.write(`Removed: ${removed}`);
      }
    });

  cmd
    .command('status')
    .description('Show environment health for installed skills, outdated packages, and registry config')
    .action(async (opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = await inspectSkillsStatus();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Health: ${result.health}`);
      output.write(`Installed Skills: ${result.installedCount}`);
      output.write(`Direct Skills: ${result.directCount}`);
      output.write(`Transitive Skills: ${result.transitiveCount}`);
      output.write(`Outdated Skills: ${result.outdatedCount}`);
      output.write(`Deprecated Skills: ${result.deprecatedCount}`);
      output.write(`Incomplete Skills: ${result.incompleteCount}`);
      output.write(`Runtime Drifted Skills: ${result.runtimeDriftCount}`);
      output.write(`Orphaned Materializations: ${result.orphanedMaterializationCount}`);
      output.write(`Registry Configured: ${result.registry.configured}`);

      if (result.outdated.length > 0) {
        output.write('');
        output.write('Outdated:');
        for (const skill of result.outdated) {
          output.write(`- ${skill.packageName}`);
          output.write(`  current: ${skill.currentVersion}`);
          output.write(`  available: ${skill.availableVersion}`);
          output.write(`  source: ${skill.source}`);
        }
      }

      if (result.deprecated.length > 0) {
        output.write('');
        output.write('Deprecated:');
        for (const skill of result.deprecated) {
          output.write(`- ${skill.packageName}`);
          output.write(`  status: ${skill.status}`);
          if (skill.replacement) output.write(`  replacement: ${skill.replacement}`);
        }
      }

      if (result.incomplete.length > 0) {
        output.write('');
        output.write('Incomplete:');
        for (const skill of result.incomplete) {
          output.write(`- ${skill.packageName}`);
          for (const missing of skill.missing) {
            output.write(`  missing: ${missing.packageName}`);
            output.write(`  recommended: ${missing.recommendedCommand}`);
          }
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
    });

  cmd
    .command('registry')
    .description('Inspect repo-local npm registry configuration for managed private skill packages')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectRegistryConfig();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Scope: ${result.scope}`);
      output.write(`Configured: ${result.configured}`);
      output.write(`Registry: ${result.registry || 'missing'}`);
      output.write(`Always Auth: ${result.alwaysAuth}`);
      if (result.npmrcPath) output.write(`Path: ${result.npmrcPath}`);

      if (result.auth.mode === 'env') {
        output.write('Auth: environment variable reference');
        output.write(`Auth Key: ${result.auth.key}`);
      } else if (result.auth.mode === 'literal') {
        output.write('Auth: literal token value');
      } else {
        output.write('Auth: missing');
      }
    });

  cmd
    .command('missing')
    .description('Show local or installed skills with unmet required skill dependencies')
    .argument('[target]', 'Optional installed package name or skill path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectMissingSkillDependencies({ target });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Skills With Missing Dependencies: ${result.count}`);
      if (result.count === 0) return;

      for (const skill of result.skills) {
        output.write('');
        output.write(`- ${skill.packageName || skill.skillFile || skill.name}`);
        for (const missing of skill.missing) {
          output.write(`  - ${missing.packageName}`);
          output.write(`    recommended: ${missing.recommendedCommand}`);
        }
      }
    });

  cmd
    .command('build')
    .description('Compile one packaged skill into .agentpack/compiled.json')
    .argument('<target>', 'Packaged skill directory or SKILL.md path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = buildCompiledStateUseCase(target);

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Root Skill: ${result.rootSkill}`);
      output.write(`Compiled Path: ${result.compiledPath}`);
      output.write(`Skills: ${result.skillCount}`);
      output.write(`Sources: ${result.sourceCount}`);
      output.write(`Occurrences: ${result.occurrenceCount}`);
      output.write(`Edges: ${result.edgeCount}`);
    });

  cmd
    .command('materialize')
    .description('Materialize runtime outputs from .agentpack/compiled.json')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = materializeCompiledStateUseCase();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Root Skill: ${result.rootSkill}`);
      output.write(`Materialization Path: ${result.materializationPath}`);
      output.write(`Adapters: ${result.adapterCount}`);
      for (const [adapterName, outputs] of Object.entries(result.outputs)) {
        output.write(`${adapterName}: ${outputs.length}`);
      }
    });

  cmd
    .command('inspect')
    .description('Inspect one packaged or local skill')
    .argument('<target>', 'Skill directory, SKILL.md path, or package name')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectSkillUseCase(target);

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      if (result.kind === 'package') {
        output.write(`Package: ${result.packageName}`);
        if (result.packageVersion) output.write(`Version: ${result.packageVersion}`);
        output.write(`Path: ${result.packagePath}`);
        output.write('');
        output.write('Exports:');
        for (const entry of result.exports) {
          output.write(`- ${entry.name}`);
          output.write(`  path: ${entry.skillFile}`);
        }
        return;
      }

      output.write(`Skill: ${result.name}`);
      if (result.description) output.write(`Description: ${result.description}`);
      if (result.packageName) output.write(`Package: ${result.packageName}`);
      if (result.packageVersion) output.write(`Version: ${result.packageVersion}`);
      if (result.status) output.write(`Status: ${result.status}`);
      if (result.replacement) output.write(`Replacement: ${result.replacement}`);
      if (result.message) output.write(`Message: ${result.message}`);
      if (result.wraps) output.write(`Wraps: ${result.wraps}`);
      output.write(`Path: ${result.skillFile}`);

      output.write('');
      output.write('Sources:');
      if (result.sources.length === 0) {
        output.write('- none');
      } else {
        for (const source of result.sources) output.write(`- ${source}`);
      }

      output.write('');
      output.write('Requires:');
      if (result.requires.length === 0) {
        output.write('- none');
      } else {
        for (const requirement of result.requires) output.write(`- ${requirement}`);
      }

      if (result.overrides?.length) {
        output.write('');
        output.write('Overrides:');
        for (const override of result.overrides) output.write(`- ${override}`);
      }
    });

  cmd
    .command('stale')
    .description('Show stale packaged skills from recorded semantic state')
    .argument('[target]', 'Optional package name or skill path')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();

      if (target) {
        const result = inspectStaleSkillUseCase(target);

        if (globalOpts.json) {
          output.json(result);
          return;
        }

        output.write(`Skill: ${result.packageName}`);
        output.write(`Path: ${result.skillPath}`);
        output.write('');
        output.write('Changed Sources:');
        for (const change of result.changedSources) {
          output.write(`- ${change.path}`);
          output.write(`  Recorded: ${change.recorded}`);
          output.write(`  Current: ${change.current}`);
        }
        return;
      }

      const results = listStaleSkillsUseCase();

      if (globalOpts.json) {
        output.json({
          count: results.length,
          skills: results,
        });
        return;
      }

      output.write(`Stale Skills: ${results.length}`);
      if (results.length === 0) return;

      for (const result of results) {
        output.write('');
        output.write(`- ${result.packageName}`);
        output.write(`  path: ${result.skillPath}`);
        output.write(`  changed_sources: ${result.changedSources.length}`);
      }
    });

  cmd
    .command('validate')
    .description('Validate one packaged skill or all authored packaged skills')
    .argument('[target]', 'Optional packaged skill directory, SKILL.md path, or package name')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = validateSkillsUseCase(target);

      if (globalOpts.json) {
        output.json(target && result.count === 1 ? result.skills[0] : result);
        if (!result.valid) process.exitCode = EXIT_CODES.VALIDATION;
        return;
      }

      if (target) {
        if (result.count > 1) {
          output.write(`Validated Skills: ${result.count}`);
          output.write(`Valid Skills: ${result.validCount}`);
          output.write(`Invalid Skills: ${result.invalidCount}`);
          for (const skill of result.skills) {
            output.write('');
            output.write(`- ${skill.name || skill.packageName || skill.packagePath}`);
            output.write(`  status: ${skill.valid ? 'valid' : 'invalid'}`);
            output.write(`  path: ${skill.skillFile}`);
          }
          if (!result.valid) process.exitCode = EXIT_CODES.VALIDATION;
          return;
        }

        const skill = result.skills[0];
        output.write(`Skill: ${skill.packageName || skill.packagePath}`);
        output.write(`Status: ${skill.valid ? 'valid' : 'invalid'}`);
        output.write(`Issues: ${skill.issues.length}`);
        if (skill.valid && skill.nextSteps.length > 0) {
          output.write('');
          output.write('Next Steps:');
          for (const step of skill.nextSteps) {
            output.write(`- ${step.command}`);
            if (step.registry) output.write(`  registry: ${step.registry}`);
          }
        }
        if (skill.issues.length > 0) {
          output.write('');
          output.write('Validation Issues:');
          for (const issue of skill.issues) {
            output.write(`- ${issue.code}: ${issue.message}`);
            if (issue.path) output.write(`  path: ${issue.path}`);
            if (issue.dependency) output.write(`  dependency: ${issue.dependency}`);
          }
        }
      } else {
        output.write(`Validated Skills: ${result.count}`);
        output.write(`Valid Skills: ${result.validCount}`);
        output.write(`Invalid Skills: ${result.invalidCount}`);

        if (result.invalidCount > 0) {
          for (const skill of result.skills.filter((entry) => !entry.valid)) {
            output.write('');
            output.write(`- ${skill.packageName || skill.packagePath}`);
            for (const issue of skill.issues) {
              output.write(`  ${issue.code}: ${issue.message}`);
            }
          }
        }
      }

      if (!result.valid) process.exitCode = EXIT_CODES.VALIDATION;
    });

  cmd
    .command('install')
    .description('Install one packaged skill and materialize the resolved graph')
    .argument('[target]', 'Packaged skill directory or package target')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const targets = resolveInstallTargets({
        target,
        workbench: globalOpts.workbench,
      });
      const result = installSkills(targets);

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      const installs = Object.entries(result.installs).sort(([a], [b]) => a.localeCompare(b));
      output.write(`Installed Skills: ${installs.length}`);
      for (const [packageName, install] of installs) {
        output.write('');
        output.write(`- ${packageName}`);
        output.write(`  direct: ${install.direct}`);
        output.write(`  version: ${install.package_version}`);
      }
    });

  cmd
    .command('env')
    .description('Show installed and materialized skills for this repo')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = inspectSkillsEnv();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Installed Skills: ${result.installs.length}`);
      for (const install of result.installs) {
        output.write('');
        output.write(`- ${install.packageName}`);
        output.write(`  direct: ${install.direct}`);
        output.write(`  version: ${install.packageVersion}`);
        output.write(`  source: ${install.sourcePackagePath}`);
        if (install.skills?.length > 0) {
          output.write(`  skills: ${install.skills.map((skill) => skill.name).join(', ')}`);
        }
        for (const materialization of install.materializations) {
          output.write(`  materialized: ${materialization.target} (${materialization.mode})`);
        }
      }
    });

  cmd
    .command('outdated')
    .description('Show installed packaged skills with newer versions available in the current discovery root')
    .action(async (opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = await listOutdatedSkills();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Outdated Skills: ${result.count}`);
      if (result.count === 0) return;

      for (const skill of result.skills) {
        output.write('');
        output.write(`- ${skill.packageName}`);
        output.write(`  current: ${skill.currentVersion}`);
        output.write(`  available: ${skill.availableVersion}`);
        output.write(`  type: ${skill.updateType}`);
        output.write(`  source: ${skill.source}`);
        output.write(`  recommended: ${skill.recommendedCommand}`);
      }
    });

  cmd
    .command('uninstall')
    .description('Uninstall one direct skill package and reconcile runtime state')
    .argument('<target>', 'Installed skill package name')
    .action((target, opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = uninstallSkills(target);

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Removed Skills: ${result.removed.length}`);
      for (const packageName of result.removed) {
        output.write(`- ${packageName}`);
      }
    });

  return cmd;
}
