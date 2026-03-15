export function collectSecrets({ env = {}, auth = null } = {}) {
  const secrets = new Set();

  for (const [key, value] of Object.entries(env)) {
    if (!isSecretKey(key)) continue;
    collectStringSecrets(value, secrets);
  }

  if (auth?.env) {
    for (const [key, value] of Object.entries(auth.env)) {
      if (!isSecretKey(key)) continue;
      collectStringSecrets(value, secrets);
    }
  }

  if (auth?.credentials) {
    collectObjectSecrets(auth.credentials, secrets);
  }

  return [...secrets].sort((a, b) => b.length - a.length);
}

export function redactSecrets(value, secrets) {
  if (!Array.isArray(secrets) || secrets.length === 0) {
    return value;
  }

  if (typeof value === 'string') {
    return redactSecretsFromString(value, secrets);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, secrets));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactSecrets(entry, secrets)])
    );
  }

  return value;
}

function collectObjectSecrets(value, secrets) {
  if (!value || typeof value !== 'object') return;

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && isSecretKey(key)) {
      collectStringSecrets(entry, secrets);
      continue;
    }

    if (entry && typeof entry === 'object') {
      collectObjectSecrets(entry, secrets);
    }
  }
}

function collectStringSecrets(value, secrets) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length < 8) return;
  secrets.add(trimmed);
}

function isSecretKey(key) {
  return /token|secret|api[_-]?key|password|auth[_-]?key|refresh/i.test(key);
}

function redactSecretsFromString(text, secrets) {
  let redacted = text;
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}
