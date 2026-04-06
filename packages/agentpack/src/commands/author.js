import { Command } from 'commander';
import { buildCompiledStateUseCase } from '../application/skills/build-compiled-state.js';
import { inspectSkillUseCase } from '../application/skills/inspect-skill.js';
import { inspectStaleSkillUseCase, listStaleSkillsUseCase } from '../application/skills/list-stale-skills.js';
import { materializeCompiledStateUseCase } from '../application/skills/materialize-compiled-state.js';
import { cleanupSkillDevSession, startSkillDev, unlinkSkill } from '../lib/skills.js';
import { output } from '../utils/output.js';

function maybeHide(command, hide) {
  if (hide) command._hidden = true;
}

function renderInspectResult(result) {
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
}

function renderStaleResult(result) {
  output.write(`Skill: ${result.packageName}`);
  output.write(`Path: ${result.skillPath}`);
  output.write('');
  output.write('Changed Sources:');
  for (const change of result.changedSources) {
    output.write(`- ${change.path}`);
    output.write(`  Recorded: ${change.recorded}`);
    output.write(`  Current: ${change.current}`);
  }
}

function renderStaleList(results) {
  output.write(`Stale Skills: ${results.length}`);
  if (results.length === 0) return;

  for (const result of results) {
    output.write('');
    output.write(`- ${result.packageName}`);
    output.write(`  path: ${result.skillPath}`);
    output.write(`  changed_sources: ${result.changedSources.length}`);
  }
}

export function attachAuthoringCommands(cmd, { hide = false } = {}) {
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
  maybeHide(devCmd, hide);

  const cleanupCmd = devCmd
    .command('cleanup')
    .description('Remove recorded author dev links for a stale session')
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
  maybeHide(cleanupCmd, hide);

  const unlinkCmd = cmd
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
  maybeHide(unlinkCmd, hide);

  const buildCmd = cmd
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
      if (result.distPath) output.write(`Dist Path: ${result.distPath}`);
      output.write(`Skills: ${result.skillCount}`);
      output.write(`Sources: ${result.sourceCount}`);
      output.write(`Occurrences: ${result.occurrenceCount}`);
      output.write(`Edges: ${result.edgeCount}`);
      if (result.distPath) {
        output.write('');
        output.write('Next: point a Claude/OpenClaw plugin at `./dist`, or run `npx -y skillkit@latest install ./dist --yes --agent claude-code`.');
      }
    });
  maybeHide(buildCmd, hide);

  const materializeCmd = cmd
    .command('materialize')
    .description('Materialize runtime outputs from .agentpack/compiled.json')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = {
        ...materializeCompiledStateUseCase(),
        deprecated: true,
        message: 'Deprecated: use `agentpack author build <target>` plus SkillKit or a plugin that points to `./dist`.',
      };

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write('Deprecated: use `agentpack author build <target>` plus SkillKit or a plugin that points to `./dist`.');
      output.write('');
      output.write(`Root Skill: ${result.rootSkill}`);
      output.write(`Materialization Path: ${result.materializationPath}`);
      output.write(`Adapters: ${result.adapterCount}`);
      for (const [adapterName, outputs] of Object.entries(result.outputs)) {
        output.write(`${adapterName}: ${outputs.length}`);
      }
    });
  maybeHide(materializeCmd, hide);

  const inspectCmd = cmd
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

      renderInspectResult(result);
    });
  maybeHide(inspectCmd, hide);

  const staleCmd = cmd
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

        renderStaleResult(result);
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

      renderStaleList(results);
    });
  maybeHide(staleCmd, hide);
}

export function authorCommand() {
  const cmd = new Command('author')
    .description('Author and iterate on local skill packages');

  attachAuthoringCommands(cmd);
  return cmd;
}
