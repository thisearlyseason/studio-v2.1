export function getBillingPlanStatusLabel(input: {
  isCancelling?: boolean;
  isStripeLinked?: boolean;
  isDemo?: boolean;
}): string {
  if (input.isCancelling) return 'Cancellation Pending';
  if (input.isStripeLinked) return 'Active - Renews automatically';
  if (input.isDemo) return 'Demo plan';
  return 'Free tier';
}
