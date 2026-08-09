import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'demo-the-squad-rules-test';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      setDoc(doc(db, 'users', 'owner'), { role: 'coach', name: 'Owner' }),
      setDoc(doc(db, 'users', 'member'), { role: 'parent', name: 'Member' }),
      setDoc(doc(db, 'users', 'staff'), { role: 'coach', name: 'Assistant Coach' }),
      setDoc(doc(db, 'users', 'outsider'), { role: 'coach', name: 'Outsider' }),
      setDoc(doc(db, 'users', 'youth'), {
        role: 'youth_player',
        name: 'Youth',
        linkedPlayerId: 'child-player',
      }),
      setDoc(doc(db, 'users', 'removed'), { role: 'adult_player', name: 'Removed' }),
      setDoc(doc(db, 'users', 'suspended'), {
        role: 'adult_player',
        name: 'Suspended',
        accountStatus: 'suspended',
      }),
      setDoc(doc(db, 'users', 'pending-delete'), {
        role: 'adult_player',
        name: 'Pending Delete',
        deletionStatus: 'pending',
      }),
      setDoc(doc(db, 'users', 'owner', 'tokens', 'google'), {
        access_token: 'server-secret',
        refresh_token: 'server-refresh-secret',
      }),
      setDoc(doc(db, 'teams', 'team-a'), {
        ownerUserId: 'owner',
        isPro: true,
        planId: 'team',
      }),
      setDoc(doc(db, 'teams', 'demo-team'), {
        ownerUserId: 'fictional-coach',
        demoSessionOwnerId: 'demo-user',
        isDemo: true,
        isPro: true,
        planId: 'team',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'member'), {
        userId: 'member',
        ownerUserId: 'owner',
        teamId: 'team-a',
        role: 'Member',
        position: 'Parent',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'owner'), {
        userId: 'owner',
        ownerUserId: 'owner',
        teamId: 'team-a',
        role: 'Admin',
        position: 'Head Coach',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'staff'), {
        userId: 'staff',
        ownerUserId: 'owner',
        teamId: 'team-a',
        role: 'Member',
        position: 'Assistant Coach',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'child-player'), {
        userId: 'parent-account',
        playerId: 'child-player',
        role: 'Member',
        position: 'Player',
        status: 'active',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'removed'), {
        userId: 'removed',
        role: 'Member',
        position: 'Player',
        status: 'removed',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'suspended'), {
        userId: 'suspended',
        role: 'Member',
        position: 'Player',
        status: 'active',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'members', 'pending-delete'), {
        userId: 'pending-delete',
        role: 'Member',
        position: 'Player',
        status: 'active',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'groupChats', 'chat-a'), {
        createdBy: 'owner',
        memberIds: ['owner', 'member', 'removed'],
      }),
      setDoc(doc(db, 'teams', 'team-a', 'groupChats', 'chat-a', 'messages', 'existing'), {
        authorId: 'owner',
        text: 'private',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'groupChats', 'staff-chat'), {
        createdBy: 'owner',
        memberIds: ['owner', 'staff'],
        staffOnly: true,
      }),
      setDoc(doc(db, 'teams', 'team-a', 'groupChats', 'staff-chat', 'messages', 'staff-message'), {
        authorId: 'owner',
        text: 'staff only',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'events', 'event-a'), {
        title: 'Open Tryout',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'events', 'event-a', 'registrations', 'response-a'), {
        name: 'Applicant',
        email: 'applicant@example.test',
        phone: '555-0101',
        status: 'pending',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'registrationEntries', 'legacy-response'), {
        event_id: 'event-a',
        answers: { email: 'legacy@example.test' },
        status: 'pending',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'alerts', 'coaches-only'), {
        audience: 'coaches',
        title: 'Private staff alert',
        createdBy: 'owner',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'alerts', 'parents-only'), {
        audience: 'parents',
        title: 'Parent alert',
        createdBy: 'owner',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'alerts', 'targeted-other'), {
        audience: 'everyone',
        targetUserId: 'someone-else',
        title: 'Targeted alert',
        createdBy: 'owner',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'paymentItems', 'item-a'), {
        name: 'Team dues',
        amount: 5000,
      }),
      setDoc(doc(db, 'teams', 'team-a', 'payments', 'member-payment'), {
        payer_email: 'member@example.test',
        amount: 5000,
        payment_method: 'online',
        status: 'paid',
      }),
      setDoc(doc(db, 'teams', 'team-a', 'payments', 'other-payment'), {
        payer_email: 'other@example.test',
        amount: 7500,
        payment_method: 'offline',
        status: 'paid',
      }),
      setDoc(doc(db, 'players', 'private-player'), {
        userId: 'member',
        parentId: 'member',
        primaryTeamId: 'team-a',
        recruitingProfileEnabled: false,
      }),
      setDoc(doc(db, 'players', 'public-player'), {
        userId: 'member',
        parentId: 'member',
        primaryTeamId: 'team-a',
        recruitingProfileEnabled: true,
      }),
      setDoc(doc(db, 'players', 'public-player', 'contact', 'private'), {
        email: 'guardian@example.test',
      }),
      setDoc(doc(db, 'leagues', 'league-a'), {
        creatorId: 'owner',
        memberUserIds: ['owner', 'member'],
      }),
      setDoc(doc(db, 'publicLeagueViews', 'league-a'), {
        schedule: [],
        roster: [],
      }),
      setDoc(doc(db, 'facilities', 'facility-a'), {
        clubId: 'owner',
        name: 'Private Venue',
      }),
      setDoc(doc(db, 'clubs', 'club-a'), {
        ownerUserId: 'owner',
        subscriptionStatus: 'active',
      }),
      setDoc(doc(db, 'leagues', 'global', 'invites', 'legacy-invite'), {
        invitedEmail: 'private@example.test',
        leagueId: 'league-a',
      }),
      setDoc(doc(db, 'alerts', 'legacy-global'), {
        createdBy: 'owner',
        message: 'Legacy global alert',
      }),
      setDoc(doc(db, 'subscriptions', 'subscription-a'), {
        userId: 'owner',
        status: 'active',
      }),
      setDoc(doc(db, 'newsletter_subscribers', 'subscriber-a'), {
        email: 'subscriber@example.com',
        isActive: true,
      }),
      setDoc(doc(db, 'newsletter_campaigns', 'campaign-a'), {
        subject: 'Private campaign',
        status: 'sent',
      }),
      setDoc(doc(db, 'newsletter_webhook_events', 'webhook-a'), {
        eventType: 'email.delivered',
        status: 'completed',
      }),
      setDoc(doc(db, 'newsletter_email_events', 'email-event-a'), {
        emailId: 'email-a',
        eventType: 'email.delivered',
      }),
      setDoc(doc(db, 'contact_inquiries', 'inquiry-a'), {
        email: 'visitor@example.com',
        inquiry: 'Private inquiry',
        deliveryStatus: 'sent',
      }),
      setDoc(doc(db, 'sports_hub_rss_feeds', 'feed-a'), {
        name: 'Private feed configuration',
        url: 'https://example.com/rss',
      }),
      setDoc(doc(db, 'sports_hub_articles', 'published-a'), {
        title: 'Published article',
        isDraft: false,
      }),
      setDoc(doc(db, 'sports_hub_articles', 'draft-a'), {
        title: 'Draft article',
        isDraft: true,
      }),
      setDoc(doc(db, 'sports_hub_newsletter_subscribers', 'hub-subscriber-a'), {
        email: 'hub@example.com',
        isActive: true,
      }),
      setDoc(doc(db, 'calendarFeeds', 'existing-feed'), {
        type: 'team',
        userId: 'owner',
        teamId: 'team-a',
        active: true,
      }),
    ]);
  });
});

