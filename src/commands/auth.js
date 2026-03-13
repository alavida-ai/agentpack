import { Command } from 'commander';
import { login } from '../application/auth/login.js';
import { logout } from '../application/auth/logout.js';
import { output } from '../utils/output.js';
import { getAuthStatus } from '../application/auth/get-auth-status.js';

export function authCommand() {
  const cmd = new Command('auth')
    .description('Configure and inspect package registry authentication');

  cmd.addHelpText('after', `
Defaults:
  Scope: @alavida-ai
  Registry: https://npm.pkg.github.com
  Token: GitHub personal access token with package read access
`);

  cmd
    .command('login')
    .description('Configure GitHub Packages authentication for this machine')
    .option('--scope <scope>', 'Override the package scope to configure')
    .option('--registry <url>', 'Override the package registry URL')
    .option('--verify-package <packageName>', 'Override the package used for live verification')
    .action(async (opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = await login({
        scope: opts.scope || null,
        registry: opts.registry || null,
        verificationPackage: opts.verifyPackage || null,
      });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Configured auth for ${result.scope}`);
      output.write(`Registry: ${result.registry}`);
      output.write(`Storage: ${result.storage.mode}`);
    });

  cmd
    .command('status')
    .description('Show authentication status for the configured package registry')
    .option('--verify', 'Check whether the stored credential works against the configured registry')
    .action(async (opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = await getAuthStatus({ verify: opts.verify });

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Provider: ${result.provider}`);
      output.write(`Configured: ${result.configured}`);
      output.write(`Storage: ${result.storage.mode}`);
      output.write(`Verification: ${result.verification.status}`);
    });

  cmd
    .command('logout')
    .description('Remove configured package registry authentication')
    .action((opts, command) => {
      const globalOpts = command.optsWithGlobals();
      const result = logout();

      if (globalOpts.json) {
        output.json(result);
        return;
      }

      output.write(`Removed Credentials: ${result.removedCredentials}`);
      output.write(`Removed npm Keys: ${result.removedNpmKeys}`);
    });

  return cmd;
}
