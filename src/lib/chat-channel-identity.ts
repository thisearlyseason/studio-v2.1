type ChatChannel = { id: string; teamId?: string; [key: string]: unknown };

export function chatChannelKey(chat: ChatChannel, fallbackTeamId: string) {
  return `${chat.teamId || fallbackTeamId}:${chat.id}`;
}

export function mergeChatChannels<T extends ChatChannel>(chats: T[], fallbackTeamId: string): T[] {
  return Array.from(new Map(chats.map(chat => [chatChannelKey(chat, fallbackTeamId), chat])).values());
}