after(async () => {
  await testEnv?.cleanup();
});

function authenticatedDb(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, {
    email_verified: true,
    ...claims,
  }).firestore();
}

test('user profiles remain private and billing authority cannot be self-granted', async () => {
  const ownerDb = authenticatedDb('owner');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner')));
  await assertFails(getDoc(doc(outsiderDb, 'users', 'owner')));
  await assertFails(setDoc(doc(outsiderDb, 'users', 'new-user'), {
    role: 'coach',
    plan_type: 'school',
    team_limit: 100,
  }));
});

test('OAuth credentials remain server-only despite the user subcollection fallback', async () => {
  const ownerDb = authenticatedDb('owner');
  const superAdminDb = authenticatedDb('root', { role: 'superadmin' });
  const tokenRef = doc(ownerDb, 'users', 'owner', 'tokens', 'google');

  await assertFails(getDoc(tokenRef));
  await assertFails(setDoc(tokenRef, { access_token: 'forged' }));
  await assertFails(getDoc(doc(superAdminDb, 'users', 'owner', 'tokens', 'google')));
});

test('calendar feed documents are readable and writable only by trusted server code', async () => {
  const ownerDb = authenticatedDb('owner');
  const superAdminDb = authenticatedDb('root', { role: 'superadmin' });
  const feedRef = doc(ownerDb, 'calendarFeeds', 'existing-feed');

  await assertFails(getDoc(feedRef));
  await assertFails(setDoc(doc(ownerDb, 'calendarFeeds', 'forged-feed'), {
    type: 'team',
    userId: 'owner',
    teamId: 'another-team',
    active: true,
  }));
  await assertFails(setDoc(feedRef, { teamId: 'another-team' }, { merge: true }));
  await assertFails(setDoc(doc(superAdminDb, 'stripeConnectWebhookEvents', 'evt_forged'), {
    status: 'completed',
  }));
});

