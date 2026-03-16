import { Command } from 'commander';
import { validateSkillsUseCase } from '../application/skills/validate-skills.js';
import { EXIT_CODES } from '../utils/errors.js';
import { output } from '../utils/output.js';

function maybeHide(command, hide) {
  if (hide) command._hidden = true;
}

function renderValidationSummary(result, target) {
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
}

export function attachPublishValidateCommand(cmd, { hide = false } = {}) {
  const validateCmd = cmd
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

      renderValidationSummary(result, target);
    });

  maybeHide(validateCmd, hide);
}

export function publishCommand() {
  const cmd = new Command('publish')
    .description('Validate and prepare skill packages for release');

  attachPublishValidateCommand(cmd);
  return cmd;
}
