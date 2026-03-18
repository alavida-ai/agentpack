import { Command } from 'commander';
import { materializeInstalledSkillsUseCase } from '../application/skills/runtime-activation.js';
import { output } from '../utils/output.js';

function renderMaterializeResult(result) {
  output.write(`Action: ${result.action}`);
  output.write(`Runtimes: ${result.runtimes.join(', ')}`);
  output.write(`Direct Packages: ${result.directPackages.length}`);
  output.write(`Materialized Packages: ${result.materializedPackageCount}`);
  output.write(`Materialized Exports: ${result.materializedExportCount}`);
}

export function materializeCommand() {
  return new Command('materialize')
    .description('Materialize installed skill packages from workspace dependencies into runtime directories')
    .option('-r, --runtime <runtime>', 'Materialize only for the selected runtime', (value, acc = []) => [...acc, value], [])
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = materializeInstalledSkillsUseCase({
        runtimes: opts.runtime,
      });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      renderMaterializeResult(result);
    });
}
