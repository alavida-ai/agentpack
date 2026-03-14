export function getSkillFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#\/skill\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSkillHash(packageName) {
  window.location.hash = `#/skill/${encodeURIComponent(packageName)}`;
}

export function onHashChange(callback) {
  window.addEventListener('hashchange', () => {
    callback(getSkillFromHash());
  });
}