test('payment records are server-written and members can read only their own records', async () => {
  const ownerDb = authenticatedDb('owner', { email: 'owner@example.test' });
  const staffDb = authenticatedDb('staff', { email: 'staff@example.test' });
  const memberDb = authenticatedDb('member', { email: 'member@example.test' });
  const outsiderDb = authenticatedDb('outsider', { email: 'member@example.test' });

  await assertFails(setDoc(doc(ownerDb, 'teams', 'team-a', 'payments', 'forged-owner'), {
    payer_email: 'owner@example.test',
    amount: 1,
    status: 'paid',
  }));
  await assertFails(setDoc(doc(staffDb, 'teams', 'team-a', 'payments', 'forged-staff'), {
    payer_email: 'staff@example.test',
    amount: 1,
    status: 'paid',
  }));
  await assertFails(setDoc(doc(staffDb, 'teams', 'team-a', 'paymentItems', 'forged-item'), {
    name: 'Forged fee',
    amount: 1,
  }));

  await assertSucceeds(getDoc(doc(memberDb, 'teams', 'team-a', 'payments', 'member-payment')));
  await assertFails(getDoc(doc(memberDb, 'teams', 'team-a', 'payments', 'other-payment')));
  await assertFails(getDoc(doc(outsiderDb, 'teams', 'team-a', 'payments', 'member-payment')));
  await assertSucceeds(getDoc(doc(staffDb, 'teams', 'team-a', 'payments', 'other-payment')));
  await assertSucceeds(getDoc(doc(ownerDb, 'teams', 'team-a', 'payments', 'other-payment')));
  await assertSucceeds(getDocs(query(
    collection(memberDb, 'teams', 'team-a', 'payments'),
    where('payer_email', '==', 'member@example.test'),
  )));
  await assertFails(getDocs(collection(memberDb, 'teams', 'team-a', 'payments')));
});

test('team creation is server-only and tenant reads require membership', async () => {
  const ownerDb = authenticatedDb('owner');
  const memberDb = authenticatedDb('member');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDoc(doc(ownerDb, 'teams', 'team-a')));
  await assertSucceeds(getDoc(doc(memberDb, 'teams', 'team-a')));
  await assertFails(getDoc(doc(outsiderDb, 'teams', 'team-a')));

  await assertFails(setDoc(doc(outsiderDb, 'teams', 'free-team'), {
    ownerUserId: 'outsider',
    isPro: false,
    planId: 'free',
  }));
  await assertFails(setDoc(doc(outsiderDb, 'teams', 'forged-pro-team'), {
    ownerUserId: 'outsider',
    isPro: true,
    planId: 'team',
  }));
});

