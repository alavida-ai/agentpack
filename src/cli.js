import { Command } from 'commander';
import { createRequire } from 'node:module';
import { formatError, AgentpackError, EXIT_CODES } from './utils/errors.js';
import { output } from './utils/output.js';
import { skillsCommand } from './commands/skills.js';
import { pluginCommand } from './commands/plugin.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export function createProgram() {
  const program = new Command();

  program
    .name('agentpack')
    .description('agentpack skills lifecycle CLI')
    .version(pkg.version, '-V, --version', 'Show version number')
    .option('--json', 'Output as JSON')
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('-v, --verbose', 'Show detailed output')
    .option('--workbench <path>', 'Override workbench context (name or path)');

  program.addCommand(skillsCommand());
  program.addCommand(pluginCommand());

  program.addHelpText('after', `
Exit Codes:
  0  Success
  1  General error
  2  Usage or validation error
  3  Network error
  4  Not found

Run 'agentpack <command> --help' for details on a specific command.`);

  program.action(() => {
    program.help();
  });

  return program;
}

export function run(argv) {
  const program = createProgram();

  process.on('uncaughtException', (err) => {
    const opts = program.opts?.() || {};
    if (opts.json) {
      output.json({ error: 'uncaught_exception', message: err.message });
    } else {
      output.error(formatError(err));
    }
    process.exit(EXIT_CODES.GENERAL);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const opts = program.opts?.() || {};
    if (opts.json) {
      output.json({ error: 'unhandled_rejection', message: err.message });
    } else {
      output.error(formatError(err));
    }
    process.exit(EXIT_CODES.GENERAL);
  });

  program.parseAsync(argv).catch((err) => {
    if (err instanceof AgentpackError) {
      const opts = program.opts?.() || {};
      if (opts.json) {
        output.json({ error: err.code, message: err.message });
      } else {
        output.error(formatError(err));
      }
      process.exit(err.exitCode);
      return;
    }

    output.error(formatError(err));
    process.exit(EXIT_CODES.GENERAL);
  });
}
