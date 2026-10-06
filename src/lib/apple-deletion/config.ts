export function appleDeletionAPIKey(env: Record<string, string | undefined>, project: string | null): string | null {
  try {
    const config = JSON.parse(env.FIREBASE_WEBAPP_CONFIG || env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG || '');
    return project && config.projectId === project && typeof config.apiKey === 'string' && config.apiKey.length > 0 && config.apiKey.trim() === config.apiKey ? config.apiKey : null;
  } catch { return null; }
}
