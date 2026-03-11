import { spawn } from 'node:child_process';

export function openBrowser(url) {
  if (process.env.AGENTPACK_DISABLE_BROWSER === '1') return;

  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  try {
    spawn(command, [url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // Browser launch failure should not fail the core dev workflow.
  }
}
