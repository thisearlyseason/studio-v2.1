export const REPORT_REASONS = [
  "Harassment or bullying",
  "Hateful or abusive content",
  "Sexual or inappropriate content",
  "Threats or safety concern",
  "Spam or scam",
  "Other",
] as const;
export type SafetyTarget = {
  teamId: string;
  kind: "post" | "comment" | "message";
  contentId: string;
  parentId?: string;
};
export function validSafetyId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}
export function parseSafetyTarget(
  body: Record<string, unknown>,
): SafetyTarget | null {
  if (
    !validSafetyId(body.teamId) ||
    !validSafetyId(body.contentId) ||
    !["post", "comment", "message"].includes(String(body.kind))
  )
    return null;
  if (body.kind !== "post" && !validSafetyId(body.parentId)) return null;
  return {
    teamId: body.teamId,
    kind: body.kind as SafetyTarget["kind"],
    contentId: body.contentId,
    ...(body.kind !== "post" ? { parentId: body.parentId as string } : {}),
  };
}
export function safetyContentPath(target: SafetyTarget): string {
  const base = `teams/${target.teamId}`;
  return target.kind === "post"
    ? `${base}/feedPosts/${target.contentId}`
    : target.kind === "comment"
      ? `${base}/feedPosts/${target.parentId}/comments/${target.contentId}`
      : `${base}/groupChats/${target.parentId}/messages/${target.contentId}`;
}
export function isDirectConversation(
  memberIds: unknown[],
  senderId: string,
): boolean {
  const ids = new Set(
    memberIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
  return ids.size === 2 && ids.has(senderId);
}
