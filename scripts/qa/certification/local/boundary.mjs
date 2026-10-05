const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function parseLoopbackHttpOrigin(value, label = 'Local app URL') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an exact loopback HTTP origin.`);
  }
  const port = Number(url.port);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) ||
      !Number.isInteger(port) || port < 1 || port > 65_535 ||
      url.username !== '' || url.password !== '' || url.pathname !== '/' ||
      url.search !== '' || url.hash !== '') {
    throw new Error(`${label} must be an exact loopback HTTP origin.`);
  }
  return url.origin;
}

export function resolveLoopbackUrl(value, baseOrigin, label = 'Browser path') {
  const origin = parseLoopbackHttpOrigin(baseOrigin, 'Local app URL');
  let url;
  try {
    url = new URL(value, `${origin}/`);
  } catch {
    throw new Error(`${label} must resolve to the same loopback origin.`);
  }
  if (url.origin !== origin || url.username !== '' || url.password !== '') {
    throw new Error(`${label} must resolve to the same loopback origin.`);
  }
  return url;
}