test('event registration contact details are readable only by staff', async () => {
  const responsePath = ['teams', 'team-a', 'events', 'event-a', 'registrations', 'response-a'];
  await assertFails(getDoc(doc(authenticatedDb('member'), ...responsePath)));
  await assertFails(getDoc(doc(authenticatedDb('outsider'), ...responsePath)));
  await assertSucceeds(getDoc(doc(authenticatedDb('staff'), ...responsePath)));
  await assertSucceeds(getDoc(doc(authenticatedDb('owner'), ...responsePath)));
  await assertFails(setDoc(doc(authenticatedDb('staff'), 'teams', 'team-a', 'events', 'event-a', 'registrations', 'forged'), {
    name: 'Forged', email: 'forged@example.test', phone: '555-9999',
  }));
});

test('legacy tournament responses remain staff-only while organizers migrate them', async () => {
  const responsePath = ['teams', 'team-a', 'registrationEntries', 'legacy-response'];
  await assertFails(getDoc(doc(authenticatedDb('member'), ...responsePath)));
  await assertSucceeds(getDoc(doc(authenticatedDb('staff'), ...responsePath)));
  await assertSucceeds(setDoc(doc(authenticatedDb('staff'), ...responsePath), { status: 'accepted' }, { merge: true }));
});

test('league creation is server-only and legacy invite PII is admin-only', async () => {
  const ownerDb = authenticatedDb('owner');
  const outsiderDb = authenticatedDb('outsider');
  const superAdminDb = authenticatedDb('root', { role: 'superadmin' });

  await assertFails(setDoc(doc(ownerDb, 'leagues', 'forged-league'), {
    creatorId: 'owner',
    memberUserIds: ['owner'],
  }));
  await assertFails(getDoc(doc(ownerDb, 'leagues', 'global', 'invites', 'legacy-invite')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'leagues', 'global', 'invites', 'legacy-invite')));
  await assertFails(getDoc(doc(outsiderDb, 'clubs', 'club-a')));
  await assertSucceeds(getDoc(doc(ownerDb, 'clubs', 'club-a')));
});

test('anonymous demo sessions can read only their server-scoped demo teams', async () => {
  const demoDb = authenticatedDb('demo-user', {
    firebase: { sign_in_provider: 'anonymous' },
  });
  const otherDemoDb = authenticatedDb('other-demo-user', {
    firebase: { sign_in_provider: 'anonymous' },
  });

  await assertSucceeds(getDoc(doc(demoDb, 'teams', 'demo-team')));
  await assertFails(getDoc(doc(otherDemoDb, 'teams', 'demo-team')));
});

test('anonymous demos can enrich protected server-created shells', async () => {
  const demoDb = authenticatedDb('demo-user', {
    firebase: { sign_in_provider: 'anonymous' },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'demo-user'), {
        role: 'coach',
        isDemo: true,
      }),
      setDoc(doc(db, 'leagues', 'demo-league'), {
        creatorId: 'demo-user',
        memberUserIds: ['demo-user'],
        memberTeamIds: ['demo-team'],
        isDemo: true,
      }),
    ]);
  });

  const batch = writeBatch(demoDb);
  batch.set(doc(demoDb, 'leagues', 'demo-league'), {
    creatorId: 'demo-user',
    memberUserIds: ['demo-user'],
    memberTeamIds: ['demo-team'],
    name: 'Demo League',
  }, { merge: true });
  batch.set(doc(demoDb, 'teams', 'demo-team'), {
    name: 'Demo Team',
    ownerUserId: 'fictional-coach',
    demoSessionOwnerId: 'demo-user',
    isDemo: true,
    isPro: true,
    planId: 'team',
  }, { merge: true });
  batch.set(doc(demoDb, 'users', 'demo-user', 'teamMemberships', 'demo-team'), {
    teamId: 'demo-team',
    ownerUserId: 'fictional-coach',
    isDemo: true,
  });

  await assertSucceeds(batch.commit());
});

