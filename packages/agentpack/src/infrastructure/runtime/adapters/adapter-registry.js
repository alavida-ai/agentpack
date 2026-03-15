import { claudeAdapter } from './claude-adapter.js';
import { agentsAdapter } from './agents-adapter.js';

export function getRuntimeAdapters() {
  return [claudeAdapter, agentsAdapter];
}
