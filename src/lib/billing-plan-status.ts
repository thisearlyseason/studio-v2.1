export function getBillingPlanStatusLabel(input: {
  isCancelling?: boolean;
  isStripeLinked?: boolean;
  isDemo?: boolean;
  hasManagedAccess?: boolean;
}): string {
  if (input.isCancelling) return 'Cancellation Pending';
  if (input.isStripeLinked) return 'Active - Renews automatically';
  if (input.isDemo) return 'Demo plan';
  if (input.hasManagedAccess) return 'Active - managed plan';
  return 'Free tier';
}

/** Account billing is independent of the demo squads a real organizer can view. */
export function isDemoBillingIdentity(input: { anonymous?: boolean; profileIsDemo?: boolean }): boolean {
  return input.anonymous === true || input.profileIsDemo === true;
}
