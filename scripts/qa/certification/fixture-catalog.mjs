import { CERTIFICATION_SCENARIOS } from './scenario-catalog.mjs';
import sharp from 'sharp';

const FIXTURE_MEDIA_BASE64 = Object.freeze({
  'solid-png-v1': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQ4y2MQilnwnxLMMGrAqAGjBgwXAwAk9w0fJ+vjCgAAAABJRU5ErkJggg==',
  'solid-jpeg-v1': '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AoDDluAAA/9k=',
  'tiny-mp4-v1': 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAALqbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjl0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAGxbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABXG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARxzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABDExhdmMgbGlieDI2NAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMACDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABQwAAAUMAAAABhzdHRzAAAAAAAAAAEAAAABAABAAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAKGAAAAAQAAABRzdGNvAAAAAAAAAAEAAAMaAAAAPXVkdGEAAAA1bWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAIaWxzdAAAAAhmcmVlAAACjm1kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTkwIDdlZDc1M2IgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI0IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAADmWIhAV///8PRQABQt+A',
});

function mp4Boxes(bytes, start = 0, end = bytes.length) {
  const boxes = [];
  for (let offset = start; offset + 8 <= end;) {
    const size = bytes.readUInt32BE(offset);
    if (size < 8 || offset + size > end) break;
    boxes.push({ type: bytes.toString('ascii', offset + 4, offset + 8), offset, size });
    offset += size;
  }
  return boxes;
}

export function materializeFixtureMediaBytes(object) {
  const encoded = FIXTURE_MEDIA_BASE64[object.payloadGenerator];
  if (encoded) return Buffer.from(encoded, 'base64');

  const bytes = Buffer.alloc(object.sizeBytes);
  const seed = Buffer.from(object.payloadSeed, 'utf8');
  for (let offset = 0; offset < bytes.length; offset += seed.length) {
    seed.copy(bytes, offset, 0, Math.min(seed.length, bytes.length - offset));
  }
  if (object.payloadGenerator === 'mime-spoof-pe-v1') {
    bytes.write('MZ', 0, 'ascii');
    bytes.writeUInt32LE(64, 0x3c);
    bytes.write('PE\0\0', 64, 'binary');
  }
  return bytes;
}

export async function inspectFixtureMedia(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    const metadata = await sharp(bytes).metadata();
    return { detectedMime: 'image/png', width: metadata.width, height: metadata.height };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const metadata = await sharp(bytes).metadata();
    return { detectedMime: 'image/jpeg', width: metadata.width, height: metadata.height };
  }
  if (bytes.length >= 68 && bytes.toString('ascii', 0, 2) === 'MZ' &&
      bytes.readUInt32LE(0x3c) + 4 <= bytes.length &&
      bytes.toString('binary', bytes.readUInt32LE(0x3c), bytes.readUInt32LE(0x3c) + 4) === 'PE\0\0') {
    return { detectedMime: 'application/x-msdownload' };
  }
  const topLevel = mp4Boxes(bytes);
  const ftyp = topLevel.find(box => box.type === 'ftyp');
  const moov = topLevel.find(box => box.type === 'moov');
  const mdat = topLevel.find(box => box.type === 'mdat');
  if (ftyp && moov && mdat) {
    const movieHeader = mp4Boxes(bytes, moov.offset + 8, moov.offset + moov.size)
      .find(box => box.type === 'mvhd');
    if (movieHeader) {
      const dataOffset = movieHeader.offset + 8;
      const version = bytes[dataOffset];
      const timescaleOffset = dataOffset + (version === 1 ? 20 : 12);
      const durationOffset = dataOffset + (version === 1 ? 24 : 16);
      const timescale = bytes.readUInt32BE(timescaleOffset);
      const duration = version === 1
        ? Number(bytes.readBigUInt64BE(durationOffset))
        : bytes.readUInt32BE(durationOffset);
      if (timescale > 0 && duration > 0 && bytes.includes(Buffer.from('avc1'))) {
        return { detectedMime: 'video/mp4', durationSeconds: duration / timescale, videoCodec: 'avc1' };
      }
    }
  }
  return { detectedMime: 'application/octet-stream' };
}

const RUN_SUFFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const FIXED_NOW = '2026-09-04T18:00:00.000Z';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fixtureTimestamp(value) {
  return { __fixtureTimestamp: value };
}

function unique(values) {
  return [...new Set(values)];
}

