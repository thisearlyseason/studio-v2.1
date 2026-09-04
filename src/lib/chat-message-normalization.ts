const MESSAGE_TYPES = new Set(['text', 'image', 'poll']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedDate(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (value && typeof value === 'object') {
    const timestamp = value as { seconds?: unknown; _seconds?: unknown; toDate?: () => Date };
    if (typeof timestamp.toDate === 'function') {
      try {
        const date = timestamp.toDate();
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      } catch {
        // Fall through to the serialized Timestamp shapes.
      }
    }
    const seconds = Number(timestamp.seconds ?? timestamp._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

export function normalizeChatMessage<T extends Record<string, any>>(message: T) {
  const authorId = text(message.authorId) || text(message.senderId) || text(message.userId) || 'unknown';
  const author = text(message.author) || text(message.authorName) || text(message.senderName) || 'Squad Member';
  const content = typeof message.content === 'string'
    ? message.content
    : typeof message.text === 'string' ? message.text : '';
  const requestedType = text(message.type);
  const type = MESSAGE_TYPES.has(requestedType)
    ? requestedType
    : message.poll ? 'poll' : message.imageUrl ? 'image' : 'text';

  return {
    ...message,
    createdAt: normalizedDate(message.createdAt),
    authorId,
    author,
    content,
    type,
  };
}
