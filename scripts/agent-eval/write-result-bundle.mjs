import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeResultBundle({
  outputRoot = 'eval-results',
  runId,
  scenario,
  sandbox,
  transcript = [],
  commands = [],
  browser = [],
  learningLog = [],
  grader,
  report,
  reportMarkdown = '',
  summary = '',
  screenshots = [],
  fileDiff = '',
  extraFiles = [],
}) {
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    throw new Error('runId is required');
  }

  const bundlePath = join(outputRoot, runId);
  await mkdir(bundlePath, { recursive: true });
  await mkdir(join(bundlePath, 'screenshots'), { recursive: true });

  await writeJson(join(bundlePath, 'scenario.json'), scenario);
  await writeJson(join(bundlePath, 'sandbox.json'), sandbox);
  await writeNdjson(join(bundlePath, 'transcript.ndjson'), transcript);
  await writeNdjson(join(bundlePath, 'commands.ndjson'), commands);
  await writeNdjson(join(bundlePath, 'browser.ndjson'), browser);
  await writeNdjson(join(bundlePath, 'learning-log.ndjson'), learningLog);
  await writeJson(join(bundlePath, 'grader.json'), grader);
  await writeJson(join(bundlePath, 'report.json'), report);
  await writeFile(join(bundlePath, 'report.md'), ensureTrailingNewline(reportMarkdown), 'utf8');
  await writeFile(join(bundlePath, 'summary.md'), ensureTrailingNewline(summary), 'utf8');
  await writeFile(join(bundlePath, 'file-diff.patch'), ensureTrailingNewline(fileDiff), 'utf8');

  for (const screenshot of screenshots) {
    const targetPath = join(bundlePath, screenshot.path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, screenshot.data);
  }

  for (const file of extraFiles) {
    const targetPath = join(bundlePath, file.path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, ensureTrailingNewline(file.data), 'utf8');
  }

  return bundlePath;
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function writeNdjson(path, entries) {
  const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
  await writeFile(path, ensureTrailingNewline(body), 'utf8');
}

function ensureTrailingNewline(value) {
  const stringValue = value ?? '';
  return stringValue.endsWith('\n') ? stringValue : `${stringValue}\n`;
}
