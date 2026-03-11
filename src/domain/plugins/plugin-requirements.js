export const PLUGIN_REQUIREMENTS = {
  inspect: {
    pluginManifest: true,
  },
  validate: {
    pluginManifest: true,
  },
  build: {
    pluginManifest: true,
  },
};

export function getPluginRequirementLevel(level = 'inspect') {
  return PLUGIN_REQUIREMENTS[level] || PLUGIN_REQUIREMENTS.inspect;
}
