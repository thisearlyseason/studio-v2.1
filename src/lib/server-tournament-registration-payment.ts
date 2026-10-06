import type Stripe from "stripe";
import { adminDb } from "./firebase-admin";
import { connectAccountOwnsTeam } from "./server-stripe-connect";
import { enrollmentPatch } from "./competition/enrollment";
/** Signature verification and event receipt handling are owned by the Connect webhook. */
export async function fulfillTournamentRegistration(
  session: Stripe.Checkout.Session,
  account: string | undefined,
) {
  if (session.metadata?.kind !== "tournament_registration") return false;
  if (session.payment_status !== "paid") return true;
  const {
    firebase_team_id: teamId,
    event_id: eventId,
    entry_id: entryId,
  } = session.metadata;
  if (
    ![teamId, eventId, entryId].every(
      (value) => value && /^[A-Za-z0-9_-]{1,200}$/.test(value),
    )
  )
    throw new Error("Invalid registration payment metadata.");
  if (!(await connectAccountOwnsTeam(teamId, account)))
    throw new Error("Registration payout account mismatch.");
  const eventRef = adminDb.doc(`teams/${teamId}/events/${eventId}`),
    entryRef = eventRef.collection("registrationEntries").doc(entryId);
  await adminDb.runTransaction(async (transaction) => {
    const [event, entry] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(entryRef),
      ]),
      data = entry.data();
    if (!event.exists || !data) throw new Error("Paid registration not found.");
    if (
      data.checkoutSessionId !== session.id ||
      data.checkoutAccountId !== account ||
      data.payment?.mode !== "stripe" ||
      Math.round(Number(data.payment.amount) * 100) !== session.amount_total ||
      String(data.payment.currency).toLowerCase() !== session.currency
    )
      throw new Error("Registration payment does not match its checkout.");
    if (data.payment.status === "paid") return;
    const eligible =
      event.data()?.competition?.phase === "registration" &&
      event.data()?.registrationOpen === true &&
      data.status !== "declined";
    if (eligible) {
      const patch = enrollmentPatch(event.data()!, entryId, data, true);
      if (Object.keys(patch).length) transaction.update(eventRef, patch);
    }
    transaction.set(
      adminDb.doc(`teams/${teamId}/payments/registration_${session.id}`),
      {
        id: `registration_${session.id}`,
        teamId,
        amount: session.amount_total,
        currency: session.currency,
        status: "paid",
        payment_method: "online",
        paymentItemName: `Tournament registration — ${event.data()?.title || "Tournament"}`,
        payer_name: data.entrant?.name || data.answers?.teamName || "",
        payer_email: data.answers?.email || "",
        source: "tournament_registration",
        eventId,
        registrationEntryId: entryId,
        stripe_session_id: session.id,
        stripe_connect_account_id: account,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    transaction.update(entryRef, {
      payment: { ...data.payment, status: "paid" },
      payment_received: true,
      status: eligible ? "accepted" : data.status,
      enrollment_status: eligible
        ? "enrolled"
        : "paid_after_registration_closed",
      stripeSessionId: session.id,
      paidAt: new Date().toISOString(),
    });
  });
  return true;
}
