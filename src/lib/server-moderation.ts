import { canReadFeedAudience } from "@/lib/feed-policy";
import { isTeamModuleEnabled } from "@/lib/team-module-visibility";
import { adminDb } from "@/lib/firebase-admin";
import { getTeamAuthority, isParentMember } from "@/lib/server-team-access";
import {
  safetyContentPath,
  validSafetyId,
  type SafetyTarget,
} from "@/lib/moderation-policy";
import type { DecodedToken } from "@/lib/api-auth";

export class SafetyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function blockRef(uid: string, other: string) {
  return adminDb
    .collection("userSafety")
    .doc(uid)
    .collection("blocks")
    .doc(other);
}
export async function hasBlockBetween(
  uid: string,
  other: string,
): Promise<boolean> {
  if (!other || uid === other) return false;
  const docs = await Promise.all([
    blockRef(uid, other).get(),
    blockRef(other, uid).get(),
  ]);
  return docs.some((doc) => doc.exists);
}
export async function allowedNotificationRecipients(
  sender: string,
  recipients: string[],
): Promise<string[]> {
  const checks = await Promise.all(
    recipients.map(async (uid) =>
      (await hasBlockBetween(sender, uid)) ? null : uid,
    ),
  );
  return checks.filter((uid): uid is string => uid !== null);
}
export async function resolveSafetyTarget(
  auth: DecodedToken,
  target: SafetyTarget,
) {
  const authority = await getTeamAuthority(target.teamId, auth.uid, auth.role);
  if (!authority) throw new SafetyError("Team unavailable.", 403);
  if (target.kind === "message") {
    const chat = await authority.teamRef.collection("groupChats").doc(target.parentId!).get();
    const data = chat.data() || {};
    if (!chat.exists || data.isDeleted === true || authority.teamData.features?.tacticalChat === false)
      throw new SafetyError("Conversation unavailable.", 404);
    if (!authority.isOwner && !authority.isSuperAdmin) {
      const source = data.memberAuthorities?.[auth.uid];
      const teamId = typeof source?.teamId === "string" ? source.teamId : target.teamId;
      const memberId = typeof source?.memberId === "string" ? source.memberId : auth.uid;
      const member = await adminDb.collection("teams").doc(teamId).collection("members").doc(memberId).get();
      const memberData = member.data();
      if (!data.memberIds?.includes(auth.uid) || !member.exists || memberData?.status === "removed" || memberData?.isDeleted === true || (memberData?.userId !== auth.uid && memberId !== auth.uid))
        throw new SafetyError("You do not have access to this conversation.", 403);
    }
  } else {
    const parent = isParentMember(authority.member?.data);
    if ((!authority.isOwner && !authority.isSuperAdmin && !authority.member) ||
      !isTeamModuleEnabled({key:"feed"}, authority.teamData.features) ||
      (parent && authority.teamData.parentFeedEnabled === false))
      throw new SafetyError("You do not have access to this feed.", 403);
    const post = await authority.teamRef.collection("feedPosts").doc(target.kind === "comment" ? target.parentId! : target.contentId).get();
    if (!post.exists || !canReadFeedAudience(post.data()?.audience, authority.isStaff, parent))
      throw new SafetyError("Post unavailable.", 404);
  }
  const ref = adminDb.doc(safetyContentPath(target));
  const content = await ref.get();
  if (!content.exists)
    throw new SafetyError("This content is no longer available.", 404);
  const data = content.data()!;
  if (data.isDeleted === true) throw new SafetyError("This content is no longer available.", 404);
  const authorId = data.authorId || data.senderId;
  if (!validSafetyId(authorId))
    throw new SafetyError("This content has no identifiable author.");
  if (authorId === auth.uid)
    throw new SafetyError("You cannot report or block yourself.");
  return {
    ref,
    data,
    authorId,
    authorName: String(
      data.authorName ||
        data.author?.name ||
        (typeof data.author === "string" ? data.author : "") ||
        data.senderName ||
        "Squad member",
    ).slice(0, 120),
  };
}
