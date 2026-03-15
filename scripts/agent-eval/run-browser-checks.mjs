import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runBrowserChecks({
  url,
  outputDir,
  desktop,
  assertPage,
}) {
  if (!url) {
    throw new Error('browser url is required');
  }
  if (!desktop) {
    throw new Error('desktop client is required');
  }

  await mkdir(outputDir, { recursive: true });
  await desktop.open(url);
  if (typeof desktop.wait === 'function') {
    await desktop.wait(3000);
  }

  const screenshotBytes = await desktop.screenshot();
  const screenshotPath = join(outputDir, 'browser-screenshot.png');
  await writeFile(screenshotPath, screenshotBytes);

  const windowId = typeof desktop.getCurrentWindowId === 'function'
    ? await desktop.getCurrentWindowId()
    : null;
  const windowTitle = windowId && typeof desktop.getWindowTitle === 'function'
    ? await desktop.getWindowTitle(windowId)
    : null;
  let streamUrl = null;

  if (desktop.stream?.start && desktop.stream?.getUrl) {
    await desktop.stream.start(windowId ? { windowId } : undefined);
    streamUrl = desktop.stream.getUrl({ viewOnly: true });
  }

  const rawSummary = typeof assertPage === 'function'
    ? await assertPage()
    : {};
  const summary = { ...rawSummary };
  const extraScreenshots = [];

  if (summary.screenshot) {
    const playwrightScreenshotPath = join(outputDir, 'playwright-workbench.png');
    await writeFile(playwrightScreenshotPath, summary.screenshot);
    extraScreenshots.push({
      path: playwrightScreenshotPath,
      data: summary.screenshot,
    });
    delete summary.screenshot;
  }

  if (desktop.stream?.stop) {
    await desktop.stream.stop().catch(() => {});
  }

  return {
    screenshotPath,
    screenshotBytes,
    summary,
    extraScreenshots,
    events: [
      { kind: 'open', url, windowId, windowTitle },
      ...(streamUrl ? [{ kind: 'stream', viewOnlyUrl: streamUrl }] : []),
      { kind: 'screenshot', path: screenshotPath },
      { kind: 'summary', ...summary },
    ],
  };
}
