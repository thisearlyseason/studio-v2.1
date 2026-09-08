const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const STAGING_HOSTNAME = 'studio--the-squad-v2-staging.us-east4.hosted.app';

function refuse(reason) {
  throw new Error(`Refusing provider certification: ${reason}`);
}

export function assertProviderTargetSafety({
  projectId,
  origin,
  recipient,
  approvedRecipient,
}) {
  if (projectId !== STAGING_PROJECT_ID) refuse('project is not the isolated staging project');

  let url;
  try {
    url = new URL(origin);
  } catch {
    refuse('origin is invalid');
  }
  if (url.protocol !== 'https:' || url.hostname !== STAGING_HOSTNAME || url.pathname !== '/') {
    refuse('origin is not the exact staging origin');
  }

  const normalizedRecipient = String(recipient ?? '').trim().toLowerCase();
  const normalizedApprovedRecipient = String(approvedRecipient ?? '').trim().toLowerCase();
  if (!normalizedRecipient || normalizedRecipient !== normalizedApprovedRecipient) {
    refuse('recipient is not the explicitly approved QA recipient');
  }

  return true;
}

export function assertProviderSafety(input) {
  assertProviderTargetSafety(input);
  if (typeof input.stripeKey !== 'string' || !input.stripeKey.startsWith('sk_test_')) {
    refuse('Stripe is not in test mode');
  }
  if (input.livemode !== false) refuse('provider object is not explicitly test mode');
  return true;
}
