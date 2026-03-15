import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ALLOWED_KINDS = new Set(['pain_point', 'learning', 'wrong_turn', 'helpful_signal', 'checkpoint']);
const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high']);

export async function appendLearningEvent(logPath, event) {
  validateLearningEvent(event);
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}

export function validateLearningEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('learning_event.invalid: expected object');
  }
  assertNonEmptyString('learning_event.ts', event.ts);
  assertNonEmptyString('learning_event.kind', event.kind);
  assertAllowed('learning_event.kind', event.kind, ALLOWED_KINDS);
  assertNonEmptyString('learning_event.severity', event.severity);
  assertAllowed('learning_event.severity', event.severity, ALLOWED_SEVERITIES);
  assertNonEmptyString('learning_event.area', event.area);
  assertNonEmptyString('learning_event.note', event.note);

  if (!Array.isArray(event.evidence)) {
    throw new Error('learning_event.evidence must be an array');
  }
  if (typeof event.suggested_fix !== 'string') {
    throw new Error('learning_event.suggested_fix must be a string');
  }
}

function assertNonEmptyString(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertAllowed(field, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`${field} must be one of: ${[...allowed].join(', ')}`);
  }
}
