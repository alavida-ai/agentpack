import { stdout, stderr } from 'node:process';

/**
 * TTY detection: humans get formatted output, agents get JSON.
 * --json flag overrides TTY detection (always JSON).
 * --quiet suppresses non-essential stderr.
 */

const isTTY = stdout.isTTY === true;
const supportsColor = isTTY && !process.env.NO_COLOR;

export const output = {
  /**
   * Write primary results to stdout.
   */
  write(text) {
    stdout.write(text + '\n');
  },

  /**
   * Write JSON to stdout. Used when --json flag is set or piping.
   */
  json(data) {
    stdout.write(JSON.stringify(data, null, 2) + '\n');
  },

  /**
   * Write status/progress to stderr (visible to humans, invisible to pipes).
   */
  status(text) {
    stderr.write(text + '\n');
  },

  /**
   * Write error to stderr.
   */
  error(text) {
    stderr.write(text + '\n');
  },

  /**
   * Write a table to stdout for human-readable output.
   */
  table(headers, rows) {
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => String(r[i] || '').length))
    );

    const pad = (str, width) => String(str).padEnd(width);
    const sep = widths.map((w) => '-'.repeat(w)).join('  ');

    stdout.write(headers.map((h, i) => pad(h, widths[i])).join('  ') + '\n');
    stdout.write(sep + '\n');
    for (const row of rows) {
      stdout.write(row.map((c, i) => pad(c || '', widths[i])).join('  ') + '\n');
    }
  },

  isTTY,
  supportsColor,
};
