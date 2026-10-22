export type ChatDirectoryView = 'loading' | 'no-team' | 'ready';

export function resolveChatDirectoryView({
  mounted,
  isTeamsLoading,
  hasActiveTeam,
  isAuthorizedChatsLoading,
  hasChats,
}: {
  mounted: boolean;
  isTeamsLoading: boolean;
  hasActiveTeam: boolean;
  isAuthorizedChatsLoading: boolean;
  hasChats: boolean;
}): ChatDirectoryView {
  if (!mounted || isTeamsLoading) return 'loading';
  if (!hasActiveTeam) return 'no-team';
  if (isAuthorizedChatsLoading && !hasChats) return 'loading';
  return 'ready';
}
