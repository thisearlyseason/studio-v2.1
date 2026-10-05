import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe-client";
import { resolveTeamConnectAccount } from "@/lib/server-stripe-connect";
import {
  readJsonBodyWithLimit,
  enforceUserRateLimit,
} from "@/lib/server-request-guards";
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      request,
      8000,
    );
    if (
      !id(body.teamId) ||
      !id(body.eventId) ||
      !id(body.entryId) ||
      !id(body.requestId)
    )
      return NextResponse.json(
        { error: "Invalid checkout request." },
        { status: 400 },
      );
    const limited = await enforceUserRateLimit(
      `registration:${body.entryId}`,
      "registration-checkout",
      10,
      3600000,
    );
    if (limited) return limited;
    const eventRef = adminDb.doc(`teams/${body.teamId}/events/${body.eventId}`),
      entryRef = eventRef.collection("registrationEntries").doc(body.entryId);
    const [team, event, entry] = await Promise.all([
      adminDb.doc(`teams/${body.teamId}`).get(),
      eventRef.get(),
      entryRef.get(),
    ]);
    const data = entry.data();
    if (!data || data.request_id !== body.requestId)
      return NextResponse.json(
        { error: "Registration receipt could not be verified." },
        { status: 403 },
      );
    if (team.data()?.isDemo)
      return NextResponse.json(
        {
          error:
            "Stripe payments are disabled in demo workspaces. Use a free entry or confirm a simulated offline payment.",
        },
        { status: 403 },
      );
    if (data.payment?.status === "paid")
      return NextResponse.json({ paid: true });
    if (
      event.data()?.registrationOpen !== true ||
      event.data()?.competition?.phase !== "registration" ||
      data.status === "declined"
    )
      return NextResponse.json(
        { error: "Registration is closed." },
        { status: 409 },
      );
    if (data.payment?.mode !== "stripe" || !(data.payment.amount > 0))
      return NextResponse.json(
        { error: "This entry does not require Stripe checkout." },
        { status: 400 },
      );
    const { connectAccountId } = await resolveTeamConnectAccount(body.teamId);
    if (!connectAccountId)
      return NextResponse.json(
        {
          error:
            "The organizer must connect Stripe before accepting online payments.",
        },
        { status: 409 },
      );
    const stripe = getStripe(),
      account = await stripe.accounts.retrieve(connectAccountId);
    if (!account.charges_enabled)
      return NextResponse.json(
        {
          error:
            "The organizer’s Stripe account is not ready to accept payments.",
        },
        { status: 409 },
      );
    let attempt = Number(data.checkoutAttempt || 0);
    if (data.checkoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(
        data.checkoutSessionId,
        {},
        { stripeAccount: connectAccountId },
      );
      if (existing.status === "open" && existing.url)
        return NextResponse.json({ url: existing.url });
      if (existing.status === "complete")
        return NextResponse.json({ pending: true });
      attempt++;
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const returnUrl = `${origin}/register/tournament/${body.teamId}/${body.eventId}?protocol=${encodeURIComponent(data.protocol_id || "team_config")}`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: data.answers?.email,
        line_items: [
          {
            price_data: {
              currency: String(data.payment.currency).toLowerCase(),
              unit_amount: Math.round(data.payment.amount * 100),
              product_data: {
                name: `${event.data()?.title} — ${data.answers?.teamName}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          kind: "tournament_registration",
          firebase_team_id: body.teamId,
          event_id: body.eventId,
          entry_id: body.entryId,
        },
        success_url: `${returnUrl}&payment=processing`,
        cancel_url: `${returnUrl}&payment=cancelled`,
      },
      {
        stripeAccount: connectAccountId,
        idempotencyKey: `tournament-registration:${body.entryId}:${attempt}`,
      },
    );
    await entryRef.update({
      checkoutSessionId: session.id,
      checkoutAccountId: connectAccountId,
      checkoutAttempt: attempt,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Tournament checkout]", error);
    return NextResponse.json(
      {
        error:
          "Checkout could not be opened. Your registration is saved; please retry.",
      },
      { status: 500 },
    );
  }
}
