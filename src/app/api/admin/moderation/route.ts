import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseToken } from "@/lib/api-auth";
import {
  readJsonBodyWithLimit,
  RequestBodyError,
} from "@/lib/server-request-guards";
import { parseSafetyTarget, safetyContentPath } from "@/lib/moderation-policy";

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "superadmin")
    return NextResponse.json(
      { error: "Platform moderator access required." },
      { status: 403 },
    );
  try {
    const pending = await adminDb
      .collection("moderationReports")
      .where("status", "==", "pending")
      .limit(100)
      .get();
    return NextResponse.json({
      reports: pending.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load reports." },
      { status: 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "superadmin")
    return NextResponse.json(
      { error: "Platform moderator access required." },
      { status: 403 },
    );
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      req,
      4000,
    );
    if (
      typeof body.reportId !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.reportId) ||
      !["remove", "dismiss"].includes(String(body.action)) ||
      typeof body.note !== "string" ||
      !body.note.trim() ||
      body.note.length > 2000
    ) {
      return NextResponse.json(
        { error: "A valid report, decision, and moderator note are required." },
        { status: 400 },
      );
    }
    const ref = adminDb.collection("moderationReports").doc(body.reportId);
    await adminDb.runTransaction(async (tx) => {
      const report = await tx.get(ref);
      if (!report.exists) throw new Error("NOT_FOUND");
      if (report.data()?.status !== "pending") throw new Error("RESOLVED");
      const target = parseSafetyTarget(report.data()!);
      if (!target) throw new Error("INVALID_TARGET");
      // Delete the exact reported document, never a client-supplied arbitrary path.
      // Removed post comments are inaccessible through the explicit rules below.
      if (body.action === "remove")
        tx.delete(adminDb.doc(safetyContentPath(target)));
      tx.update(ref, {
        status: body.action === "remove" ? "removed" : "dismissed",
        resolvedAt: new Date().toISOString(),
        resolvedBy: auth.uid,
        resolutionNote: body.note,
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          code === "RESOLVED"
            ? "This report has already been reviewed."
            : "Unable to resolve report.",
      },
      { status: code === "NOT_FOUND" ? 404 : code === "RESOLVED" ? 409 : 500 },
    );
  }
}
