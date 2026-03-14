import { validatePluginBundle } from '../../lib/plugins.js';

export function validatePluginBundleUseCase(target, options) {
  return validatePluginBundle(target, options);
}