export function buildFixtureCatalog(runSuffix) {
  if (typeof runSuffix !== 'string' || !RUN_SUFFIX_PATTERN.test(runSuffix)) {
    throw new Error('Fixture catalog requires a lowercase run suffix using only letters, numbers, and internal hyphens.');
  }

  const runId = `final-cert-${runSuffix}`;
  const legacyPhase2 = runSuffix === 'phase2';
  const scopedId = alias => legacyPhase2 ? alias : `${alias}-${runSuffix}`;
  const emailFor = alias => legacyPhase2
    ? `${alias}@phase2.test`
    : `${alias}.${runSuffix}@phase2.test`;
  const visibleMarker = marker => legacyPhase2 ? marker : `${marker}-${runSuffix.toUpperCase()}`;
  const timestamp = value => fixtureTimestamp(value);

  const identityDefinitions = [
    ['qa-coach-owner-a', 'registered', 'coach', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-coach-owner-b', 'registered', 'coach', 'active', ['qa-team-b'], 'free', '/dashboard'],
    ['qa-pro-owner', 'registered', 'coach', 'active', ['qa-pro-team'], 'team', '/dashboard'],
    ['qa-elite-owner', 'registered', 'coach', 'active', ['qa-elite-squad-1', 'qa-elite-squad-2', 'qa-elite-squad-3'], 'elite', '/club'],
    ['qa-school-owner', 'registered', 'admin', 'active', ['qa-school-hub', 'qa-school-squad-1', 'qa-school-squad-2', 'qa-school-squad-3'], 'school', '/club'],
    ['qa-school-delegate', 'registered', 'admin', 'active', ['qa-school-hub', 'qa-school-squad-1'], 'school', '/club'],
    ['qa-league-owner-a', 'registered', 'league_creator', 'active', ['qa-team-c'], 'league', '/competition'],
    ['qa-league-owner-b', 'registered', 'league_creator', 'active', [], 'league', '/competition'],
    ['qa-team-assistant', 'registered', 'coach', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-team-member', 'registered', 'adult_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-parent-a', 'registered', 'parent', 'active', ['qa-team-a', 'qa-team-c'], 'free', '/family'],
    ['qa-parent-b', 'registered', 'parent', 'active', ['qa-team-b'], 'free', '/family'],
    ['qa-adult-player-a', 'registered', 'adult_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-adult-player-b', 'registered', 'adult_player', 'active', ['qa-team-b'], 'free', '/dashboard'],
    ['qa-youth-invite', 'mailbox-only', 'youth_player', 'accountless', ['qa-team-c'], 'free', null],
    ['qa-youth-active', 'registered', 'youth_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-superadmin', 'registered', 'superadmin', 'active', [], 'free', '/admin'],
    ['qa-fake-superadmin', 'registered', 'superadmin', 'active', [], 'free', '/dashboard'],
    ['qa-unverified', 'registered', 'coach', 'unverified', [], 'free', '/verify-email'],
    ['qa-suspended', 'registered', 'adult_player', 'suspended', ['qa-team-a'], 'free', null],
    ['qa-removed-member', 'registered', 'adult_player', 'removed', [], 'free', '/dashboard'],
    ['qa-pending-delete', 'registered', 'adult_player', 'pending-delete', ['qa-team-a'], 'free', null],
    ['qa-owner-delete-blocked', 'registered', 'coach', 'active', ['qa-disposable-team'], 'free', '/dashboard'],
    ['qa-multi-org', 'registered', 'coach', 'active', ['qa-team-a', 'qa-team-b'], 'free', '/dashboard'],
    ['qa-public-submitter', 'public-only', 'visitor', 'accountless', [], 'free', null],
    ['qa-demo-a', 'anonymous-session', 'demo', 'anonymous', [], 'free', '/dashboard'],
    ['qa-demo-b', 'anonymous-session', 'demo', 'anonymous', [], 'free', '/dashboard'],
    ['qa-fresh-coach', 'registered', 'coach', 'active', [], 'free', '/teams/new'],
    ['qa-fresh-admin', 'registered', 'admin', 'active', [], 'free', '/teams/new'],
    ['qa-fresh-league-creator', 'registered', 'league_creator', 'active', [], 'league', '/teams/new'],
  ];

  const identities = identityDefinitions.map(([
    alias,
    accountKind,
    role,
    state,
    tenantAliases,
    planId,
    expectedLanding,
  ]) => ({
    alias,
    accountKind,
    uid: accountKind === 'registered' ? scopedId(alias) : null,
    email: accountKind === 'registered' || accountKind === 'mailbox-only' || accountKind === 'public-only'
      ? emailFor(alias)
      : null,
    role,
    state,
    verified: accountKind === 'registered' && state !== 'unverified',
    disabled: state === 'suspended',
    claims: alias === 'qa-superadmin' ? { role: 'superadmin' } : null,
    tenantAliases,
    tenantIds: tenantAliases.map(scopedId),
    leagueAliases: alias === 'qa-league-owner-a' || alias === 'qa-multi-org' || alias === 'qa-removed-member'
      ? ['qa-league-a']
      : alias === 'qa-league-owner-b'
        ? ['qa-league-b']
        : alias === 'qa-owner-delete-blocked'
          ? ['qa-disposable-league']
          : [],
    planId,
    expectedLanding,
    cleanupOwner: accountKind === 'anonymous-session' ? 'local-batch' : 'fixture-batch',
  }));

  const identityByAlias = new Map(identities.map(identity => [identity.alias, identity]));
  const uidFor = alias => identityByAlias.get(alias)?.uid || scopedId(alias);
  const teamIdFor = alias => scopedId(alias);
  const playerIdFor = alias => `p_${scopedId(alias)}`;

  const teamDefinitions = [
    ['qa-team-a', 'qa-coach-owner-a', visibleMarker('FALCON-A'), 'Phase 2 Falcons', 'Basketball', 'team', '#C81E1E', null, 'youth'],
    ['qa-team-b', 'qa-coach-owner-b', visibleMarker('BLUEBIRD-B'), 'Phase 2 Bluebirds', 'Soccer', 'free', '#1D4ED8', null, 'youth'],
    ['qa-team-c', 'qa-league-owner-a', visibleMarker('GOLDEN-C'), 'Phase 2 Goldens', 'Volleyball', 'free', '#B7791F', null, 'youth'],
    ['qa-pro-team', 'qa-pro-owner', visibleMarker('CRIMSON-PRO'), 'Crimson Pro', 'Basketball', 'team', '#991B1B', null, 'youth'],
    ['qa-elite-squad-1', 'qa-elite-owner', visibleMarker('ELITE-ONE'), 'Elite North', 'Hockey', 'elite', '#6D28D9', 'qa-club-elite', 'youth'],
    ['qa-elite-squad-2', 'qa-elite-owner', visibleMarker('ELITE-TWO'), 'Elite Central', 'Hockey', 'elite', '#7C3AED', 'qa-club-elite', 'youth'],
    ['qa-elite-squad-3', 'qa-elite-owner', visibleMarker('ELITE-THREE'), 'Elite South', 'Hockey', 'elite', '#8B5CF6', 'qa-club-elite', 'youth'],
    ['qa-school-hub', 'qa-school-owner', visibleMarker('SCHOOL-HUB'), 'School Athletics', 'Basketball', 'school', '#064E3B', 'qa-school', 'school_hub'],
    ['qa-school-squad-1', 'qa-school-owner', visibleMarker('SCHOOL-VARSITY'), 'School Varsity', 'Basketball', 'school', '#065F46', 'qa-school', 'school_squad'],
    ['qa-school-squad-2', 'qa-school-owner', visibleMarker('SCHOOL-JV'), 'School Junior Varsity', 'Basketball', 'school', '#047857', 'qa-school', 'school_squad'],
    ['qa-school-squad-3', 'qa-school-owner', visibleMarker('SCHOOL-FRESHMAN'), 'School Freshman', 'Basketball', 'school', '#059669', 'qa-school', 'school_squad'],
    ['qa-disposable-team', 'qa-owner-delete-blocked', visibleMarker('DISPOSABLE-OWNER'), 'Disposable Owner Guard', 'Soccer', 'free', '#374151', null, 'youth'],
  ];

  const runCodeScope = [...runSuffix].reduce((hash, character) =>
    Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261).toString(36).toUpperCase();
  const routeCode = (prefix, alias) => `${prefix}_${runCodeScope}_${alias}`
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .toUpperCase()
    .slice(0, 32);
  const teams = teamDefinitions.map(([
    alias,
    ownerAlias,
    marker,
    name,
    sport,
    planId,
    primaryColor,
    organizationAlias,
    type,
  ]) => ({
    alias,
    id: teamIdFor(alias),
    ownerAlias,
    ownerUserId: uidFor(ownerAlias),
    visibleMarker: marker,
    name: `${marker} ${name}`,
    sport,
    type,
    ageGroup: alias.includes('school') ? 'High School' : 'U16',
    planId,
    plan_type: planId,
    isPro: planId !== 'free',
    isDemo: false,
    outboundProvidersEnabled: false,
    organizationAlias,
    organizationId: organizationAlias ? scopedId(organizationAlias) : null,
    schoolId: type === 'school_squad' ? scopedId('qa-school-hub') : null,
    schoolAdminIds: type === 'school_hub' ? [uidFor('qa-school-delegate')] : [],
    primaryColor,
    createdAt: timestamp('2026-08-01T12:00:00.000Z'),
    moduleVisibility: {
      attendance: true,
      equipment: true,
      facilities: true,
      feed: true,
      files: true,
      fundraising: true,
      practice: true,
      volunteers: true,
    },
    features: {
      feed: true,
      roster: true,
      practice: true,
      playbook: true,
      volunteer: true,
      fundraising: true,
      tacticalChat: true,
    },
    code: routeCode('JOIN', alias),
    teamCode: routeCode('TEAM', alias),
    inviteCode: routeCode('INVITE', alias),
  }));

  const organizations = [
    {
      alias: 'qa-club-elite',
      id: scopedId('qa-club-elite'),
      kind: 'club',
      visibleMarker: visibleMarker('CLUB-PURPLE'),
      name: `${visibleMarker('CLUB-PURPLE')} Elite Club`,
      ownerAlias: 'qa-elite-owner',
      ownerUserId: uidFor('qa-elite-owner'),
      delegateAliases: [],
      squadAliases: ['qa-elite-squad-1', 'qa-elite-squad-2', 'qa-elite-squad-3'],
      capacity: 8,
    },
    {
      alias: 'qa-school',
      id: scopedId('qa-school'),
      kind: 'school',
      visibleMarker: visibleMarker('SCHOOL-GREEN'),
      name: `${visibleMarker('SCHOOL-GREEN')} Academy`,
      ownerAlias: 'qa-school-owner',
      ownerUserId: uidFor('qa-school-owner'),
      delegateAliases: ['qa-school-delegate'],
      squadAliases: ['qa-school-squad-1', 'qa-school-squad-2', 'qa-school-squad-3'],
      capacity: 15,
    },
  ];

  const households = [
    {
      alias: 'qa-household-a',
      id: scopedId('qa-household-a'),
      parentAlias: 'qa-parent-a',
      parentUserId: uidFor('qa-parent-a'),
      children: [
        { playerAlias: 'qa-player-youth-a', teamAlias: 'qa-team-a', loginAlias: 'qa-youth-active' },
        { playerAlias: 'qa-player-youth-c', teamAlias: 'qa-team-c', loginAlias: 'qa-youth-invite' },
      ],
      teamAliases: ['qa-team-a', 'qa-team-c'],
    },
    {
      alias: 'qa-household-b',
      id: scopedId('qa-household-b'),
      parentAlias: 'qa-parent-b',
      parentUserId: uidFor('qa-parent-b'),
      children: [{ playerAlias: 'qa-player-youth-b', teamAlias: 'qa-team-b', loginAlias: null }],
      teamAliases: ['qa-team-b'],
    },
  ];

  const leagues = [
    {
      alias: 'qa-league-a',
      id: scopedId('qa-league-a'),
      ownerAlias: 'qa-league-owner-a',
      creatorId: uidFor('qa-league-owner-a'),
      visibleMarker: visibleMarker('LEAGUE-ORANGE-A'),
      name: `${visibleMarker('LEAGUE-ORANGE-A')} League`,
      status: 'published',
      divisionAliases: ['qa-division-a-u14', 'qa-division-a-u16'],
      teamAliases: ['qa-team-a', 'qa-team-c'],
    },
    {
      alias: 'qa-league-b',
      id: scopedId('qa-league-b'),
      ownerAlias: 'qa-league-owner-b',
      creatorId: uidFor('qa-league-owner-b'),
      visibleMarker: visibleMarker('LEAGUE-TEAL-B'),
      name: `${visibleMarker('LEAGUE-TEAL-B')} League`,
      status: 'draft',
      divisionAliases: ['qa-division-b-u14'],
      teamAliases: ['qa-team-b'],
    },
    {
      alias: 'qa-disposable-league',
      id: scopedId('qa-disposable-league'),
      ownerAlias: 'qa-owner-delete-blocked',
      creatorId: uidFor('qa-owner-delete-blocked'),
      visibleMarker: visibleMarker('LEAGUE-DISPOSABLE'),
      name: `${visibleMarker('LEAGUE-DISPOSABLE')} Owner Guard`,
      status: 'draft',
      divisionAliases: [],
      teamAliases: ['qa-disposable-team'],
    },
  ];

  const tournaments = [
    {
      alias: 'qa-tournament-a',
      id: scopedId('qa-tournament-a'),
      teamAlias: 'qa-team-a',
      organizerAlias: 'qa-coach-owner-a',
      visibleMarker: visibleMarker('TOURNAMENT-RED-A'),
      name: `${visibleMarker('TOURNAMENT-RED-A')} Cup`,
      status: 'published',
      format: 'pool-to-bracket',
      hasDownstreamDependency: true,
    },
    {
      alias: 'qa-tournament-b',
      id: scopedId('qa-tournament-b'),
      teamAlias: 'qa-team-b',
      organizerAlias: 'qa-coach-owner-b',
      visibleMarker: visibleMarker('TOURNAMENT-BLUE-B'),
      name: `${visibleMarker('TOURNAMENT-BLUE-B')} Cup`,
      status: 'draft',
      format: 'round-robin',
      hasDownstreamDependency: false,
    },
  ];

  const subscriptionDefinitions = [
    ['billing-free', 'qa-coach-owner-b', 'free', 'none', null, 1],
    ['billing-trialing', 'qa-pro-owner', 'team', 'trialing', 'month', 1],
    ['billing-active-monthly', 'qa-elite-owner', 'elite', 'active', 'month', 8],
    ['billing-active-annual', 'qa-school-owner', 'school', 'active', 'year', 15],
    ['billing-past-due', 'qa-coach-owner-a', 'team', 'past_due', 'month', 1],
    ['billing-canceled', 'qa-league-owner-b', 'league', 'canceled', 'month', 1],
    ['billing-addon', 'qa-league-owner-a', 'league', 'active', 'year', 17],
    ['billing-customer-deleted', 'qa-owner-delete-blocked', 'free', 'customer_deleted', null, 1],
  ];
  const subscriptions = subscriptionDefinitions.map(([
    alias,
    ownerAlias,
    planId,
    status,
    interval,
    capacity,
  ]) => ({
    alias,
    id: scopedId(alias),
    ownerAlias,
    ownerUserId: uidFor(ownerAlias),
    planId,
    status,
    interval,
    capacity,
    addonQuantity: alias === 'billing-addon' ? 2 : 0,
    livemode: false,
    providerObjectSelector: `metadata.fixture_run_id=${runId};metadata.fixture_alias=${alias}`,
  }));

  const files = [
    ['qa-file-allowed', 'allowed', 'qa-team-a', 'image/png', 'image/png', 103, false, false, 'solid-png-v1'],
    ['qa-file-oversized', 'oversized', 'qa-team-a', 'video/mp4', 'video/mp4', 52_428_801, false, false, 'exact-size-v1'],
    ['qa-file-mime-spoofed', 'mime-spoofed', 'qa-team-b', 'image/png', 'application/x-msdownload', 512, false, false, 'mime-spoof-pe-v1'],
    ['qa-file-deleted', 'deleted', 'qa-team-b', 'image/png', 'image/png', 103, false, true, 'solid-png-v1'],
    ['qa-file-public', 'public', 'qa-team-c', 'image/jpeg', 'image/jpeg', 272, true, false, 'solid-jpeg-v1'],
    ['qa-file-private', 'private', 'qa-team-a', 'video/mp4', 'video/mp4', 1_440, false, false, 'tiny-mp4-v1'],
  ].map(([alias, fixtureCase, teamAlias, declaredMime, detectedMime, sizeBytes, isPublic, deleted, payloadGenerator]) => {
    const extension = declaredMime === 'video/mp4' ? 'mp4' : declaredMime === 'image/jpeg' ? 'jpg' : 'png';
    const storagePath = fixtureCase === 'allowed'
      ? `players/${playerIdFor('qa-player-adult-a')}/thumbnails/${scopedId(alias)}.${extension}`
      : fixtureCase === 'oversized'
        ? `players/${playerIdFor('qa-player-adult-a')}/videos/${scopedId(alias)}.${extension}`
        : fixtureCase === 'mime-spoofed'
          ? `players/${playerIdFor('qa-player-adult-b')}/avatar/${scopedId(alias)}.${extension}`
          : fixtureCase === 'private'
            ? `players/${playerIdFor('qa-player-adult-a')}/videos/${scopedId(alias)}.${extension}`
            : `teams/${teamIdFor(teamAlias)}/branding/${scopedId(alias)}.${extension}`;
    return {
      alias,
      id: scopedId(alias),
      case: fixtureCase,
      teamAlias,
      teamId: teamIdFor(teamAlias),
      ownerAlias: teamAlias === 'qa-team-b'
        ? 'qa-coach-owner-b'
        : teamAlias === 'qa-team-c'
          ? 'qa-league-owner-a'
          : 'qa-coach-owner-a',
      name: `${visibleMarker(teamAlias.toUpperCase())}-${fixtureCase}.${extension}`,
      declaredMime,
      detectedMime,
      sizeBytes,
      isPublic,
      deleted,
      storagePath,
      payloadGenerator,
      payloadSeed: `${runId}:${alias}`,
    };
  });

  const storageObjects = files.map(file => ({
    alias: file.alias,
    case: file.case,
    path: file.storagePath,
    ownerAlias: file.ownerAlias,
    access: file.isPublic ? 'public' : 'private',
    contentType: file.declaredMime,
    detectedMime: file.detectedMime,
    sizeBytes: file.sizeBytes,
    payloadGenerator: file.payloadGenerator,
    payloadSeed: file.payloadSeed,
    lifecycle: file.case === 'oversized' || file.case === 'mime-spoofed'
      ? 'negative-upload-only'
      : file.deleted
        ? 'delete-after-write'
        : 'present',
  })).concat({
    alias: 'qa-team-logo',
    case: 'branding-logo',
    path: `teams/${teamIdFor('qa-team-a')}/branding/${scopedId('qa-team-logo')}.png`,
    ownerAlias: 'qa-coach-owner-a',
    access: 'private',
    contentType: 'image/png',
    detectedMime: 'image/png',
    sizeBytes: 103,
    payloadGenerator: 'solid-png-v1',
    payloadSeed: `${runId}:qa-team-logo`,
    lifecycle: 'present',
  }, {
    alias: 'qa-disposable-reset-file',
    case: 'destructive-reset-file',
    path: `teams/${teamIdFor('qa-disposable-team')}/files/${scopedId('qa-disposable-reset-file')}.png`,
    ownerAlias: 'qa-owner-delete-blocked',
    access: 'private',
    contentType: 'image/png',
    detectedMime: 'image/png',
    sizeBytes: 103,
    payloadGenerator: 'solid-png-v1',
    payloadSeed: `${runId}:qa-disposable-reset-file`,
    lifecycle: 'present',
  }, {
    alias: 'qa-file-pending-delete',
    case: 'pending-delete',
    path: `players/${playerIdFor('qa-player-pending-delete')}/videos/${scopedId('qa-file-pending-delete')}.mp4`,
    ownerAlias: 'qa-pending-delete',
    access: 'private',
    contentType: 'video/mp4',
    detectedMime: 'video/mp4',
    sizeBytes: 1_440,
    payloadGenerator: 'tiny-mp4-v1',
    payloadSeed: `${runId}:qa-file-pending-delete`,
    lifecycle: 'present',
  });

  const timeFixtures = [
    ['qa-time-past', 'past', 'qa-team-a', '2026-08-15T18:00:00.000Z', '2026-08-15T19:30:00.000Z'],
    ['qa-time-current', 'current', 'qa-team-a', '2026-09-04T18:00:00.000Z', '2026-09-04T19:30:00.000Z'],
    ['qa-time-future', 'future', 'qa-team-b', '2026-10-15T18:00:00.000Z', '2026-10-15T19:30:00.000Z'],
    ['qa-time-cross-midnight', 'cross-midnight', 'qa-team-a', '2026-11-01T23:30:00.000-07:00', '2026-11-02T01:30:00.000-07:00'],
    ['qa-time-dst-spring', 'dst-spring-forward', 'qa-team-c', '2027-03-14T01:30:00.000-07:00', '2027-03-14T03:30:00.000-06:00'],
    ['qa-time-dst-fall', 'dst-fall-back', 'qa-team-b', '2026-11-01T01:15:00.000-06:00', '2026-11-01T01:45:00.000-07:00'],
  ].map(([alias, fixtureCase, teamAlias, startsAt, endsAt]) => ({
    alias,
    id: scopedId(alias),
    case: fixtureCase,
    teamAlias,
    teamId: teamIdFor(teamAlias),
    timeZone: 'America/Edmonton',
    startsAt,
    endsAt,
  }));

  const raceFixtures = [
    ['qa-race-team-capacity', 'team-capacity', ['qa-elite-owner', 'qa-elite-owner'], 'qa-elite-owner'],
    ['qa-race-join-code', 'join-code', ['qa-parent-a', 'qa-parent-a'], 'qa-player-youth-c'],
    ['qa-race-rsvp', 'rsvp', ['qa-team-member', 'qa-adult-player-a'], 'qa-time-current'],
    ['qa-race-poll-vote', 'poll-vote', ['qa-team-member', 'qa-adult-player-a'], 'qa-team-a-poll'],
    ['qa-race-booking', 'facility-booking', ['qa-coach-owner-a', 'qa-team-assistant'], 'qa-facility-a'],
    ['qa-race-registration', 'public-registration', ['qa-public-submitter', 'qa-demo-a'], 'qa-event-registration'],
  ].map(([alias, fixtureCase, participantAliases, targetAlias]) => ({
    alias,
    id: scopedId(alias),
    case: fixtureCase,
    barrierKey: `${runId}:${fixtureCase}:barrier`,
    participantAliases,
    targetAlias,
    expectedWinnerCount: 1,
  }));

  const fixtures = Object.fromEntries([
    'organization', 'roster', 'recruiting', 'family', 'schedule', 'practice', 'chat',
    'file', 'compliance', 'competition', 'facility', 'equipment', 'public', 'billing',
  ].map(domain => [domain, []]));
  const firestoreDocuments = [];

  const addDocument = (domain, descriptor) => {
    const entry = {
      ...descriptor,
      fixtureRunId: runId,
      cleanupOwner: descriptor.cleanupOwner || 'fixture-batch',
    };
    fixtures[domain].push(entry);
    firestoreDocuments.push({
      path: descriptor.path,
      domain,
      data: {
        ...descriptor.data,
        fixtureRunId: runId,
        fixtureAlias: descriptor.alias,
        synthetic: true,
      },
    });
  };

  const subscriptionByOwner = new Map(subscriptions.map(subscription => [subscription.ownerAlias, subscription]));
  for (const identity of identities.filter(value => value.accountKind === 'registered')) {
    const subscription = subscriptionByOwner.get(identity.alias);
    const profile = {
      id: identity.uid,
      uid: identity.uid,
      email: identity.email,
      name: identity.alias.replaceAll('-', ' '),
      role: identity.role,
      plan_type: subscription?.planId || identity.planId,
      planId: subscription?.planId || identity.planId,
      subscription_status: subscription?.status || 'none',
      subscription_interval: subscription?.interval || null,
      subscription_fixture_id: subscription?.id || null,
      team_limit: subscription?.capacity || 1,
      proTeamLimit: subscription?.capacity || 1,
      providerProvisioning: 'unprovisioned-test-descriptor',
      outboundProvidersEnabled: false,
      notificationsEnabled: false,
      fcmTokens: [],
      webPushSubscriptions: [],
      emailVerified: identity.verified,
      createdAt: timestamp(FIXED_NOW),
      updatedAt: timestamp(FIXED_NOW),
    };
    if (identity.alias === 'qa-suspended') profile.accountStatus = 'suspended';
    if (identity.alias === 'qa-pending-delete') profile.deletionStatus = 'pending';
    if (identity.alias === 'qa-school-owner') profile.isPrimaryClubAuthority = true;
    if (identity.alias === 'qa-elite-owner') profile.isPrimaryClubAuthority = true;
    if (identity.alias === 'qa-school-delegate') profile.isSchoolAdmin = true;
    addDocument('organization', {
      alias: identity.alias,
      path: `users/${identity.uid}`,
      data: profile,
    });
  }

  for (const team of teams) {
    addDocument('organization', {
      alias: team.alias,
      path: `teams/${team.id}`,
      data: { ...team, id: team.id, teamName: team.name },
    });
  }

  const disposableTeam = teams.find(team => team.alias === 'qa-disposable-team');
  for (const [collection, alias] of [['games', 'qa-disposable-game'], ['events', 'qa-disposable-event'], ['documents', 'qa-disposable-document']]) {
    addDocument('organization', {
      alias,
      path: `teams/${disposableTeam.id}/${collection}/${scopedId(alias)}`,
      data: { teamId: disposableTeam.id, ownerUserId: disposableTeam.ownerUserId, title: `${alias} reset fixture` },
    });
  }

  const membershipDefinitions = [
    ['qa-team-a', 'qa-coach-owner-a', 'Admin', 'Head Coach', 'active'],
    ['qa-team-a', 'qa-team-assistant', 'Admin', 'Assistant Coach', 'active'],
    ['qa-team-a', 'qa-team-member', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-parent-a', 'Member', 'Parent', 'active'],
    ['qa-team-a', 'qa-adult-player-a', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-youth-active', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-suspended', 'Member', 'Player', 'removed'],
    ['qa-team-a', 'qa-removed-member', 'Member', 'Player', 'removed'],
    ['qa-team-a', 'qa-pending-delete', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-multi-org', 'Admin', 'Assistant Coach', 'active'],
    ['qa-team-b', 'qa-coach-owner-b', 'Admin', 'Head Coach', 'active'],
    ['qa-team-b', 'qa-parent-b', 'Member', 'Parent', 'active'],
    ['qa-team-b', 'qa-adult-player-b', 'Member', 'Player', 'active'],
    ['qa-team-b', 'qa-multi-org', 'Member', 'Player', 'active'],
    ['qa-team-c', 'qa-parent-a', 'Member', 'Parent', 'active'],
    ['qa-team-c', 'qa-league-owner-a', 'Admin', 'League Organizer', 'active'],
    ['qa-pro-team', 'qa-pro-owner', 'Admin', 'Head Coach', 'active'],
    ['qa-elite-squad-1', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-elite-squad-2', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-elite-squad-3', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-school-hub', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-school-hub', 'qa-school-delegate', 'Admin', 'School Admin', 'active'],
    ['qa-school-squad-1', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-school-squad-1', 'qa-school-delegate', 'Admin', 'School Admin', 'active'],
    ['qa-school-squad-2', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-school-squad-3', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-disposable-team', 'qa-owner-delete-blocked', 'Admin', 'Head Coach', 'active'],
  ];

  for (const [teamAlias, userAlias, role, position, status] of membershipDefinitions) {
    const user = identityByAlias.get(userAlias);
    const team = teams.find(value => value.alias === teamAlias);
    const data = {
      id: user.uid,
      userId: user.uid,
      name: user.alias.replaceAll('-', ' '),
      email: user.email,
      role,
      position,
      status,
      isDeleted: false,
      ownerUserId: team.ownerUserId,
      joinedAt: timestamp('2026-08-01T12:00:00.000Z'),
    };
    if (userAlias === 'qa-youth-active') {
      data.playerId = playerIdFor('qa-player-youth-a');
      data.parentId = uidFor('qa-parent-a');
    }
    if (userAlias === 'qa-adult-player-a') data.playerId = playerIdFor('qa-player-adult-a');
    if (userAlias === 'qa-adult-player-b') data.playerId = playerIdFor('qa-player-adult-b');
    addDocument('roster', {
      alias: `${teamAlias}-${userAlias}-member`,
      path: `teams/${team.id}/members/${user.uid}`,
      data,
    });
    if (status === 'active') {
      addDocument('roster', {
        alias: `${userAlias}-${teamAlias}-membership`,
        path: `users/${user.uid}/teamMemberships/${team.id}`,
        data: {
          teamId: team.id,
          name: team.name,
          teamName: team.name,
          userId: user.uid,
          status: 'active',
          role,
          position,
          ownerUserId: team.ownerUserId,
          planId: team.planId,
          plan_type: team.plan_type,
          isPro: team.isPro,
          isDemo: false,
          outboundProvidersEnabled: false,
          type: team.type,
          ...(team.schoolId ? { schoolId: team.schoolId } : {}),
          joinedAt: timestamp('2026-08-01T12:00:00.000Z'),
        },
      });
    }
  }

  const players = [
    ['qa-player-adult-a', 'qa-adult-player-a', null, 'qa-team-a', 'Alex', visibleMarker('FALCON-A'), false],
    ['qa-player-youth-a', 'qa-youth-active', 'qa-parent-a', 'qa-team-a', 'Youth A', visibleMarker('FALCON-A'), false],
    ['qa-player-youth-c', null, 'qa-parent-a', 'qa-team-c', 'Youth C', visibleMarker('GOLDEN-C'), true],
    ['qa-player-adult-b', 'qa-adult-player-b', null, 'qa-team-b', 'Blair', visibleMarker('BLUEBIRD-B'), true],
    ['qa-player-youth-b', null, 'qa-parent-b', 'qa-team-b', 'Youth B', visibleMarker('BLUEBIRD-B'), false],
    ['qa-player-pending-delete', 'qa-pending-delete', null, 'qa-team-a', 'Delete', visibleMarker('DISPOSABLE'), false],
  ];
  for (const [alias, userAlias, parentAlias, teamAlias, firstName, lastName, publicEnabled] of players) {
    const playerId = playerIdFor(alias);
    const teamId = teamIdFor(teamAlias);
    addDocument('roster', {
      alias,
      path: `players/${playerId}`,
      data: {
        id: playerId,
        userId: userAlias ? uidFor(userAlias) : null,
        parentId: parentAlias ? uidFor(parentAlias) : null,
        primaryTeamId: teamId,
        joinedTeamIds: [teamId],
        firstName,
        lastName,
        email: userAlias ? emailFor(userAlias) : null,
        emergencyContact: `${lastName} synthetic guardian`,
        medicalNotes: `${lastName} synthetic private medical value`,
        recruitingProfileEnabled: publicEnabled,
      },
    });
    addDocument('recruiting', {
      alias: `${alias}-profile`,
      path: `players/${playerId}/recruitingProfile/profile`,
      data: {
        playerId,
        status: publicEnabled ? 'active' : 'hidden',
        headline: `${firstName} ${lastName} synthetic prospect`,
        position: 'Guard',
        gradYear: 2028,
        updatedAt: timestamp(FIXED_NOW),
        updatedByTeamId: teamId,
      },
    });
    addDocument('recruiting', {
      alias: `${alias}-metrics`,
      path: `players/${playerId}/recruitingProfile/metrics`,
      data: { height: '5ft 10in', weight: 155, sprintSeconds: 5.1, updatedAt: timestamp(FIXED_NOW), updatedByTeamId: teamId },
    });
    addDocument('recruiting', {
      alias: `${alias}-contact`,
      path: `players/${playerId}/recruitingContact/contact`,
      data: { email: `private-${alias}.${runSuffix}@phase2.test`, phone: '+15550100101', contactNote: `${lastName} synthetic private recruiting contact`, updatedByTeamId: teamId },
    });
    addDocument('recruiting', {
      alias: `${alias}-stat`,
      path: `players/${playerId}/stats/${scopedId(`${alias}-stat`)}`,
      data: { season: '2026', gamesPlayed: 12, points: alias.includes('-b') ? 82 : 71, assists: 14, createdAt: timestamp(FIXED_NOW), updatedByTeamId: teamId },
    });
    addDocument('recruiting', {
      alias: `${alias}-evaluation`,
      path: `players/${playerId}/evaluations/${scopedId('qa-evaluation')}`,
      data: {
        playerId,
        score: alias.includes('b') ? 82 : 71,
        notes: `${lastName} synthetic private evaluation`,
        createdAt: timestamp(FIXED_NOW),
        evaluatorId: uidFor(teamAlias === 'qa-team-b' ? 'qa-coach-owner-b' : teamAlias === 'qa-team-c' ? 'qa-league-owner-a' : 'qa-coach-owner-a'),
        updatedByTeamId: teamId,
      },
    });
    // The browser-visible public profile must not attempt any outbound media
    // fetch during a no-outbound certification run. Other private fixtures keep
    // video rows so CRUD and projection-denial coverage remains available.
    if (alias !== 'qa-player-adult-b') {
      addDocument('recruiting', {
        alias: `${alias}-video`,
        path: `players/${playerId}/videos/${scopedId(`${alias}-video`)}`,
        data: { playerId, title: `${firstName} synthetic highlight`, url: `https://media.example.test/${runId}/${alias}/highlight.mp4`, createdAt: timestamp(FIXED_NOW), updatedByTeamId: teamId },
      });
    }
  }

  const accountlessMembers = [
    ['qa-team-c', 'qa-player-youth-c', 'qa-parent-a', 'Youth C', visibleMarker('GOLDEN-C')],
    ['qa-team-b', 'qa-player-youth-b', 'qa-parent-b', 'Youth B', visibleMarker('BLUEBIRD-B')],
  ];
  for (const [teamAlias, playerAlias, parentAlias, firstName, lastName] of accountlessMembers) {
    const team = teams.find(value => value.alias === teamAlias);
    const playerId = playerIdFor(playerAlias);
    addDocument('roster', {
      alias: `${teamAlias}-${playerAlias}-member`,
      path: `teams/${team.id}/members/${playerId}`,
      data: { id: playerId, playerId, parentId: uidFor(parentAlias), teamId: team.id, ownerUserId: team.ownerUserId, firstName, lastName, name: `${firstName} ${lastName}`, role: 'Member', position: 'Player', status: 'active', isMinor: true },
    });
  }

  const rosterVariants = [
    ['qa-roster-accented', 'accented', 'José Álvarez', 'active'],
    ['qa-roster-mixed-case', 'mixed-case', 'aLEX Falcon', 'active'],
    ['qa-roster-duplicate-a', 'duplicate-name', 'Jordan Falcon', 'active'],
    ['qa-roster-duplicate-b', 'duplicate-name', 'Jordan Falcon', 'active'],
    ['qa-roster-long', 'long-value', `Synthetic ${'Long'.repeat(24)} Member`, 'active'],
    ['qa-roster-removed', 'removed', 'Removed Falcon', 'removed'],
  ].map(([alias, variant, name, status], index) => ({ alias, variant, name, status, id: playerIdFor(alias), index }));
  for (const row of rosterVariants) {
    addDocument('roster', {
      alias: `${row.alias}-player`,
      path: `players/${row.id}`,
      data: { id: row.id, userId: null, parentId: null, primaryTeamId: teamIdFor('qa-team-a'), joinedTeamIds: [teamIdFor('qa-team-a')], name: row.name, status: row.status },
    });
    addDocument('roster', {
      alias: row.alias,
      path: `teams/${teamIdFor('qa-team-a')}/members/${row.id}`,
      data: { id: row.id, playerId: row.id, teamId: teamIdFor('qa-team-a'), ownerUserId: uidFor('qa-coach-owner-a'), name: row.name, firstName: row.name.split(' ')[0], lastName: row.name.split(' ').slice(1).join(' '), role: 'Member', position: row.index % 2 ? 'Forward' : 'Guard', jersey: String(30 + row.index), status: row.status, email: `shared-contact-${row.index % 2}.${runSuffix}@phase2.test`, parentEmail: `parent-marker-${row.index}.${runSuffix}@phase2.test`, phone: `+15550100${200 + row.index}`, medicalClearance: row.index % 2 === 0, amountOwed: row.index * 10, feesPaid: row.index === 0, notes: `synthetic-private-roster-${row.index}` },
    });
  }

  for (const household of households) {
    addDocument('family', {
      alias: household.alias,
      path: `households/${household.id}`,
      data: {
        ...household,
        childPlayerIds: household.children.map(child => playerIdFor(child.playerAlias)),
        teamIds: household.teamAliases.map(teamIdFor),
      },
    });
  }
  for (const demoAlias of ['qa-demo-a', 'qa-demo-b']) {
    addDocument('organization', {
      alias: `${demoAlias}-workspace`,
      path: `demoWorkspaces/${scopedId(demoAlias)}`,
      cleanupOwner: 'local-batch',
      data: {
        alias: demoAlias,
        persona: 'shared-synthetic-coach-persona',
        workspaceMarker: visibleMarker(demoAlias === 'qa-demo-a' ? 'DEMO-A' : 'DEMO-B'),
        expiresAt: timestamp('2026-09-05T18:00:00.000Z'),
        billingAllowed: false,
      },
    });
  }
  const youthInvite = {
    alias: 'qa-youth-invite-contract',
    collection: 'invites',
    tokenFormat: '48-hex',
    childId: playerIdFor('qa-player-youth-c'),
    parentId: uidFor('qa-parent-a'),
    teamId: teamIdFor('qa-team-c'),
    recipientAlias: 'qa-youth-invite',
    recipientEmail: emailFor('qa-youth-invite'),
    startState: 'no-active-invite',
    deliveryAdapter: 'memory-sink',
    cleanupKinds: ['invite', 'auth', 'profile', 'player-overlay'],
  };
  for (const household of households) {
    for (const [index, child] of household.children.entries()) {
      addDocument('family', {
        alias: `${household.alias}-${child.playerAlias}-balance`,
        path: `users/${household.parentUserId}/payments/${scopedId(`${child.playerAlias}-balance`)}`,
        data: {
          childId: playerIdFor(child.playerAlias),
          childName: child.playerAlias.replaceAll('-', ' '),
          teamId: teamIdFor(child.teamAlias),
          teamName: teams.find(team => team.alias === child.teamAlias).name,
          description: `${teams.find(team => team.alias === child.teamAlias).visibleMarker} synthetic family fee`,
          amount: child.teamAlias === 'qa-team-b' ? 78 : 42,
          status: child.teamAlias === 'qa-team-c' ? 'pending' : 'paid',
          date: `2026-09-${String(10 + index).padStart(2, '0')}`,
          dueDate: `2026-10-${String(10 + index).padStart(2, '0')}`,
          invoiceNumber: `${visibleMarker('INV')}-${index + 1}`,
          category: 'team-fee',
        },
      });
    }
  }
  addDocument('family', {
    alias: 'qa-household-a-overdue-balance',
    path: `users/${uidFor('qa-parent-a')}/payments/${scopedId('qa-household-a-overdue-balance')}`,
    data: { childId: playerIdFor('qa-player-youth-a'), childName: 'Youth A', teamId: teamIdFor('qa-team-a'), teamName: teams.find(team => team.alias === 'qa-team-a').name, description: `${visibleMarker('FALCON-A')} overdue synthetic family fee`, amount: 19.5, status: 'overdue', date: '2026-09-09', dueDate: '2026-09-15', invoiceNumber: visibleMarker('INV-OVERDUE'), category: 'equipment' },
  });

  for (const timeFixture of timeFixtures) {
    const marker = teams.find(team => team.alias === timeFixture.teamAlias).visibleMarker;
    addDocument('schedule', {
      alias: timeFixture.alias,
      path: `teams/${timeFixture.teamId}/events/${timeFixture.id}`,
      data: {
        id: timeFixture.id,
        title: `${marker} ${timeFixture.case} event`,
        type: timeFixture.case === 'future' ? 'practice' : 'game',
        eventType: timeFixture.case === 'future' ? 'practice' : 'game',
        startsAt: timeFixture.startsAt,
        endsAt: timeFixture.endsAt,
        date: timeFixture.startsAt.slice(0, 10),
        startTime: timeFixture.startsAt.slice(11, 16),
        endDate: timeFixture.endsAt.slice(0, 10),
        endTime: timeFixture.endsAt.slice(11, 16),
        timeZone: timeFixture.timeZone,
        status: 'published',
      },
    });
  }
  for (const [teamAlias, marker] of [['qa-team-a', visibleMarker('FALCON-A')], ['qa-team-b', visibleMarker('BLUEBIRD-B')]]) {
    addDocument('schedule', {
      alias: `${teamAlias}-future-event`,
      path: `teams/${teamIdFor(teamAlias)}/events/qa-future-event`,
      data: {
        id: 'qa-future-event',
        title: `${marker} Future Practice`,
        type: 'practice',
        eventType: 'practice',
        date: '2026-10-15',
        startTime: '18:00',
        endTime: '19:30',
        createdBy: uidFor(teamAlias === 'qa-team-a' ? 'qa-coach-owner-a' : 'qa-coach-owner-b'),
      },
    });
    addDocument('schedule', {
      alias: `${teamAlias}-cross-midnight`,
      path: `teams/${teamIdFor(teamAlias)}/events/qa-cross-midnight`,
      data: {
        id: 'qa-cross-midnight',
        title: `${marker} Overnight Tournament`,
        type: 'tournament',
        eventType: 'tournament',
        date: '2026-11-01',
        endDate: '2026-11-02',
        startTime: '23:30',
        endTime: '01:30',
        createdBy: uidFor(teamAlias === 'qa-team-a' ? 'qa-coach-owner-a' : 'qa-coach-owner-b'),
      },
    });
  }

  addDocument('practice', {
    alias: 'qa-practice-plan-a',
    path: `teams/${teamIdFor('qa-team-a')}/practicePlans/${scopedId('qa-practice-plan-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Press Break`, status: 'assigned', drillIds: [scopedId('qa-drill-a')] },
  });
  addDocument('practice', {
    alias: 'qa-drill-a',
    path: `teams/${teamIdFor('qa-team-a')}/drills/${scopedId('qa-drill-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Closeout Drill`, order: 1, durationMinutes: 12 },
  });
  addDocument('practice', {
    alias: 'qa-film-a',
    path: `teams/${teamIdFor('qa-team-a')}/videos/${scopedId('qa-film-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Film`, storagePath: `qa-fixtures/${runId}/qa-team-a/film.mp4`, status: 'ready' },
  });

  const chatMembersByTeam = {
    'qa-team-a': membershipDefinitions.filter(value => value[0] === 'qa-team-a' && value[4] === 'active').map(value => uidFor(value[1])),
    'qa-team-b': membershipDefinitions.filter(value => value[0] === 'qa-team-b' && value[4] === 'active').map(value => uidFor(value[1])),
  };
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
  ]) {
    addDocument('chat', {
      alias: `${teamAlias}-chat`,
      path: `teams/${teamIdFor(teamAlias)}/groupChats/qa-team-chat`,
      data: {
        id: 'qa-team-chat',
        name: `${marker} Team Chat`,
        createdBy: uidFor(ownerAlias),
        memberIds: chatMembersByTeam[teamAlias],
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('chat', {
      alias: `${teamAlias}-chat-message`,
      path: `teams/${teamIdFor(teamAlias)}/groupChats/qa-team-chat/messages/qa-seed-message`,
      data: {
        id: 'qa-seed-message',
        authorId: uidFor(ownerAlias),
        senderId: uidFor(ownerAlias),
        text: `${marker} synthetic private message`,
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('chat', {
      alias: `${teamAlias}-feed-post`,
      path: `teams/${teamIdFor(teamAlias)}/feedPosts/${scopedId(`${teamAlias}-feed-post`)}`,
      data: {
        authorId: uidFor(ownerAlias),
        authorName: ownerAlias.replaceAll('-', ' '),
        content: `${marker} synthetic private feed post`,
        type: 'text',
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('chat', {
      alias: `${teamAlias}-poll`,
      path: `teams/${teamIdFor(teamAlias)}/polls/${scopedId(`${teamAlias}-poll`)}`,
      data: { question: `${marker} practice time?`, options: ['Early', 'Late'], votes: {}, status: 'open' },
    });
  }

  for (const file of files) {
    addDocument('file', {
      alias: file.alias,
      path: `teams/${file.teamId}/files/${file.id}`,
      data: {
        ...file,
        url: { __fixtureStorageObject: file.storagePath },
        createdAt: timestamp(FIXED_NOW),
      },
    });
  }
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
    ['qa-team-c', visibleMarker('GOLDEN-C'), 'qa-league-owner-a'],
  ]) {
    addDocument('compliance', {
      alias: `${teamAlias}-waiver`,
      path: `teams/${teamIdFor(teamAlias)}/documents/${scopedId(`${teamAlias}-waiver-v1`)}`,
      data: {
        title: `${marker} Waiver`,
        content: `${marker} synthetic waiver terms`,
        type: 'waiver',
        version: 1,
        isActive: teamAlias !== 'qa-team-b',
        assignedTo: ['all'],
        ownerUserId: uidFor(ownerAlias),
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('compliance', {
      alias: `${teamAlias}-incident`,
      path: `teams/${teamIdFor(teamAlias)}/incidents/${scopedId(`${teamAlias}-incident`)}`,
      data: { title: `${marker} Synthetic Incident`, subjectPlayerId: scopedId(teamAlias === 'qa-team-b' ? 'qa-player-youth-b' : 'qa-player-youth-a'), immutable: true },
    });
  }
  const globalWaiverDeployment = {
    alias: 'qa-school-global-waiver',
    deploymentId: scopedId('qa-school-waiver-deployment-v2'),
    ownerUserId: uidFor('qa-school-owner'),
    masterPath: `users/${uidFor('qa-school-owner')}/clubDocuments/${scopedId('qa-school-global-waiver-v2')}`,
    copyPaths: organizations[1].squadAliases.slice(0, 2).map((teamAlias, index) => (
      `teams/${teamIdFor(teamAlias)}/documents/${scopedId(`qa-school-global-waiver-copy-${index + 1}`)}`
    )),
  };
  addDocument('compliance', {
    alias: 'qa-school-global-waiver',
    path: globalWaiverDeployment.masterPath,
    data: { id: scopedId('qa-school-global-waiver-v2'), title: `${visibleMarker('SCHOOL-GREEN')} Global Waiver`, content: 'Synthetic global waiver', version: 2, type: 'waiver', ownerUserId: globalWaiverDeployment.ownerUserId, isClubMaster: true, isGlobal: true, deploymentId: globalWaiverDeployment.deploymentId, waiverAudience: 'participant', createdAt: timestamp(FIXED_NOW) },
  });
  globalWaiverDeployment.copyPaths.forEach((copyPath, index) => {
    const teamAlias = organizations[1].squadAliases[index];
    addDocument('compliance', {
      alias: `qa-school-global-waiver-copy-${index + 1}`,
      path: copyPath,
      data: { id: copyPath.split('/').at(-1), teamId: teamIdFor(teamAlias), title: `${visibleMarker('SCHOOL-GREEN')} Global Waiver`, content: 'Synthetic global waiver', type: 'waiver', ownerUserId: globalWaiverDeployment.ownerUserId, isClubMaster: true, isGlobal: false, deploymentId: globalWaiverDeployment.deploymentId, sourceGlobalDocumentId: scopedId('qa-school-global-waiver-v2'), waiverAudience: 'participant', assignedTo: ['all'], createdAt: timestamp(FIXED_NOW) },
    });
  });
  addDocument('compliance', {
    alias: 'qa-registration-form-a',
    path: `leagues/${scopedId('qa-league-a')}/forms/${scopedId('qa-registration-form-a')}`,
    data: { title: `${visibleMarker('LEAGUE-ORANGE-A')} Registration`, status: 'published', fields: [{ id: 'jersey', type: 'text', required: true }] },
  });
  addDocument('compliance', {
    alias: 'qa-registration-form-b',
    path: `leagues/${scopedId('qa-league-b')}/forms/${scopedId('qa-registration-form-b')}`,
    data: { title: `${visibleMarker('LEAGUE-TEAL-B')} Registration`, status: 'draft', fields: [{ id: 'division', type: 'select', required: true }] },
  });

  for (const organization of organizations) {
    addDocument('organization', {
      alias: organization.alias,
      path: `organizations/${organization.id}`,
      data: { ...organization, squadIds: organization.squadAliases.map(teamIdFor) },
    });
  }
  for (const league of leagues) {
    addDocument('competition', {
      alias: league.alias,
      path: `leagues/${league.id}`,
      data: { ...league, teamIds: league.teamAliases.map(teamIdFor), createdAt: timestamp(FIXED_NOW) },
    });
    for (const divisionAlias of league.divisionAliases) {
      addDocument('competition', {
        alias: divisionAlias,
        path: `leagues/${league.id}/divisions/${scopedId(divisionAlias)}`,
        data: { id: scopedId(divisionAlias), name: `${league.visibleMarker} ${divisionAlias.split('-').at(-1)}`, status: 'active' },
      });
    }
  }
  for (const [leagueAlias, userAlias, status] of [
    ['qa-league-a', 'qa-league-owner-a', 'active'],
    ['qa-league-a', 'qa-multi-org', 'active'],
    ['qa-league-a', 'qa-removed-member', 'revoked'],
    ['qa-league-b', 'qa-league-owner-b', 'active'],
    ['qa-disposable-league', 'qa-owner-delete-blocked', 'active'],
  ]) {
    const leagueId = scopedId(leagueAlias);
    const userId = uidFor(userAlias);
    const membership = { leagueId, userId, status, joinedAt: timestamp('2026-08-01T12:00:00.000Z') };
    addDocument('competition', {
      alias: `${userAlias}-${leagueAlias}-user-membership`,
      path: `users/${userId}/leagueMemberships/${leagueId}`,
      data: membership,
    });
    addDocument('competition', {
      alias: `${leagueAlias}-${userAlias}-member`,
      path: `leagues/${leagueId}/members/${userId}`,
      data: membership,
    });
  }
  for (const tournament of tournaments) {
    const entrantAliases = tournament.alias === 'qa-tournament-a'
      ? ['qa-team-a', 'qa-team-b', 'qa-team-c', 'qa-pro-team']
      : ['qa-team-b', 'qa-team-c', 'qa-pro-team', 'qa-elite-squad-1'];
    const entrants = entrantAliases.map(alias => {
      const team = teams.find(value => value.alias === alias);
      return { id: team.id, name: team.name, teamName: team.name };
    });
    const semiFinalA = 'wb_r0_m0_1';
    const semiFinalB = 'wb_r0_m1_2';
    const finalId = 'wb_r1_m0_3';
    const facilityAlias = tournament.alias === 'qa-tournament-a' ? 'qa-facility-a' : 'qa-facility-b';
    const facilityMarker = tournament.alias === 'qa-tournament-a'
      ? visibleMarker('FALCON-A')
      : visibleMarker('BLUEBIRD-B');
    const facilityId = scopedId(facilityAlias);
    const fieldName = `${facilityMarker} Main Field`;
    const resourceId = `${facilityId}:${fieldName}`;
    const location = `${facilityMarker} Facility - ${fieldName}`;
    const tournamentGames = [
      {
        id: semiFinalA,
        team1: entrants[0].name,
        team2: entrants[3].name,
        team1Id: entrants[0].id,
        team2Id: entrants[3].id,
        score1: 2,
        score2: 1,
        date: '2026-10-18',
        time: '9:00 AM',
        location,
        resourceId,
        round: 'Semi-Finals',
        stage: 'Main',
        winnerTo: finalId,
        winnerToSlot: 'team1',
        isCompleted: true,
        isConditional: false,
        updatedAt: FIXED_NOW,
      },
      {
        id: semiFinalB,
        team1: entrants[1].name,
        team2: entrants[2].name,
        team1Id: entrants[1].id,
        team2Id: entrants[2].id,
        score1: 0,
        score2: 0,
        date: '2026-10-18',
        time: '10:15 AM',
        location,
        resourceId,
        round: 'Semi-Finals',
        stage: 'Main',
        winnerTo: finalId,
        winnerToSlot: 'team2',
        isCompleted: false,
        isConditional: false,
        updatedAt: FIXED_NOW,
      },
      {
        id: finalId,
        team1: 'TBD',
        team2: 'TBD',
        team1Id: 'tbd',
        team2Id: 'tbd',
        score1: 0,
        score2: 0,
        date: '2026-10-18',
        time: '12:00 PM',
        location,
        resourceId,
        round: 'Championship',
        stage: 'Main',
        isCompleted: false,
        isConditional: false,
        updatedAt: FIXED_NOW,
      },
    ];
    addDocument('competition', {
      alias: tournament.alias,
      path: `teams/${teamIdFor(tournament.teamAlias)}/events/${tournament.id}`,
      data: {
        ...tournament,
        teamId: teamIdFor(tournament.teamAlias),
        title: tournament.name,
        type: 'tournament',
        eventType: 'tournament',
        isTournament: true,
        isArchived: tournament.alias === 'qa-tournament-b',
        date: '2026-10-18',
        endDate: '2026-10-18',
        startTime: '09:00',
        endTime: '14:00',
        location,
        manualVenue: '',
        tournamentType: 'single_elimination',
        tournamentTeams: entrants.map(entrant => entrant.name),
        tournamentTeamsData: entrants,
        selectedFields: [resourceId],
        gameLength: 60,
        breakLength: 15,
        maxDailyGamesPerTeam: 3,
        tournamentGames,
        setupStatus: 'complete',
        bracketStatus: 'ready',
        scheduleStatus: 'ready',
        createdAt: timestamp(FIXED_NOW),
      },
    });
  }
  addDocument('competition', {
    alias: 'qa-game-active-a',
    path: `teams/${teamIdFor('qa-team-a')}/games/${scopedId('qa-game-active-a')}`,
    data: { date: '2026-10-15T18:00:00.000Z', status: 'active', homeScore: 2, awayScore: 1, title: `${visibleMarker('FALCON-A')} Active Game` },
  });
  addDocument('competition', {
    alias: 'qa-game-completed-a',
    path: `teams/${teamIdFor('qa-team-a')}/games/${scopedId('qa-game-completed-a')}`,
    data: { date: '2026-10-16T18:00:00.000Z', status: 'completed', homeScore: 4, awayScore: 3, downstreamGameId: scopedId('qa-game-final-a'), title: `${visibleMarker('FALCON-A')} Completed Game` },
  });
  addDocument('competition', {
    alias: 'qa-game-final-a',
    path: `teams/${teamIdFor('qa-team-a')}/games/${scopedId('qa-game-final-a')}`,
    data: { date: '2026-10-18T18:00:00.000Z', status: 'scheduled', homeScore: 0, awayScore: 0, upstreamGameId: scopedId('qa-game-completed-a'), title: `${visibleMarker('FALCON-A')} Final Game` },
  });
  addDocument('competition', {
    alias: 'qa-game-cancelled-b',
    path: `teams/${teamIdFor('qa-team-b')}/games/${scopedId('qa-game-cancelled-b')}`,
    data: { date: '2026-10-17T18:00:00.000Z', status: 'cancelled', homeScore: 0, awayScore: 0, title: `${visibleMarker('BLUEBIRD-B')} Cancelled Game` },
  });

  const facilityDefinitions = [
    ['qa-facility-a', 'qa-coach-owner-a', 'qa-team-a', visibleMarker('FALCON-A'), '100 Synthetic Red Way'],
    ['qa-facility-b', 'qa-coach-owner-b', 'qa-team-b', visibleMarker('BLUEBIRD-B'), '200 Synthetic Blue Way'],
    ['qa-facility-school', 'qa-school-owner', 'qa-school-squad-1', visibleMarker('SCHOOL-GREEN'), '300 Synthetic School Way'],
  ];
  for (const [alias, ownerAlias, teamAlias, marker, address] of facilityDefinitions) {
    const facilityId = scopedId(alias);
    const fieldId = scopedId(`${alias}-field`);
    const resourceId = `${facilityId}:${marker} Main Field`;
    const overlappingTeamAlias = teamAlias === 'qa-team-a' ? 'qa-team-b' : 'qa-team-a';
    addDocument('facility', {
      alias,
      path: `facilities/${facilityId}`,
      data: { id: facilityId, name: `${marker} Facility`, address, clubId: uidFor(ownerAlias), teamId: teamIdFor(teamAlias), isDemo: true },
    });
    addDocument('facility', {
      alias: `${alias}-field`,
      path: `facilities/${facilityId}/fields/${fieldId}`,
      data: { id: fieldId, facilityId, name: `${marker} Main Field`, isDemo: true },
    });
    addDocument('facility', {
      alias: `${alias}-booking-primary`,
      path: `scheduleBookings/${scopedId(`${alias}-booking-primary`)}`,
      data: {
        sourceType: 'team-event',
        sourceId: `fixture:${runId}:${alias}:primary`,
        resourceId,
        teamIds: [teamIdFor(teamAlias)],
        date: '2026-10-15',
        startMinute: 1080,
        endMinute: 1170,
        startTime: '18:00',
        durationMinutes: 90,
        status: 'confirmed',
      },
    });
    addDocument('facility', {
      alias: `${alias}-booking-overlap`,
      path: `scheduleBookings/${scopedId(`${alias}-booking-overlap`)}`,
      data: {
        sourceType: 'fixture-conflict',
        sourceId: `fixture:${runId}:${alias}:overlap`,
        resourceId,
        teamIds: [teamIdFor(overlappingTeamAlias)],
        date: '2026-10-15',
        startMinute: 1110,
        endMinute: 1200,
        startTime: '18:30',
        durationMinutes: 90,
        status: 'conflict-candidate',
      },
    });
  }
  for (const [teamAlias, marker, quantity] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 5],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 3],
    ['qa-school-squad-1', visibleMarker('SCHOOL-GREEN'), 12],
  ]) {
    addDocument('equipment', {
      alias: `${teamAlias}-equipment`,
      path: `teams/${teamIdFor(teamAlias)}/equipment/${scopedId(`${teamAlias}-equipment`)}`,
      data: { name: `${marker} Training Bib`, quantity, available: quantity - 1, status: 'active' },
    });
    addDocument('equipment', {
      alias: `${teamAlias}-equipment-assignment`,
      path: `teams/${teamIdFor(teamAlias)}/equipmentAssignments/${scopedId(`${teamAlias}-equipment-assignment`)}`,
      data: { equipmentId: scopedId(`${teamAlias}-equipment`), assigneeId: uidFor(teamAlias === 'qa-team-b' ? 'qa-adult-player-b' : 'qa-adult-player-a'), quantity: 1, status: 'assigned' },
    });
  }

  addDocument('public', {
    alias: 'qa-contact-submission',
    path: `publicSubmissions/${scopedId('qa-contact-submission')}`,
    data: { kind: 'contact', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+contact.${runSuffix}@phase2.test`, phone: '+15550100001', message: `${visibleMarker('PUBLIC-CONTACT')} synthetic inquiry`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-beta-submission',
    path: `publicSubmissions/${scopedId('qa-beta-submission')}`,
    data: { kind: 'beta', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+beta.${runSuffix}@phase2.test`, phone: '+15550100002', message: `${visibleMarker('PUBLIC-BETA')} synthetic request`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-coach-referral',
    path: `publicSubmissions/${scopedId('qa-coach-referral')}`,
    data: { kind: 'coach-referral', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+referral.${runSuffix}@phase2.test`, phone: '+15550100003', message: `${visibleMarker('PUBLIC-REFERRAL')} synthetic referral`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-event-registration',
    path: `publicRegistrations/${scopedId('qa-event-registration')}`,
    data: { kind: 'event-registration', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+registration.${runSuffix}@phase2.test`, phone: '+15550100004', teamId: teamIdFor('qa-team-a'), status: 'accepted', idempotencyKey: `${runId}:event-registration` },
  });
  addDocument('public', {
    alias: 'qa-volunteer-opportunity-a',
    path: `teams/${teamIdFor('qa-team-a')}/volunteers/${scopedId('qa-volunteer-opportunity-a')}`,
    data: {
      title: `${visibleMarker('FALCON-A')} Gate Duty`,
      description: 'Synthetic public volunteer opportunity',
      date: '2027-01-15',
      endDate: '2027-01-15T23:59:59.000Z',
      startTime: '17:00',
      location: 'FALCON-A Main Gate',
      status: 'published',
      isShareable: true,
      spots: 2,
      hoursPerSlot: 2,
      signups: {
        [scopedId('qa-volunteer-submission-a')]: {
          userId: `public_${scopedId('qa-volunteer-submission-a')}`,
          userName: 'Synthetic Volunteer',
          name: 'Synthetic Volunteer',
          email: `qa-public-submitter+volunteer.${runSuffix}@phase2.test`,
          phone: '+15550100005',
          relationship: 'friend',
          isConfirmed: false,
          status: 'pending',
          source: 'public_portal',
          createdAt: FIXED_NOW,
        },
      },
    },
  });
  addDocument('public', {
    alias: 'qa-volunteer-opportunity-b',
    path: `teams/${teamIdFor('qa-team-b')}/volunteers/${scopedId('qa-volunteer-opportunity-b')}`,
    data: {
      title: `${visibleMarker('BLUEBIRD-B')} Field Duty`,
      description: 'Synthetic private volunteer opportunity',
      date: '2027-01-16',
      startTime: '17:00',
      location: 'BLUEBIRD-B Field',
      status: 'draft',
      isShareable: false,
      spots: 3,
      hoursPerSlot: 2,
      signups: {},
    },
  });
  addDocument('public', {
    alias: 'qa-volunteer-submission-a',
    path: `publicSubmissions/${scopedId('qa-volunteer-submission-a')}`,
    data: { kind: 'volunteer', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+volunteer.${runSuffix}@phase2.test`, phone: '+15550100005', status: 'pending', idempotencyKey: `${runId}:volunteer` },
  });
  addDocument('public', {
    alias: 'qa-donation-a',
    path: `teams/${teamIdFor('qa-team-a')}/fundraising/${scopedId('qa-fundraiser-a')}/donations/${scopedId('qa-donation-a')}`,
    data: {
      kind: 'donation',
      submitterAlias: 'qa-public-submitter',
      donorName: 'Synthetic Donor',
      donorEmail: `qa-public-submitter+donation.${runSuffix}@phase2.test`,
      donorPhone: '+15550100006',
      email: `qa-public-submitter+donation.${runSuffix}@phase2.test`,
      phone: '+15550100006',
      relationship: 'friend',
      amount: 25,
      method: 'external',
      currency: 'cad',
      status: 'pending',
      source: 'public_portal',
      livemode: false,
      idempotencyKey: `${runId}:donation`,
      createdAt: FIXED_NOW,
    },
  });

  for (const subscription of subscriptions) {
    addDocument('billing', {
      alias: subscription.alias,
      path: `fixtureBillingStates/${subscription.id}`,
      data: { ...subscription },
    });
  }
  addDocument('billing', {
    alias: 'qa-fundraiser-a',
    path: `teams/${teamIdFor('qa-team-a')}/fundraising/${scopedId('qa-fundraiser-a')}`,
    data: {
      title: `${visibleMarker('FALCON-A')} Travel Fund`,
      description: 'Synthetic public fundraiser',
      goalAmount: 1000,
      currentAmount: 25,
      deadline: '2027-02-01T23:59:59.000Z',
      isShareable: true,
      status: 'published',
      externalLink: '',
      eTransferDetails: 'Synthetic test instructions',
      livemode: false,
    },
  });
  addDocument('billing', {
    alias: 'qa-fundraiser-b',
    path: `teams/${teamIdFor('qa-team-b')}/fundraising/${scopedId('qa-fundraiser-b')}`,
    data: {
      title: `${visibleMarker('BLUEBIRD-B')} Equipment Fund`,
      description: 'Synthetic private fundraiser',
      goalAmount: 750,
      currentAmount: 0,
      deadline: '2027-02-02T23:59:59.000Z',
      isShareable: false,
      status: 'draft',
      externalLink: '',
      eTransferDetails: '',
      livemode: false,
    },
  });
  addDocument('billing', {
    alias: 'qa-connect-account-selector',
    path: `fixtureProviderStates/${scopedId('qa-connect-account-selector')}`,
    data: { provider: 'stripe-connect', mode: 'test', livemode: false, accountSelector: `metadata.fixture_run_id=${runId}`, status: 'requires-onboarding' },
  });

  const alertAudienceDefinitions = [
    ['qa-alert', 'Everyone', 'everyone', '2026-09-04T18:00:00.000Z'],
    ['qa-player-alert', 'Player', 'players', '2026-09-04T18:01:00.000Z'],
    ['qa-coach-alert', 'Coach', 'coaches', '2026-09-04T18:02:00.000Z'],
    ['qa-parent-alert', 'Parent', 'parents', '2026-09-04T18:03:00.000Z'],
  ];
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
  ]) {
    for (const [alias, label, audience, createdAt] of alertAudienceDefinitions) {
      if (teamAlias === 'qa-team-b' && alias !== 'qa-alert') continue;
      addDocument('chat', {
        alias: `${teamAlias}-${alias}`,
        path: `teams/${teamIdFor(teamAlias)}/alerts/${alias}`,
        data: {
          id: alias,
          title: `${marker} ${label} Alert`,
          message: `${marker} synthetic ${audience} message`,
          audience,
          createdBy: uidFor(ownerAlias),
          createdAt: timestamp(createdAt),
        },
      });
    }
  }

  for (const race of raceFixtures) {
    addDocument('organization', {
      alias: race.alias,
      path: `fixtureRaceBarriers/${race.id}`,
      data: { ...race, arrivals: [], released: false },
    });
  }

  const recursiveRoots = unique([
    ...firestoreDocuments.map(document => document.path.split('/').slice(0, 2).join('/')),
    `auditFixtureMetadata/${runId}`,
  ]).sort();
  const authUids = identities
    .filter(identity => identity.accountKind === 'registered')
    .map(identity => identity.uid);
  const storageObjectPaths = storageObjects.map(object => object.path).sort();

  const providers = {
    firebase: {
      environment: 'emulator',
      allowedProjectPrefix: 'demo-',
      requireLoopback: true,
    },
    stripe: {
      mode: 'test',
      livemode: false,
      objectSelector: `metadata.fixture_run_id=${runId}`,
      prices: ['team', 'elite', 'league', 'school'].flatMap(planId => (
        ['month', 'year'].map(interval => ({
          alias: `qa-price-${planId}-${interval}`,
          planId,
          interval,
          livemode: false,
          objectSelector: `metadata.fixture_run_id=${runId};metadata.plan_id=${planId};metadata.interval=${interval}`,
        }))
      )),
      allowedOperations: ['test-clock', 'test-customer', 'test-subscription', 'test-payment-intent'],
      forbiddenOperations: ['live-charge', 'payout', 'transfer', 'refund', 'dispute'],
    },
    stripeConnect: {
      mode: 'test',
      livemode: false,
      objectSelector: `metadata.fixture_run_id=${runId}`,
      payoutsEnabled: false,
      transfersEnabled: false,
    },
    resend: {
      mode: 'safe-sink',
      recipientDomain: 'phase2.test',
      retainActionLinks: false,
      retainRawPayloads: false,
    },
    fcm: {
      mode: 'synthetic',
      tokenSelector: `fixtureRunId=${runId}`,
      physicalEvidenceRequired: true,
    },
    rss: {
      mode: 'controlled',
      cases: ['valid', 'malformed', 'duplicate', 'slow', 'redirect', 'unsafe-host'],
      privateNetworkAllowed: false,
    },
    calendar: {
      mode: 'disposable',
      tokenRetention: false,
    },
  };

  const cleanupSelectors = {
    fixtureRunId: runId,
    owner: 'fixture-batch',
    firestore: {
      recursiveRoots,
      metadata: { field: 'fixtureRunId', equals: runId },
    },
    auth: { uids: authUids },
    storage: { objectPaths: storageObjectPaths },
    stripe: { metadata: { fixture_run_id: runId, livemode: 'false' } },
    stripeConnect: { metadata: { fixture_run_id: runId, livemode: 'false' } },
    resend: { tag: `fixture-run-id:${runId}`, retainActionLinks: false },
    fcm: { field: 'fixtureRunId', equals: runId },
  };

  const activeAliases = identities
    .filter(identity => identity.accountKind === 'registered' && identity.verified && !identity.disabled && identity.state !== 'pending-delete')
    .map(identity => identity.alias);
  const blockedAliases = [
    { alias: 'qa-unverified', signInStatus: 200, sessionStatus: 403, reason: 'verification-required', browserPath: '/verify-email', browserTitle: 'Verify Your Email' },
    { alias: 'qa-suspended', signInStatus: 400, authError: 'USER_DISABLED', reason: 'account-suspended', browserPath: '/login', browserTitle: 'Login Failed' },
    { alias: 'qa-pending-delete', signInStatus: 200, sessionStatus: 403, reason: 'deletion-pending', browserPath: '/login', browserTitle: 'Session Setup Failed' },
  ];
  const creationActors = ['qa-fresh-coach', 'qa-fresh-admin', 'qa-fresh-league-creator']
    .map(alias => identityByAlias.get(alias));
  const dynamicCleanupContract = {
    registrationRequiredBeforeWrite: true,
    resourceKinds: ['firestore', 'auth', 'storage', 'browser'],
    destructiveBaselineAliases: ['qa-team-a', 'qa-team-b', 'qa-team-c', 'qa-disposable-team'],
    evidenceShape: ['kind', 'alias', 'count', 'state'],
  };

  return deepFreeze({
    runSuffix,
    runId,
    generatedAt: FIXED_NOW,
    scenarioIds: CERTIFICATION_SCENARIOS.map(scenario => scenario.id),
    identities,
    activeAliases,
    blockedAliases,
    teams,
    organizations,
    households,
    leagues,
    tournaments,
    subscriptions,
    files,
    storageObjects,
    timeFixtures,
    raceFixtures,
    creationActors,
    rosterVariants,
    youthInvite,
    globalWaiverDeployment,
    dynamicCleanupContract,
    fixtures,
    providers,
    firestoreDocuments,
    cleanupSelectors,
  });
}
