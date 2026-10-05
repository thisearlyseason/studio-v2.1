export type ChatSendDraft = {
  requestId: string;
  content: string;
  imageUrl?: string;
  type: 'text' | 'image';
  status: 'sending' | 'failed' | 'sent';
  error?: string;
};

export function beginChatSend(
  draft: Pick<ChatSendDraft, 'content' | 'imageUrl' | 'type'> | ChatSendDraft,
  requestId: string,
): ChatSendDraft {
  return {
    requestId,
    content: draft.content,
    imageUrl: draft.imageUrl,
    type: draft.type,
    status: 'sending',
  };
}

export function failChatSend(draft: ChatSendDraft, error: string): ChatSendDraft {
  return { ...draft, status: 'failed', error };
}

export function finishChatSend(draft: ChatSendDraft): ChatSendDraft {
  return { ...draft, status: 'sent', error: undefined };
}
