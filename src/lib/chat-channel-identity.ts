type ChatChannel = { id: string; teamId?: string; [key: string]: unknown };

export function chatChannelKey(chat: ChatChannel, fallbackTeamId: string) {
  return `${chat.teamId || fallbackTeamId}:${chat.id}`;
}

export function mergeChatChannels<T extends ChatChannel>(chats: T[], fallbackTeamId: string): T[] {
  return Array.from(new Map(chats.map(chat => [chatChannelKey(chat, fallbackTeamId), chat])).values());
}

export function isChatVisibleForTeam(
  ownerTeamId: string,
  selectedTeamId: string,
  contextType: unknown,
  participantTeamId: unknown,
) {
  return ownerTeamId === selectedTeamId || (
    (contextType === 'league' || contextType === 'tournament' || contextType === 'hub') && participantTeamId === selectedTeamId
  );
}

export function chatActivityDate(...timestamps: unknown[]): Date | undefined {
  for (const value of timestamps) {
    const date = typeof value === 'string' ? new Date(value)
      : value instanceof Date ? value
      : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : undefined;
    if (date instanceof Date && Number.isFinite(date.getTime())) return date;
  }
}