test('linked youth members retain access while removed members lose it', async () => {
  const youthDb = authenticatedDb('youth');
  const removedDb = authenticatedDb('removed');

  await assertSucceeds(getDoc(doc(youthDb, 'teams', 'team-a')));
  await assertFails(getDoc(doc(removedDb, 'teams', 'team-a')));
  await assertFails(getDoc(doc(removedDb, 'teams', 'team-a', 'groupChats', 'chat-a')));
  await assertFails(getDoc(doc(
    removedDb,
    'teams',
    'team-a',
    'groupChats',
    'chat-a',
    'messages',
    'existing',
  )));
});

test('unverified, suspended, and deletion-pending accounts cannot retain tenant access', async () => {
  const unverifiedDb = testEnv.authenticatedContext('member', {
    email_verified: false,
  }).firestore();
  const suspendedDb = authenticatedDb('suspended');
  const pendingDeleteDb = authenticatedDb('pending-delete');

  await assertFails(getDoc(doc(unverifiedDb, 'teams', 'team-a')));
  await assertFails(getDoc(doc(suspendedDb, 'teams', 'team-a')));
  await assertFails(getDoc(doc(pendingDeleteDb, 'teams', 'team-a')));
});

test('members cannot create or promote their own team membership', async () => {
  const memberDb = authenticatedDb('member');
  const ownerDb = authenticatedDb('owner');

  await assertFails(setDoc(doc(memberDb, 'teams', 'team-a', 'members', 'member'), {
    userId: 'member',
    role: 'Owner',
  }));
  await assertSucceeds(setDoc(doc(ownerDb, 'teams', 'team-a', 'members', 'member-2'), {
    userId: 'member-2',
    ownerUserId: 'owner',
    teamId: 'team-a',
  }));
});

test('delegated staff can run team operations without changing authority or billing', async () => {
  const staffDb = authenticatedDb('staff');

  await assertSucceeds(setDoc(doc(staffDb, 'teams', 'team-a', 'events', 'practice-a'), {
    eventType: 'practice',
    title: 'Staff practice',
  }));
  await assertSucceeds(setDoc(doc(staffDb, 'teams', 'team-a', 'drills', 'drill-a'), {
    title: 'Passing',
  }));
  await assertSucceeds(setDoc(doc(staffDb, 'teams', 'team-a', 'members', 'player-a'), {
    userId: 'player-a',
    role: 'Member',
    position: 'Player',
    name: 'New Player',
  }));
  await assertSucceeds(setDoc(
    doc(staffDb, 'teams', 'team-a', 'members', 'member'),
    { name: 'Updated member', role: 'Member', position: 'Parent', userId: 'member', ownerUserId: 'owner', teamId: 'team-a' },
  ));
  await assertSucceeds(setDoc(
    doc(staffDb, 'teams', 'team-a'),
    { parentChatEnabled: true },
    { merge: true },
  ));

  await assertFails(setDoc(doc(staffDb, 'teams', 'team-a', 'members', 'promoted'), {
    userId: 'promoted',
    role: 'Admin',
    position: 'Head Coach',
  }));
  await assertFails(setDoc(
    doc(staffDb, 'teams', 'team-a', 'members', 'member'),
    { role: 'Admin', position: 'Head Coach' },
    { merge: true },
  ));
  await assertFails(deleteDoc(doc(staffDb, 'teams', 'team-a', 'members', 'owner')));
  await assertFails(setDoc(
    doc(staffDb, 'teams', 'team-a'),
    { planId: 'school', isPro: true },
    { merge: true },
  ));
});

test('unsupported root tournament hubs cannot bypass team-scoped tournament controls', async () => {
  const ownerDb = authenticatedDb('owner');
  await assertFails(setDoc(doc(ownerDb, 'tournaments', 'forged-hub'), {
    creatorId: 'owner',
    memberUserIds: ['owner'],
  }));
});

