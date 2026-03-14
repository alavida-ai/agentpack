import { inspectPluginBundle } from '../../lib/plugins.js';

export function inspectPluginBundleUseCase(target, options) {
  return inspectPluginBundle(target, options);
}
