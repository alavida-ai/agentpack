export async function verifyAuth({
  registry,
  authToken,
  verificationPackage,
} = {}) {
  if (!registry || !authToken || !verificationPackage) {
    return { status: 'not_configured' };
  }

  const url = `${registry.replace(/\/+$/, '')}/${encodeURIComponent(verificationPackage)}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${authToken}`,
      },
    });
  } catch {
    return { status: 'unreachable' };
  }

  if (response.ok) {
    return { status: 'valid' };
  }

  if (response.status === 401) {
    return { status: 'invalid' };
  }

  if (response.status === 403) {
    return { status: 'insufficient_permissions' };
  }

  return { status: 'unreachable' };
}