test('team chat messages are server-authored and cannot be impersonated by clients', async () => {
  const memberDb = authenticatedDb('member');
  const uninvitedYouthDb = authenticatedDb('youth');

  await assertFails(setDoc(
    doc(memberDb, 'teams', 'team-a', 'groupChats', 'chat-a', 'messages', 'self-message'),
    { authorId: 'member', text: 'hello' },
  ));
  await assertFails(setDoc(
    doc(memberDb, 'teams', 'team-a', 'groupChats', 'chat-a', 'messages', 'forged-message'),
    { authorId: 'owner', text: 'forged' },
  ));
  await assertFails(getDoc(doc(
    uninvitedYouthDb,
    'teams',
    'team-a',
    'groupChats',
    'chat-a',
  )));
  await assertFails(getDoc(doc(
    uninvitedYouthDb,
    'teams',
    'team-a',
    'groupChats',
    'chat-a',
    'messages',
    'existing',
  )));
});

test('parents and players cannot read staff-only channels or their messages', async () => {
  for (const uid of ['member', 'youth']) {
    const db = authenticatedDb(uid);
    await assertFails(getDoc(doc(db, 'teams', 'team-a', 'groupChats', 'staff-chat')));
    await assertFails(getDoc(doc(db, 'teams', 'team-a', 'groupChats', 'staff-chat', 'messages', 'staff-message')));
  }
});

test('team alert audiences and targets are enforced by rules, not only the UI', async () => {
  const ownerDb = authenticatedDb('owner');
  const parentDb = authenticatedDb('member');

  await assertSucceeds(getDoc(doc(ownerDb, 'teams', 'team-a', 'alerts', 'coaches-only')));
  await assertFails(getDoc(doc(parentDb, 'teams', 'team-a', 'alerts', 'coaches-only')));
  await assertSucceeds(getDoc(doc(parentDb, 'teams', 'team-a', 'alerts', 'parents-only')));
  await assertFails(getDoc(doc(parentDb, 'teams', 'team-a', 'alerts', 'targeted-other')));
});

test('player records stay family-scoped even when recruiting is enabled', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const memberDb = authenticatedDb('member');

  await assertFails(getDoc(doc(anonymousDb, 'players', 'private-player')));
  await assertFails(getDoc(doc(anonymousDb, 'players', 'public-player')));
  await assertFails(getDoc(doc(anonymousDb, 'players', 'public-player', 'contact', 'private')));
  await assertSucceeds(getDoc(doc(memberDb, 'players', 'private-player')));
});

test('a guardian can maintain their child record and an outsider cannot', async () => {
  const guardianDb = authenticatedDb('member');
  const outsiderDb = authenticatedDb('outsider');
  const playerRef = 'players/private-player';

  await assertSucceeds(setDoc(doc(guardianDb, playerRef), {
    guardianNote: 'Updated by guardian',
  }, { merge: true }));
  await assertFails(setDoc(doc(outsiderDb, playerRef), {
    guardianNote: 'Forged update',
  }, { merge: true }));
});

test('leagues are visible only to organizers or registered members', async () => {
  const memberDb = authenticatedDb('member');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDoc(doc(memberDb, 'leagues', 'league-a')));
  await assertFails(getDoc(doc(outsiderDb, 'leagues', 'league-a')));
  await assertFails(setDoc(doc(outsiderDb, 'leagues', 'forged-league'), {
    creatorId: 'outsider',
    memberUserIds: ['outsider', 'member'],
  }));
});

test('spectator projections allow direct links but cannot be enumerated', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, 'publicLeagueViews', 'league-a')));
  await assertFails(getDocs(collection(anonymousDb, 'publicLeagueViews')));
});

test('facilities and subscriptions remain owner-scoped and server-controlled', async () => {
  const ownerDb = authenticatedDb('owner');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDoc(doc(ownerDb, 'facilities', 'facility-a')));
  await assertFails(getDoc(doc(outsiderDb, 'facilities', 'facility-a')));
  await assertSucceeds(setDoc(
    doc(ownerDb, 'facilities', 'facility-a'),
    { clubId: 'owner', name: 'Updated Venue' },
  ));
  await assertFails(deleteDoc(doc(ownerDb, 'facilities', 'facility-a')));

  await assertSucceeds(getDoc(doc(ownerDb, 'subscriptions', 'subscription-a')));
  await assertFails(getDoc(doc(outsiderDb, 'subscriptions', 'subscription-a')));
  await assertFails(setDoc(doc(ownerDb, 'subscriptions', 'subscription-a'), {
    userId: 'owner',
    status: 'active',
  }));
});

