import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import {
  REPORT_REASONS,
  parseSafetyTarget,
  validSafetyId,
} from "@/lib/moderation-policy";
import {
  blockRef,
  resolveSafetyTarget,
  SafetyError,
} from "@/lib/server-moderation";
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from "@/lib/server-request-guards";

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      req,
      8000,
    );
    if (!["report", "block", "unblock"].includes(String(body.action)))
      throw new SafetyError("Invalid safety action.");
    const limited = await enforceUserRateLimit(
      auth.uid,
      "safety-actions",
      40,
      5 * 60 * 1000,
    );
    if (limited) return limited;
    if (body.action === "unblock") {
      if (!validSafetyId(body.authorId))
        throw new SafetyError("Invalid blocked account.");
      await blockRef(auth.uid, body.authorId).delete();
      return NextResponse.json({ ok: true });
    }
    const target = parseSafetyTarget(body);
    if (!target) throw new SafetyError("Invalid content reference.");
    const { data, authorId, authorName, ref } = await resolveSafetyTarget(
      auth,
      target,
    );
    const now = new Date().toISOString();
    if (body.action === "block") {
      await blockRef(auth.uid, authorId).set({
        authorId,
        authorName,
        createdAt: now,
      });
      return NextResponse.json({ ok: true, authorId });
    }
    if (
      !REPORT_REASONS.includes(body.reason as (typeof REPORT_REASONS)[number])
    )
      throw new SafetyError("Choose a report reason.");
    if (typeof body.details !== "string" || body.details.length > 2000)
      throw new SafetyError("Report details must be at most 2,000 characters.");
    // One immutable report per reporter/content version. Retried requests cannot flood the queue.
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          auth.uid,
          ref.path,
          data.content || data.text || "",
          data.imageUrl || data.imagePath || "",
          data.poll?.question || "",
          data.poll?.options?.map((option: { text?: string }) => option.text) ||
            [],
        ]),
      )
      .digest("hex");
    const reportRef = adminDb.collection("moderationReports").doc(id);
    const status = await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(reportRef);
      if (!existing.exists)
        tx.create(reportRef, {
          ...target,
          reporterId: auth.uid,
          authorId,
          authorName,
          reason: body.reason,
          details: body.details,
          status: "pending",
          createdAt: now,
          contentPath: ref.path,
          contentPreview: String(
            data.content || data.text || data.poll?.question || "",
          ).slice(0, 10000),
          hasImage: Boolean(data.imageUrl || data.imagePath),
        });
      return existing.exists ? existing.data()?.status : "pending";
    });
    return NextResponse.json({ ok: true, reportId: id, status });
  } catch (error) {
    if (error instanceof SafetyError || error instanceof RequestBodyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("[safety] Request failed", error);
    return NextResponse.json(
      { error: "Unable to save your safety action. Please try again." },
      { status: 500 },
    );
  }
}
