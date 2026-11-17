// Public ownership-verification key, also served at /<key>.txt. This is not a credential.
export const INDEXNOW_KEY = '9b416f432c7e4acd87316fde55081a22';
export const INDEXNOW_HOST = 'www.thesquad.pro';

export function indexNowPayload(urls: string[]) {
  const urlList = [...new Set(urls)];
  if (urlList.length === 0 || urlList.length > 10000) throw new Error('IndexNow requires 1–10,000 URLs.');
  for (const url of urlList) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.host !== INDEXNOW_HOST || parsed.username || parsed.password) throw new Error('Only public The Squad URLs can be submitted.');
  }
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`, urlList };
}