test('club billing metadata and legacy global alerts are not cross-account readable', async () => {
  const ownerDb = authenticatedDb('owner');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDoc(doc(ownerDb, 'clubs', 'club-a')));
  await assertFails(getDoc(doc(outsiderDb, 'clubs', 'club-a')));
  await assertFails(getDoc(doc(ownerDb, 'alerts', 'legacy-global')));
});

test('league collection queries cannot discover other organizations', async () => {
  const memberDb = authenticatedDb('member');
  const outsiderDb = authenticatedDb('outsider');

  await assertSucceeds(getDocs(query(
    collection(memberDb, 'leagues'),
    where('memberUserIds', 'array-contains', 'member'),
  )));
  await assertFails(getDocs(collection(outsiderDb, 'leagues')));
});

test('newsletter consent and campaign records are server-controlled and superadmin-only', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const outsiderDb = authenticatedDb('outsider');
  const superAdminDb = authenticatedDb('global-admin', { role: 'superadmin' });

  await assertFails(setDoc(doc(anonymousDb, 'newsletter_signups', 'spam'), {
    email: 'spam@example.com',
  }));
  await assertFails(getDoc(doc(outsiderDb, 'newsletter_subscribers', 'subscriber-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'newsletter_subscribers', 'subscriber-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'newsletter_campaigns', 'campaign-a')));
  await assertFails(getDoc(doc(outsiderDb, 'newsletter_webhook_events', 'webhook-a')));
  await assertFails(getDoc(doc(outsiderDb, 'newsletter_email_events', 'email-event-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'newsletter_webhook_events', 'webhook-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'newsletter_email_events', 'email-event-a')));
  await assertFails(setDoc(doc(superAdminDb, 'newsletter_campaigns', 'forged-campaign'), {
    status: 'sent',
  }));
  await assertFails(setDoc(doc(superAdminDb, 'newsletter_webhook_events', 'forged-event'), {
    status: 'completed',
  }));
});

test('contact inquiries are server-written and superadmin-readable only', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const outsiderDb = authenticatedDb('outsider');
  const superAdminDb = authenticatedDb('global-admin', { role: 'superadmin' });

  await assertFails(setDoc(doc(anonymousDb, 'contact_inquiries', 'forged'), {
    email: 'visitor@example.com',
    inquiry: 'Forged inquiry',
  }));
  await assertFails(getDoc(doc(outsiderDb, 'contact_inquiries', 'inquiry-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'contact_inquiries', 'inquiry-a')));
  await assertFails(setDoc(doc(superAdminDb, 'contact_inquiries', 'inquiry-a'), {
    deliveryStatus: 'sent',
  }));
});

test('Sports Hub drafts, feeds, and subscriber data remain protected', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const outsiderDb = authenticatedDb('outsider');
  const superAdminDb = authenticatedDb('global-admin', { role: 'superadmin' });

  await assertFails(getDoc(doc(anonymousDb, 'sports_hub_articles', 'published-a')));
  await assertFails(getDoc(doc(anonymousDb, 'sports_hub_articles', 'draft-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'sports_hub_articles', 'draft-a')));
  await assertFails(setDoc(doc(outsiderDb, 'sports_hub_articles', 'forged'), {
    title: 'Forged article',
    isDraft: false,
  }));
  await assertFails(getDoc(doc(outsiderDb, 'sports_hub_rss_feeds', 'feed-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'sports_hub_rss_feeds', 'feed-a')));
  await assertFails(getDoc(doc(outsiderDb, 'sports_hub_newsletter_subscribers', 'hub-subscriber-a')));
  await assertSucceeds(getDoc(doc(superAdminDb, 'sports_hub_newsletter_subscribers', 'hub-subscriber-a')));
});
