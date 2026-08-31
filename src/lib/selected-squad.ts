export const ACTIVE_SQUAD_COOKIE_NAME = 'sf_active_squad';

const SELECTED_SQUAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeSelectedSquadId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return SELECTED_SQUAD_ID.test(normalized) ? normalized : undefined;
}

export function selectedSquadCookie(id: unknown, secure: boolean): string {
  const selected = normalizeSelectedSquadId(id);
  const security = secure ? '; Secure' : '';
  return selected
    ? `${ACTIVE_SQUAD_COOKIE_NAME}=${selected}; Path=/; SameSite=Lax${security}`
    : `${ACTIVE_SQUAD_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${security}`;
}
