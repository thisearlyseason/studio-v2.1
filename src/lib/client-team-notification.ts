export type TeamNotificationSource = 'event' | 'document' | 'drill';

type TeamOutboundState = {
  isDemo?: boolean;
  outboundProvidersEnabled?: boolean;
};

type TeamNotificationInput = {
  source: TeamNotificationSource;
  team: TeamOutboundState;
  idToken: string;
  teamId: string;
  memberUserIds: string[];
  title: string;
  body: string;
  url?: string;
  emailSubject?: string;
  emailHtml?: string;
};

type DeliveryResult = {
  status: 'suppressed' | 'dispatched';
  requestCount: number;
};

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function shouldDispatchTeamOutbound(team: TeamOutboundState): boolean {
  return team.isDemo !== true && team.outboundProvidersEnabled !== false;
}

export async function dispatchTeamNotification(
  input: TeamNotificationInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<DeliveryResult> {
  if (!shouldDispatchTeamOutbound(input.team)) {
    return { status: 'suppressed', requestCount: 0 };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.idToken}`,
  };
  const requests: Array<{ endpoint: string; body: Record<string, unknown> }> = [{
    endpoint: '/api/notify',
    body: {
      teamId: input.teamId,
      recipientUserIds: input.memberUserIds,
      title: input.title,
      body: input.body,
      url: input.url,
    },
  }];
  if (input.emailSubject && input.emailHtml) {
    requests.push({
      endpoint: '/api/email/send',
      body: {
        teamId: input.teamId,
        recipientUserIds: input.memberUserIds,
        subject: input.emailSubject,
        html: input.emailHtml,
      },
    });
  }

  await Promise.all(requests.map(async request => {
    try {
      const response = await fetchImplementation(request.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string'
          ? payload.error
          : `${input.source} notification request failed.`;
        throw new Error(message);
      }
    } catch (error) {
      console.warn(`[${input.source}] notification dispatch error:`, error);
    }
  }));
  return { status: 'dispatched', requestCount: requests.length };
}
