import { Command } from 'commander';
import { validateAction } from './publish.js';

export function validateCommand() {
  return new Command('validate')
    .description('Validate one packaged skill or all authored packaged skills')
    .argument('[target]', 'Optional packaged skill directory, SKILL.md path, or package name')
    .action((target, opts, command) => {
      validateAction(target, command);
    });
}
