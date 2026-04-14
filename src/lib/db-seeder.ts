'use client';

import { 
  Firestore, 
  doc, 
  writeBatch,
  collection,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { generateTournamentSchedule } from '@/lib/scheduler-utils';
import { format, parseISO } from 'date-fns';

/**
 * Sanitizes objects for Firestore by removing undefined values recursively.
 */
const clean = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(v => clean(v));
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = clean(val);
      }
    });
    return newObj;
  }
  return obj ?? null;
};

/**
 * STATIC BLUEPRINTS
 * Using fixed content for stable resets.
 */
const GET_DEMO_DATA = (teamId: string, userId: string, teamSuffix: string = '', teamName: string = '') => {
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();
  
  const yesterday = day(-1);
  const weekAgo = day(-7);
  const tomorrow = day(1);
  const later = day(2);
  const day3 = day(3);
  const day4 = day(4);

  return {
    members: [
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, playerId: `p_u1_${teamId}`, name: `Jordan Smith`, role: 'Admin', position: 'Assistant Coach', jersey: 'HQ', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 0, email: 'j.smith@thesquad.pro', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=jordan` },
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, playerId: `p_u2_${teamId}`, name: `Alex Rivera`, role: 'Member', position: 'Forward', jersey: '10', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'a.rivera@example.com', parentEmail: 'parent.rivera@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=alex`, gradYear: '2026', gpa: '3.9', school: 'Metro Academy' },
      { id: `m3_${teamId}`, userId: `u3_${teamId}`, playerId: `p_u3_${teamId}`, name: `Taylor Chen`, role: 'Member', position: 'Midfield', jersey: '22', medicalClearance: true, amountOwed: 450, feesPaid: false, totalFees: 1250, email: 't.chen@example.com', parentEmail: 'parent.chen@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=taylor`, gradYear: '2027', gpa: '3.7', school: 'Heights High' },
      { id: `m4_${teamId}`, userId: `u4_${teamId}`, playerId: `p_u4_${teamId}`, name: `Casey Morgan`, role: 'Member', position: 'Defense', jersey: '44', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'c.morgan@example.com', parentEmail: 'parent.morgan@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=casey`, gradYear: '2025', gpa: '4.0', school: 'Westside Prep' },
      { id: `m5_${teamId}`, userId: `u5_${teamId}`, playerId: `p_u5_${teamId}`, name: `Sam Wilson`, role: 'Member', position: 'Goalkeeper', jersey: '01', medicalClearance: true, amountOwed: 100, feesPaid: false, totalFees: 1250, email: 's.wilson@example.com', parentEmail: 'parent.wilson@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=sam`, gradYear: '2026', gpa: '3.5', school: 'Heights High' },
      { id: `m6_${teamId}`, userId: `u6_${teamId}`, playerId: `p_u6_${teamId}`, name: `Riley Jones`, role: 'Member', position: 'Forward', jersey: '15', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'r.jones@example.com', parentEmail: 'parent.jones@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=riley`, gradYear: '2027', gpa: '3.8', school: 'Metro Academy' },
      { id: `m7_${teamId}`, userId: `u7_${teamId}`, playerId: `p_u7_${teamId}`, name: `Morgan Lee`, role: 'Member', position: 'Defense', jersey: '12', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'm.lee@example.com', parentEmail: 'parent.lee@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=morgan`, gradYear: '2026', gpa: '3.9', school: 'Westside Prep' },
      { id: `m8_${teamId}`, userId: `u8_${teamId}`, playerId: `p_u8_${teamId}`, name: `Quinn Davis`, role: 'Member', position: 'Midfield', jersey: '08', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'q.davis@example.com', parentEmail: 'parent.davis@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=quinn`, gradYear: '2025', gpa: '4.0', school: 'Metro Academy' },
      { id: `m9_${teamId}`, userId: `u9_${teamId}`, playerId: `p_u9_${teamId}`, name: `Skyler King`, role: 'Member', position: 'Forward', jersey: '11', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 's.king@example.com', parentEmail: 'parent.king@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=skyler`, gradYear: '2027', gpa: '3.5', school: 'Heights High' },
      { id: `m10_${teamId}`, userId: `u10_${teamId}`, playerId: `p_u10_${teamId}`, name: `Avery Hall`, role: 'Member', position: 'Guard', jersey: '07', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 1250, email: 'a.hall@example.com', parentEmail: 'parent.hall@example.com', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=avery`, gradYear: '2026', gpa: '3.8', school: 'Westside Prep' }
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'City Strikers', date: day(-21), myScore: 8, opponentScore: 4, result: 'Win', location: 'Apex Performance Center – Main Arena', notes: 'Dominant performance. Scored 4 in the first half.' },
      { id: `g2_${teamId}`, opponent: 'North Hawks', date: day(-14), myScore: 11, opponentScore: 11, result: 'Tie', location: 'Memorial Stadium – Field A', notes: 'Strong first half, tied late in closing minutes.' },
      { id: `g3_${teamId}`, opponent: 'Eastside Tigers', date: day(-7), myScore: 14, opponentScore: 6, result: 'Win', location: 'Apex Performance Center – Practice Field B', notes: 'Best performance of the season.' },
      { id: `g4_${teamId}`, opponent: 'Lakewood Ravens', date: day(-4), myScore: 5, opponentScore: 9, result: 'Loss', location: 'West Complex – Court 2', notes: 'Struggled in second half. Conditioning focus needed.' },
      { id: `g5_${teamId}`, opponent: 'Summit Lions', date: day(-2), myScore: 18, opponentScore: 12, result: 'Win', location: 'Apex Performance Center – Main Arena', notes: 'Great team effort all around.' }
    ],
    events: [
      { 
        id: `tourn_${teamId}`, 
        teamId, 
        title: `${teamSuffix || 'Regional'} Championship Tournament`, 
        eventType: 'tournament', 
        isTournament: true, 
        date: tomorrow, 
        endDate: day3, 
        location: 'Premier Sports Park', 
        description: 'Elite multi-day tournament for top-tier squads.', 
        tournamentTeams: [teamName || `Team ${teamSuffix || 'A'}`, 'Thunder', 'Storm', 'Shadows', 'Lions', 'Eagles', 'Tigers', 'Bears'], 
        multiDaySchedule: [
          { day: 1, title: 'Opening Rounds', date: tomorrow },
          { day: 2, title: 'Semi-Finals', date: later },
          { day: 3, title: 'Finals Day', date: day3 }
        ],
        tournamentTeamsData: [
          { id: `tt_0`, name: teamName || `Team ${teamSuffix || 'A'}`, coach: `Coach ${teamSuffix || 'A'}`, email: 'coach.a@example.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_1`, name: 'Thunder', coach: 'Mike Thunder', email: 'mike@thunder.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_2`, name: 'Storm', coach: 'Sarah Storm', email: 'sarah@storm.com', source: 'manual', complianceStatus: 'pending' },
          { id: `tt_3`, name: 'Shadows', coach: 'Dave Shadow', email: 'dave@shadows.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_4`, name: 'Lions', coach: 'Tim Lion', email: 'tim@lions.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_5`, name: 'Eagles', coach: 'Jane Eagle', email: 'jane@eagles.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_6`, name: 'Tigers', coach: 'Leo Tiger', email: 'leo@tigers.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_7`, name: 'Bears', coach: 'Bear Brown', email: 'bear@bears.com', source: 'manual', complianceStatus: 'verified' },
        ],
        tournamentGames: generateTournamentSchedule({
          teams: [
            { id: 'tt_0', name: teamName || `Team ${teamSuffix || 'A'}` },
            { id: 'tt_1', name: 'Thunder' },
            { id: 'tt_2', name: 'Storm' },
            { id: 'tt_3', name: 'Shadows' },
            { id: 'tt_4', name: 'Lions' },
            { id: 'tt_5', name: 'Eagles' },
            { id: 'tt_6', name: 'Tigers' },
            { id: 'tt_7', name: 'Bears' }
          ],
          fields: ['Main Arena', 'Championship Field', 'Field 1'],
          startDate: tomorrow,
          endDate: day3,
          startTime: '08:00',
          endTime: '20:00',
          gameLength: 60,
          breakLength: 15,
          tournamentType: 'double_elimination'
        }).map((g, idx) => {
          // Manually complete a few early games so the bracket looks active
          if (idx === 0) return { ...g, isCompleted: true, score1: 5, score2: 2 };
          if (idx === 1) return { ...g, isCompleted: true, score1: 4, score2: 6 };
          if (idx === 2) return { ...g, isCompleted: true, score1: 8, score2: 1 };
          if (idx === 3) return { ...g, isCompleted: true, score1: 10, score2: 9 };
          return g;
        }),
        teamAgreements: {
          [teamName || `Team ${teamSuffix || 'A'}`]: { signedAt: yesterday, signatureCount: 15, captainName: 'Jordan Smith' },
          'Thunder': { signedAt: day(-2), signatureCount: 12, captainName: 'Mike Thunder' },
          'Shadows': { signedAt: day(-3), signatureCount: 14, captainName: 'Dave Shadow' },
          'Lions': { signedAt: day(-1), signatureCount: 11, captainName: 'Tim Lion' },
          'Eagles': { signedAt: yesterday, signatureCount: 16, captainName: 'Jane Eagle' }
        }
      },
      { id: `lg1_${teamId}`, teamId, title: `League Match vs Bears`, eventType: 'game', isLeagueGame: true, date: tomorrow, startTime: '06:00 PM', location: 'Memorial Field', description: 'Primary season league match.' },
      { id: `lg2_${teamId}`, teamId, title: `League Match vs Eagles`, eventType: 'game', isLeagueGame: true, date: later, startTime: '12:00 PM', location: 'City Park', description: 'Second league fixture of the week.' },
      { id: `lg3_${teamId}`, teamId, title: `Conference Playoff`, eventType: 'game', isLeagueGame: true, date: day4, startTime: '10:00 AM', location: 'State Complex', description: 'Qualifier for states.' },
      { id: `prac1_${teamId}`, teamId, title: `Team Tactical Session`, eventType: 'practice', date: later, startTime: '03:30 PM', location: 'West Fields', description: 'Drill-focused training session.' },
      { id: `prac2_${teamId}`, teamId, title: `Conditioning Lab`, eventType: 'practice', date: tomorrow, startTime: '04:00 PM', location: 'Field 4', description: 'Strength and focus drills.' },
      { id: `prac3_${teamId}`, teamId, title: `Morning Skills`, eventType: 'practice', date: day3, startTime: '07:30 AM', location: 'Main Gym', description: 'Voluntary skills session.' },
      { id: `meet_${teamId}`, teamId, title: `Strategy Review`, eventType: 'meeting', date: day(2), startTime: '07:00 PM', location: 'Clubhouse', description: 'Film study and strategy review.' }
    ],
    eventBrackets: [
      {
        eventId: `tourn_${teamId}`,
        brackets: [
          { id: 'b1', title: 'Championship Bracket', matchups: {
            "1": { match: 1, round: 1, team1: `${teamSuffix || 'Squad'}`, team2: 'Hawks', score1: 15, score2: 12, status: 'Completed', winner: `${teamSuffix || 'Squad'}` },
            "2": { match: 2, round: 1, team1: 'Tigers', team2: 'Lions', status: 'Scheduled' }
          }}
        ]
      }
    ],
    drills: [
      { id: `d1_${teamId}`, title: `Defensive Positioning Fundamentals`, description: 'Master defensive footwork, positioning, and communication. Focus on the 3-2 zone and help-side rotations for maximum defensive coverage.', videoUrl: 'https://www.youtube.com/watch?v=L3374C3OyrY', coverImageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80', additionalMedia: [{ url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', description: 'Full-court defensive positioning diagram' }, { url: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80', description: 'Player footwork breakdown' }], estimatedTime: '20 mins', createdAt: now.toISOString(), mandatoryWatch: true, mandatoryWatchThreshold: 75, watchedBy: {} },
      { id: `d2_${teamId}`, title: `Fast Break & Transition Offense`, description: 'Explosive transition mechanics from defense to offense. Practice reading the outlet pass, spacing, and finishing in 3-on-2 and 2-on-1 situations.', videoUrl: 'https://www.youtube.com/watch?v=6zeCAkoyA44', coverImageUrl: 'https://images.unsplash.com/photo-1608245449230-4ac19066d2d0?w=800&q=80', additionalMedia: [{ url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', description: 'Outlet pass mechanics' }], estimatedTime: '15 mins', createdAt: now.toISOString(), mandatoryWatch: false, mandatoryWatchThreshold: 75, watchedBy: {} }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix || 'the'} squad!`, author: { name: 'Jordan Smith' }, authorId: `u1_${teamId}`, createdAt: yesterday, likes: [userId] },
      { id: `p2_${teamId}`, type: 'user', content: `Great game last night! Highlights are up.`, author: { name: 'Alex Rivera' }, authorId: `u2_${teamId}`, createdAt: day(-2), likes: [userId] }
    ],
    documents: [
      { id: `w1_${teamId}`, teamId, title: 'Annual Liability Waiver', content: 'Standard liability waiver for the season.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 3, required: true, createdAt: now.toISOString() },
      { id: `w2_${teamId}`, teamId, title: 'Media Release Form', content: 'Release for photos/video recording.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 2, required: false, createdAt: weekAgo },
      { id: `w3_${teamId}`, teamId, title: 'Medical Clearance 2024', content: 'Physical exam verification.', type: 'waiver', isActive: true, assignedTo: ['all'], signatureCount: 5, required: true, createdAt: day(-30) }
    ],
    alerts: [
      { id: `a1_${teamId}`, title: 'Venue Change', message: 'Match moved to Court 4 due to maintenance.', audience: 'everyone', createdAt: yesterday, createdBy: userId }
    ],
    volunteers: [
      { id: `vol1_${teamId}`, title: 'Tournament Concessions', description: 'Help run the stand during the multi-day event.', date: tomorrow, startTime: '09:00', endTime: '15:00', spots: 5, hoursPerSlot: 2, pointsPerSlot: 10, signups: { [`u2_${teamId}`]: { userId: `u2_${teamId}`, userName: 'Alex Rivera', status: 'pending', createdAt: yesterday } } },
      { id: `vol2_${teamId}`, title: 'Match Day Photography', description: 'Capture high-quality action shots for the social feed.', date: later, startTime: '18:00', endTime: '20:00', spots: 2, hoursPerSlot: 2, pointsPerSlot: 25, signups: {} }
    ],
    fundraising: [
      { id: `fund1_${teamId}`, title: 'Elite Performance Kits', description: 'Raising money for professional away kits and technical gear.', goalAmount: 5000, currentAmount: 3250, deadline: day(30), finances: {
        totalCollected: 3250,
        pendingVerification: 150,
        donors: [
          { name: 'Corporate Sponsor A', amount: 1000, date: weekAgo, method: 'external' },
          { name: 'Smith Family', amount: 250, date: yesterday, method: 'etransfer' }
        ]
      } }
    ],
    equipment: [
      { id: `eq1_${teamId}`, name: 'Official Match Balls', category: 'Training Gear', totalQuantity: 30, availableQuantity: 24, status: 'Active', description: 'Institutional grade size 5 match balls. Serialized tracking.', assignments: { [`u2_${teamId}`]: { userId: `u2_${teamId}`, userName: 'Alex Rivera', quantity: 6, date: yesterday } } },
      { id: `eq2_${teamId}`, name: 'Varsity Travel Jackets', category: 'Uniforms', totalQuantity: 20, availableQuantity: 20, status: 'Active', description: 'Heavyweight weather-resistant travel kits.', assignments: {} },
      { id: `eq3_${teamId}`, name: 'Field Medical Kit Pro', category: 'Medical', totalQuantity: 2, availableQuantity: 1, status: 'Active', description: 'Fully stocked pitch-side trauma kit.', assignments: { [`u1_${teamId}`]: { userId: `u1_${teamId}`, userName: 'Jordan Smith', quantity: 1, date: now.toISOString() } } }
    ],
    incidents: [
      { id: `inc1_${teamId}`, teamId, title: 'Ankle Sprain - Grade 1', date: yesterday, time: '3:45 PM', location: 'Practice Court B', description: 'Player landed awkwardly after a contested jump. Immediate swelling noted.', emergencyServicesCalled: false, severity: 'minor', treatmentProvided: 'RICE protocol initiated. Assisted to clubhouse. Follow-up with physio required.', witnesses: 'Coach Jordan Smith, Taylor Chen', reportedBy: 'Jordan Smith', followUpRequired: true, weatherConditions: 'Indoors', equipmentInvolved: 'Ankle Brace (Active)' },
      { id: `inc2_${teamId}`, teamId, title: 'Heat Protocol Precedence', date: weekAgo, time: '11:00 AM', location: 'Field 7', description: 'Extended exposure led to early signs of heat fatigue.', emergencyServicesCalled: false, severity: 'minor', treatmentProvided: 'Mandatory hydration break and shade recovery.', reportedBy: 'Jordan Smith', actionsTaken: 'Scheduled breaks increased for remaining session.' }
    ],
    files: [
      { id: `f1_${teamId}`, name: 'Season Strategy Playbook.pdf', type: 'pdf', size: '2.4 MB', sizeBytes: 2516582, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Playbook', description: 'Full season tactical overview and formation guides.', date: now.toISOString() },
      { id: `f2_${teamId}`, name: 'Medical Clearance Forms 2024.pdf', type: 'pdf', size: '841 KB', sizeBytes: 861184, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Medical', description: 'Pre-season physicals and clearance documentation.', date: weekAgo },
      { id: `f3_${teamId}`, name: 'Tournament Bracket Analysis.pdf', type: 'pdf', size: '1.1 MB', sizeBytes: 1153434, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Scouting', description: 'Opponent breakdown and seeding probability charts.', date: day(-3) }
    ],
    signatures: [
      { docId: `w1_${teamId}`, sigs: [
        { id: `sig1_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u2_${teamId}`, userName: 'Alex Rivera', timestamp: day(-5) },
        { id: `sig2_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u4_${teamId}`, userName: 'Casey Morgan', timestamp: day(-4) },
        { id: `sig3_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u5_${teamId}`, userName: 'Sam Wilson', timestamp: day(-3) }
      ]},
      { docId: `w2_${teamId}`, sigs: [
        { id: `sig4_${teamId}`, documentId: `w2_${teamId}`, teamId, userId: `u6_${teamId}`, userName: 'Riley Jones', timestamp: day(-6) },
        { id: `sig5_${teamId}`, documentId: `w2_${teamId}`, teamId, userId: `u7_${teamId}`, userName: 'Morgan Lee', timestamp: day(-5) }
      ]}
    ],
    chats: [
      {
        id: `chat1_${teamId}`,
        name: 'Squad Main Channel',
        createdBy: userId,
        memberIds: [userId, `u1_${teamId}`, `u2_${teamId}`, `u3_${teamId}`],
        isDeleted: false,
        teamId: teamId,
        createdAt: weekAgo,
        messages: [
          { id: `msg1_${teamId}`, author: 'Jordan Smith', authorId: `u1_${teamId}`, content: 'Ready for the tourneys this weekend! Brackets are live.', type: 'text', createdAt: weekAgo },
          { id: `msg2_${teamId}`, author: 'Alex Rivera', authorId: `u2_${teamId}`, content: 'Practiced my shot all morning. See you guys there.', type: 'text', createdAt: yesterday },
          { id: `msg3_${teamId}`, author: 'Taylor Chen', authorId: `u3_${teamId}`, content: 'Can someone share the updated game plan? Coach sent it last night.', type: 'text', createdAt: yesterday },
          { id: `msg4_${teamId}`, author: 'Jordan Smith', authorId: `u1_${teamId}`, content: 'Playbook drills are mandatory watch — check the Playbook hub for the new videos!', type: 'text', createdAt: now.toISOString() }
        ]
      },
      {
        id: `chat2_${teamId}`,
        name: 'Coaching Staff',
        createdBy: userId,
        memberIds: [userId, `u1_${teamId}`],
        isDeleted: false,
        teamId: teamId,
        createdAt: weekAgo,
        messages: [
          { id: `coachmsg1_${teamId}`, author: 'Jordan Smith', authorId: `u1_${teamId}`, content: 'Reviewing film from last game. Defense was excellent.', type: 'text', createdAt: weekAgo },
          { id: `coachmsg2_${teamId}`, author: 'Guest Coach', authorId: userId, content: 'Agreed. Transition attack needs work in training this week.', type: 'text', createdAt: yesterday }
        ]
      }
    ]
  };
};

/**
 * HIGH-SPEED ATOMIC SEEDER
 * Ensures a stable, predictable reset for demo users.
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string) {
  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  const isEliteDemo = ['elite_teams', 'elite_league', 'league', 'elite'].includes(planId);
  const isSchoolDemo = planId === 'school_demo' || planId === 'school';
  const isProTier = planId !== 'starter_squad' && planId !== 'free';
  
  // Map legacy/demo plan IDs to new schema
  const planTypeMap: Record<string, string> = {
    'starter_squad': 'free',
    'squad_pro': 'team',
    'elite_teams': 'elite',
    'elite_league': 'league',
    'squad_organization': 'school',
    'school_demo': 'school',
    'free': 'free',
    'team': 'team',
    'elite': 'elite',
    'league': 'league',
    'school': 'school',
    'parent_demo': 'team',
    'player_demo': 'team'
  };

  const plan_type = planTypeMap[planId] || 'free';
  const teamLimitMap: Record<string, number> = {
    'free': 1,
    'team': 1,
    'elite': 8,
    'league': 15,
    'school': 10
  };
  const team_limit = teamLimitMap[plan_type] || 1;

  const userRole = isSchoolDemo ? 'admin' : (isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : 'coach'));
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : (isSchoolDemo ? 'Athletic Director' : 'Coach'));
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  let batch = writeBatch(db);
  const nowObj = new Date();
  const now = nowObj.toISOString();
  const tomorrow = new Date(nowObj.getTime() + 86400000).toISOString();
  const later = new Date(nowObj.getTime() + 172800000).toISOString();
  const yesterday = new Date(nowObj.getTime() - 86400000).toISOString();
  const weekAgo = new Date(nowObj.getTime() - 604800000).toISOString();

  // 1. Core Profile Reset
  batch.set(doc(db, 'users', userId), clean({
    id: userId, 
    fullName: isSchoolDemo ? 'Guest Admin' : `Guest ${pos}`, 
    email: `${userRole}@thesquad.pro`,
    role: userRole, 
    plan_type: plan_type,
    team_limit: team_limit,
    subscription_status: 'active',
    createdAt: now, 
    isDemo: true, 
    seenAlertIds: [],
    avatarUrl: `https://picsum.photos/seed/${userId}/150/150`,
    clubDescription: isEliteDemo ? 'Precision performance at a professional scale.' : (isSchoolDemo ? 'Secondary Athletic Program Command' : undefined),
    schoolAdminIds: isSchoolDemo ? [userId] : [],
    isPrimaryClubAuthority: (isProTier || isEliteDemo || isSchoolDemo) && !isPlayerDemo && !isParentDemo,
    clubName: isSchoolDemo ? 'Springfield High School' : (isEliteDemo ? 'Apex Academy' : 'Squad Sports Hub'),
    isStaff: true
  }), { merge: true });

  // 1.1 Secure Facilities Seeding (All Pro Tiers)
  if (isProTier && !isParentDemo && !isPlayerDemo) {
    const facId = `fac_main_${userId.slice(-4)}`;
    const facName = isSchoolDemo ? 'Springfield High Athletic Complex' : (isEliteDemo ? 'Apex Performance Center' : 'Home Training Center');
    const facAddress = isSchoolDemo ? '456 Education Ave, Springfield' : (isEliteDemo ? '789 Tactical Way, Metro City' : '123 Athletic Drive, Downtown');
    batch.set(doc(db, 'facilities', facId), clean({
      id: facId,
      name: facName,
      address: facAddress,
      clubId: userId,
      notes: isSchoolDemo
        ? 'Main athletic campus. Parking lot C open for event days. Contact facilities@school.edu for rentals.'
        : 'Primary training venue. Gate code: 1992#. Concessions open on game days. Coaches arrive 45 min early.',
      isDemo: true
    }));
    
    // Enroll Standard Fields/Courts
    const fieldResources = isSchoolDemo
      ? ['Main Gymnasium', 'Field House', 'Outdoor Track', 'Football Field', 'Tennis Courts']
      : ['Main Arena', 'Practice Field A', 'Practice Field B', 'Weight Room'];
    fieldResources.forEach(fn => {
      const fid = `res_${fn.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${userId.slice(-4)}`;
      batch.set(doc(db, 'facilities', facId, 'fields', fid), clean({
        id: fid,
        facilityId: facId,
        name: fn
      }));
    });

    // Second facility for elite/school demos
    if (isEliteDemo || isSchoolDemo) {
      const fac2Id = `fac_secondary_${userId.slice(-4)}`;
      batch.set(doc(db, 'facilities', fac2Id), clean({
        id: fac2Id,
        name: isSchoolDemo ? 'Memorial Sports Complex' : 'Satellite Training Annex',
        address: isSchoolDemo ? '900 Memorial Blvd, Springfield' : '456 West Campus Ave',
        clubId: userId,
        notes: 'Secondary training venue. Call ahead for equipment setup.',
        isDemo: true
      }));
      const field2Resources = isSchoolDemo
        ? ['Court A', 'Court B', 'Wrestling Room']
        : ['Turf Field 1', 'Turf Field 2'];
      field2Resources.forEach(fn => {
        const fid = `res2_${fn.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${userId.slice(-4)}`;
        batch.set(doc(db, 'facilities', fac2Id, 'fields', fid), clean({
          id: fid,
          facilityId: fac2Id,
          name: fn
        }));
      });
    }
  }

  // 1.5 Optional: Seed Plan definitions if they don't exist (to unlock features in UI)
  const plans = [
    { id: 'free', name: 'Starter', features: { live_feed_read: true, basic_scheduling: true } },
    { id: 'team', name: 'Pro', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true } },
    { id: 'elite', name: 'Elite Teams', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true, multi_team_management: true, club_management: true } },
    { id: 'league', name: 'Elite League', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true, multi_team_management: true, club_management: true, league_series_architect: true } },
    { id: 'school', name: 'Organization', isPro: true, features: { feed_post: true, tournaments_view: true, tournaments_manage: true, payments_collect: true, incidents_report: true, volunteers_manage: true, fundraising_manage: true, chats_unlimited: true, roster_unlimited: true, advanced_scheduling: true, media_library: true, multi_team_management: true, school_hub: true, facility_management: true, club_management: true } }
  ];
  plans.forEach(p => batch.set(doc(db, 'plans', p.id), clean(p), { merge: true }));

    // --- Specialized Parent Demo Data ---
    if (isParentDemo) {
        const strikerId = `demo_${planId}_${userId.slice(-4)}_strikers`;
        const lakerId = `demo_${planId}_${userId.slice(-4)}_lakers`;
        const leagueId = `demo_league_${userId.slice(-4)}`;
        const tids = [strikerId, lakerId];

        // 1. Create a Global League Document
        batch.set(doc(db, 'leagues', leagueId), clean({
            id: leagueId,
            name: 'Elite Youth League',
            description: 'The premier circuit for local talent.',
            createdBy: userId,
            creatorId: userId,
            memberTeamIds: [strikerId, lakerId, 'hawks_id', 'tigers_id', 'eagles_id'],
            isDemo: true,
            status: 'active',
            teams: {
                [strikerId]: { teamName: 'Strikers', coachName: 'Marcus Miller', coachEmail: 'm.miller@example.com', wins: 2, losses: 1, points: 6 },
                [lakerId]: { teamName: 'Lakers', coachName: 'Sarah Thompson', coachEmail: 's.thompson@example.com', wins: 3, losses: 0, points: 9 },
                ['hawks_id']: { teamName: 'Hawks', coachName: 'David Chen', coachEmail: 'd.chen@example.com', wins: 1, losses: 2, points: 3 },
                ['tigers_id']: { teamName: 'Tigers', coachName: 'James Wilson', coachEmail: 'j.wilson@example.com', wins: 0, losses: 3, points: 0 }
            },
            schedule: [
              { id: 'lg1', team1: 'Strikers', team1Id: strikerId, team2: 'Lakers', team2Id: lakerId, date: tomorrow, time: '10:00 AM', location: 'Court A', status: 'scheduled' },
              { id: 'lg2', team1: 'Strikers', team1Id: strikerId, team2: 'Hawks', team2Id: 'hawks_id', date: later, time: '12:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'lg3', team1: 'Lakers', team1Id: lakerId, team2: 'Tigers', team2Id: 'tigers_id', date: later, time: '02:00 PM', location: 'Court A', status: 'scheduled' },
              { id: 'lg4', team1: 'Strikers', team1Id: strikerId, team2: 'Eagles', team2Id: 'eagles_id', date: new Date(nowObj.getTime() + 5 * 86400000).toISOString(), time: '04:00 PM', location: 'Main Arena', status: 'scheduled' },
              { id: 'lg5', team1: 'Lakers', team1Id: lakerId, team2: 'Hawks', team2Id: 'hawks_id', date: new Date(nowObj.getTime() + 8 * 86400000).toISOString(), time: '06:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'lg6', team1: 'Strikers', team1Id: strikerId, team2: 'Tigers', team2Id: 'tigers_id', date: new Date(nowObj.getTime() + 11 * 86400000).toISOString(), time: '01:00 PM', location: 'Court A', status: 'scheduled' },
              { id: 'lg7', team1: 'Lakers', team1Id: lakerId, team2: 'Eagles', team2Id: 'eagles_id', date: new Date(nowObj.getTime() + 14 * 86400000).toISOString(), time: '03:00 PM', location: 'Main Arena', status: 'scheduled' }
            ],
            createdAt: now
        }));

        // 2. Create the Teams (Strikers & Lakers)
        const variants = [
            { id: strikerId, name: 'Strikers', logo: 'https://picsum.photos/seed/strikers/200/200' },
            { id: lakerId, name: 'Lakers', logo: 'https://picsum.photos/seed/lakers/200/200' }
        ];

        variants.forEach(v => {
            batch.set(doc(db, 'teams', v.id), clean({
                id: v.id,
                teamName: v.name,
                code: v.id.slice(-6).toUpperCase(),
                teamCode: v.id.slice(-6).toUpperCase(),
                ownerUserId: userId,
                isPro: true,
                planId: 'team',
                sport: 'Basketball',
                isDemo: true,
                type: 'youth',
                leagueId: leagueId,
                createdAt: now,
                heroImageUrl: `https://picsum.photos/seed/${v.id}hero/1200/400`,
                teamLogoUrl: v.logo
            }));

            // Parent membership
            batch.set(doc(db, 'users', userId, 'teamMemberships', v.id), clean({
                teamId: v.id, name: v.name, role: 'parent', isPro: true, planId: 'team', isDemo: true, joinedAt: now
            }));

            // Parent member record
            batch.set(doc(db, 'teams', v.id, 'members', userId), clean({
                id: userId, userId, teamId: v.id, name: 'Guest Parent', role: 'parent', position: 'Guardian', joinedAt: now, isDemo: true
            }));

            // Events for this team
            const data = GET_DEMO_DATA(v.id, userId, v.name, v.name);
            data.events.forEach(e => {
                batch.set(doc(db, 'teams', v.id, 'events', e.id), clean({ ...e, teamId: v.id }));
            });
            
            // Seed sub-resource collections
            data.volunteers.forEach(vol => batch.set(doc(db, 'teams', v.id, 'volunteers', vol.id), clean(vol)));
            data.fundraising.forEach(fund => batch.set(doc(db, 'teams', v.id, 'fundraising', fund.id), clean(fund)));
            data.equipment.forEach(eq => batch.set(doc(db, 'teams', v.id, 'equipment', eq.id), clean(eq)));
            data.incidents.forEach(inc => batch.set(doc(db, 'teams', v.id, 'incidents', inc.id), clean(inc)));
            data.games.forEach(g => batch.set(doc(db, 'teams', v.id, 'games', g.id), clean({ ...g, teamId: v.id, createdAt: now })));
            data.drills.forEach(d => batch.set(doc(db, 'teams', v.id, 'drills', d.id), clean(d)));
            data.documents.forEach(d => batch.set(doc(db, 'teams', v.id, 'documents', d.id), clean({ ...d, ownerUserId: userId, teamId: v.id })));
            data.files.forEach(f => batch.set(doc(db, 'teams', v.id, 'files', f.id), clean({ ...f, teamId: v.id })));
            data.alerts.forEach(a => batch.set(doc(db, 'teams', v.id, 'alerts', a.id), clean(a)));
            data.feed.forEach(p => batch.set(doc(db, 'teams', v.id, 'feedPosts', p.id), clean(p)));
            data.signatures.forEach(s => s.sigs.forEach(sig => batch.set(doc(db, 'teams', v.id, 'members', sig.userId, 'signatures', sig.documentId), clean(sig))));
            data.chats.forEach(c => {
              batch.set(doc(db, 'teams', v.id, 'groupChats', c.id), clean({ id: c.id, name: c.name, createdBy: c.createdBy, memberIds: c.memberIds, isDeleted: c.isDeleted, teamId: v.id, createdAt: c.createdAt }));
              c.messages.forEach(m => batch.set(doc(db, 'teams', v.id, 'groupChats', c.id, 'messages', m.id), clean(m)));
            });
        });

        // 3. Children Profiles
        const juniorId = `c1_${userId}`;
        const juniorDob = new Date(nowObj.getFullYear() - 9, 5, 15).toISOString().split('T')[0]; // 9 years old
        batch.set(doc(db, 'players', juniorId), clean({
            id: juniorId, firstName: 'Junior', lastName: 'Guest', isMinor: true, parentId: userId, userId: null,
            dateOfBirth: juniorDob,
            hasLogin: false, createdAt: now, joinedTeamIds: tids, ageGroup: 'U10', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=junior',
            sports: ['Basketball'], primaryPosition: 'Point Guard'
        }));

        const alexId = `c2_${userId}`;
        const alexDob = new Date(nowObj.getFullYear() - 16, 2, 20).toISOString().split('T')[0]; // 16 years old
        const alexEmail = `alex.guest_${userId.slice(-4)}@thesquad.pro`;
        batch.set(doc(db, 'players', alexId), clean({
            id: alexId, firstName: 'Alex', lastName: 'Guest', isMinor: true, parentId: userId, userId: alexId,
            dateOfBirth: alexDob,
            hasLogin: true, pendingInviteEmail: alexEmail, createdAt: now, joinedTeamIds: tids, ageGroup: 'U17', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=alex',
            sports: ['Basketball', 'Soccer', 'Cross Country'], primaryPosition: 'Striker'
        }));

        // Mock teen user
        batch.set(doc(db, 'users', alexId), clean({
            id: alexId, fullName: 'Alex Guest', email: alexEmail, role: 'youth_player', isDemo: true, createdAt: now
        }), { merge: true });

        // Link kids to teams as members
        tids.forEach(tid => {
            batch.set(doc(db, 'teams', tid, 'members', juniorId), clean({
                id: juniorId, teamId: tid, name: 'Junior Guest', role: 'Member', position: 'Player', joinedAt: now, isDemo: true, parentId: userId
            }));
            batch.set(doc(db, 'teams', tid, 'members', alexId), clean({
                id: alexId, teamId: tid, name: 'Alex Guest', role: 'Member', position: 'Player', joinedAt: now, isDemo: true, parentId: userId, email: alexEmail
            }));

            // Sync the league games into team events for immediate visibility
            const leagueGames = [
              { id: `lg_${leagueId}_lg1`, teamId: tid, title: `Conference Match vs ${tid === strikerId ? 'Lakers' : 'Strikers'}`, eventType: 'game', isLeagueGame: true, date: tomorrow, startTime: '10:00 AM', location: 'City Arena', description: 'National broadcast game.' },
              { id: `lg_${leagueId}_lg2`, teamId: tid, title: `Division Rival Match vs ${tid === strikerId ? 'Hawks' : 'Tigers'}`, eventType: 'game', isLeagueGame: true, date: later, startTime: tid === strikerId ? '12:00 PM' : '02:00 PM', location: tid === strikerId ? 'Field 7' : 'Field 2', description: 'Critical seeding match.' },
              { id: `lg_${leagueId}_lg3`, teamId: tid, title: `Regional Qualifier`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + 432000000).toISOString(), startTime: '03:30 PM', location: 'State Complex', description: 'Qualifier for states.' },
              { id: `lg_${leagueId}_lg4`, teamId: tid, title: `Pre-Season Scrimmage`, eventType: 'game', isLeagueGame: true, date: yesterday, startTime: '04:00 PM', location: 'Home Stadium', description: 'Early season tune-up.' },
              { id: `lg_${leagueId}_lg5`, teamId: tid, title: `Mid-Season Invitational`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + 604800000).toISOString(), startTime: '11:00 AM', location: 'Summit Center', description: 'League-wide showcase event.' }
            ];
            leagueGames.forEach(lg => {
              batch.set(doc(db, 'teams', tid, 'events', lg.id), clean(lg));
            });

            // Multi-day Tournament (3 Days)
            const tournamentId = `tourn_${tid}_demo`;
            const tournamentTeamsData = [
              { id: 'tt_0', name: 'Strikers', coach: 'Mike Strike', email: 'mike@strikers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_1', name: 'Lakers', coach: 'Jim Lake', email: 'jim@lakers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_2', name: 'Hawks', coach: 'Sarah Hawk', email: 'sarah@hawks.com', source: 'manual', complianceStatus: 'pending' },
              { id: 'tt_3', name: 'Tigers', coach: 'Leo Tiger', email: 'leo@tigers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_4', name: 'Eagles', coach: 'Jane Eagle', email: 'jane@eagles.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_5', name: 'Panthers', coach: 'Tim Panther', email: 'tim@panthers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_6', name: 'Cougars', coach: 'Chris Coug', email: 'chris@cougars.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_7', name: 'Bears', coach: 'Bear Brown', email: 'bear@bears.com', source: 'manual', complianceStatus: 'verified' }
            ];
            const tournamentGames = generateTournamentSchedule({
              teams: tournamentTeamsData,
              fields: ['Arena 1', 'Main Field'],
              startDate: tomorrow,
              endDate: day3,
              startTime: '08:00',
              endTime: '20:00',
              gameLength: 60,
              breakLength: 15,
              tournamentType: 'double_elimination'
            });

            batch.set(doc(db, 'teams', tid, 'events', tournamentId), clean({
              id: tournamentId,
              teamId: tid,
              title: tid === strikerId ? 'City Championship Tournament' : 'Lakers Spring Showcase',
              eventType: 'tournament',
              isTournament: true,
              date: tomorrow,
              endDate: day3,
              location: 'Premier Sports Park',
              description: 'The final 3-day showdown for the regional title.',
              tournamentTeams: tournamentTeamsData.map(t => t.name),
              tournamentTeamsData: tournamentTeamsData,
              tournamentGames: tournamentGames,
              teamAgreements: {
                'Strikers': { signedAt: yesterday, signatureCount: 15, captainName: 'Coach Strikers' },
                'Lakers': { signedAt: day2, signatureCount: 12, captainName: 'Coach Lakers' },
                'Hawks': { signedAt: day3, signatureCount: 14, captainName: 'Coach Hawks' },
                'Tigers': { signedAt: yesterday, signatureCount: 11, captainName: 'Coach Tigers' }
              },
              status: 'active'
            }));

            // Regular practices
            const practices = [
              { id: `prac1_${tid}`, teamId: tid, title: 'Tactical Drill Session', eventType: 'practice', date: tomorrow, startTime: '04:00 PM', location: 'Practice Court A' },
              { id: `prac2_${tid}`, teamId: tid, title: 'Conditioning & Skills', eventType: 'practice', date: later, startTime: '05:30 PM', location: 'Main Gym' }
            ];
            practices.forEach(p => batch.set(doc(db, 'teams', tid, 'events', p.id), clean(p)));
        });
        
        await batch.commit();
        return strikerId;
    }

    const teamVariants = isEliteDemo ? ['North', 'South', 'Academy'] : (isSchoolDemo ? ['Springfield High', 'Varsity', 'Junior Varsity', 'Freshman'] : ['']);
    const leagueId = `demo_league_${userId.slice(-4)}`;

    // Create a league for non-parent demos to tie everything together
    if (!isParentDemo) {
        const leagueTeams: Record<string, any> = {};
        const memberTeamIds: string[] = [];
        
        // Add the user's actual teams
        for (let i = 0; i < teamVariants.length; i++) {
            const v = teamVariants[i];
            const tId = `demo_${planId}_${userId.slice(-4)}${v ? '_' + v.toLowerCase().replace(/\s+/g, '') : ''}`;
            const tName = isSchoolDemo ? (i === 0 ? 'Springfield High School' : `Springfield ${v}`) : (v ? `Elite Squad - ${v}` : (isProTier ? 'Apex Demo Squad' : 'Grassroots Demo'));
            leagueTeams[tId] = { teamName: tName, coachName: 'Guest Coach', coachEmail: `coach_${i}@thesquad.pro`, wins: [3, 2, 1, 0][i] || 0, losses: [0, 1, 2, 3][i] || 0, points: [9, 6, 3, 0][i] || 0 };
            memberTeamIds.push(tId);
        }
        
        // Pad the league with mock opponents so it always has at least 4 teams
        const mockOpponents = ['City Wildcats', 'Metro Stars', 'Valley Vipers', 'Coastal Elite'];
        let mockIndex = 0;
        while (Object.keys(leagueTeams).length < 4) {
            const mockId = `mock_${mockIndex}_${userId.slice(-4)}`;
            leagueTeams[mockId] = { teamName: mockOpponents[mockIndex], coachName: `Coach ${mockOpponents[mockIndex]}`, coachEmail: `coach@${mockOpponents[mockIndex].toLowerCase().replace(/\s+/g, '')}.com`, wins: Math.floor(Math.random() * 3), losses: Math.floor(Math.random() * 3), points: Math.floor(Math.random() * 9) };
            memberTeamIds.push(mockId);
            mockIndex++;
        }

        const primaryTid = `demo_${planId}_${userId.slice(-4)}${teamVariants[0] ? '_' + teamVariants[0].toLowerCase().replace(/\s+/g, '') : ''}`;
        const secondTid = Object.keys(leagueTeams)[1] || primaryTid;
        
        batch.set(doc(db, 'leagues', leagueId), clean({
            id: leagueId,
            name: isSchoolDemo ? 'State Academic Athletic League' : 'Apex Premier Circuit',
            description: 'The premier circuit for top-tier competitive programs.',
            createdBy: userId,
            creatorId: userId,
            memberTeamIds,
            isDemo: true,
            status: 'active',
            createdAt: now,
            teams: leagueTeams,
            schedule: [
              { id: 'sched1', team1: Object.values(leagueTeams)[0]?.teamName || 'Team A', team1Id: primaryTid, team2: Object.values(leagueTeams)[1]?.teamName || 'Team B', team2Id: secondTid, date: tomorrow, time: '10:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched2', team1: Object.values(leagueTeams)[0]?.teamName || 'Team A', team1Id: primaryTid, team2: Object.values(leagueTeams)[1]?.teamName || 'Team B', team2Id: secondTid, date: later, time: '02:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'sched3', team1: Object.values(leagueTeams)[1]?.teamName || 'Team B', team1Id: secondTid, team2: Object.values(leagueTeams)[0]?.teamName || 'Team A', team2Id: primaryTid, date: new Date(nowObj.getTime() + 432000000).toISOString(), time: '11:00 AM', location: 'State Complex', status: 'scheduled' },
              { id: 'sched4', team1: Object.values(leagueTeams)[0]?.teamName || 'Team A', team1Id: primaryTid, team2: 'City Wildcats', team2Id: 'wildcats_id', date: new Date(nowObj.getTime() + 7 * 86400000).toISOString(), time: '09:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched5', team1: Object.values(leagueTeams)[1]?.teamName || 'Team B', team1Id: secondTid, team2: 'Metro Stars', team2Id: 'stars_id', date: new Date(nowObj.getTime() + 9 * 86400000).toISOString(), time: '05:00 PM', location: 'Court C', status: 'scheduled' },
              { id: 'sched6', team1: Object.values(leagueTeams)[0]?.teamName || 'Team A', team1Id: primaryTid, team2: 'Metro Stars', team2Id: 'stars_id', date: new Date(nowObj.getTime() + 12 * 86400000).toISOString(), time: '01:00 PM', location: 'State Complex', status: 'scheduled' },
              { id: 'sched7', team1: Object.values(leagueTeams)[1]?.teamName || 'Team B', team1Id: secondTid, team2: 'City Wildcats', team2Id: 'wildcats_id', date: new Date(nowObj.getTime() + 14 * 86400000).toISOString(), time: '03:30 PM', location: 'Main Arena', status: 'scheduled' }
            ]
        }));
    }

    for (let i = 0; i < teamVariants.length; i++) {
        const variant = teamVariants[i];
        const isPrimary = i === 0;
        let teamId = isPrimary && !variant ? `demo_${planId}_${userId.slice(-4)}` : `demo_${planId}_${userId.slice(-4)}_${(variant || 'main').toLowerCase().replace(/\s+/g, '')}`;
        let name = isSchoolDemo ? (isPrimary ? 'Springfield High School' : `Springfield ${variant}`) : (variant ? `Elite Squad - ${variant}` : (isProTier ? 'Apex Demo Squad' : 'Grassroots Demo'));
        let teamType = isSchoolDemo ? (isPrimary ? 'school' : 'school_squad') : 'youth';
        let schoolId = isSchoolDemo ? (isPrimary ? teamId : `demo_${planId}_${userId.slice(-4)}_springfieldhigh`) : undefined;

        batch.set(doc(db, 'teams', teamId), clean({ 
            id: teamId, teamName: name, code: teamId.slice(-6).toUpperCase(), teamCode: teamId.slice(-6).toUpperCase(),
            ownerUserId: userId, isPro: isProTier || isSchoolDemo, planId: plan_type, sport: isSchoolDemo ? 'Basketball' : 'Multi-Sport', 
            isDemo: true, type: teamType, schoolId, leagueId: !isParentDemo ? leagueId : undefined,
            createdAt: now, heroImageUrl: `https://picsum.photos/seed/${teamId}hero/1200/400`,
            teamLogoUrl: `https://picsum.photos/seed/${teamId}logo/200/200`
        }));

        batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
            teamId, name, role, isPro: isProTier || isSchoolDemo, planId: plan_type, isDemo: true, joinedAt: now, ownerUserId: userId, type: teamType, schoolId
        }));

        batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
            id: userId, userId, teamId, playerId: `p_${userId}_${teamId}`, 
            name: isSchoolDemo ? 'Guest Admin' : `Guest ${pos}`, role, position: pos, jersey: 'H',
            joinedAt: now, isDemo: true, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
            ownerUserId: userId, email: `${userRole}@thesquad.pro`
        }));

        const data = GET_DEMO_DATA(teamId, userId, variant, name);
        
        // Seed Roster Members & Player Profiles
        data.members.forEach(m => {
            batch.set(doc(db, 'teams', teamId, 'members', m.id), clean({ ...m, teamId, joinedAt: now, isDemo: true }));
            
            // For youth teams, seed the actual Player Profile for "verified" feeling
            if (teamType === 'youth' || teamType === 'school_squad') {
                batch.set(doc(db, 'players', m.playerId), clean({
                    id: m.playerId,
                    firstName: m.name.split(' ')[0],
                    lastName: m.name.split(' ')[1] || 'Guest',
                    isMinor: true,
                    dateOfBirth: new Date(nowObj.getFullYear() - 15, 0, 1).toISOString().split('T')[0],
                    hasLogin: false,
                    createdAt: now,
                    joinedTeamIds: [teamId],
                    avatar: m.avatar,
                    school: m.school,
                    gradYear: m.gradYear,
                    gpa: m.gpa,
                    primaryPosition: m.position,
                    sports: [isSchoolDemo ? 'Basketball' : 'Multi-Sport']
                }));

                // Add recruiting content to one of the main players to showcase recruiting portal
                if (m.name === 'Alex Rivera') {
                    batch.set(doc(db, 'players', m.playerId, 'videos', `vid_${m.id}`), {
                        id: `vid_${m.id}`,
                        title: 'Championship Winning Goal',
                        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                        thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
                        type: 'Highlight',
                        createdAt: yesterday,
                        isPublic: true
                    });
                }
            }
        });

        data.events.forEach(e => batch.set(doc(db, 'teams', teamId, 'events', e.id), clean({ ...e, teamId })));
        data.eventBrackets.forEach(eb => {
            eb.brackets.forEach(b => batch.set(doc(db, 'teams', teamId, 'events', eb.eventId, 'brackets', b.id), clean(b)));
        });
        data.drills.forEach(d => batch.set(doc(db, 'teams', teamId, 'drills', d.id), clean(d)));
        data.feed.forEach(p => batch.set(doc(db, 'teams', teamId, 'feedPosts', p.id), clean(p)));
        data.documents.forEach(d => batch.set(doc(db, 'teams', teamId, 'documents', d.id), clean({ ...d, ownerUserId: userId })));
        data.alerts.forEach(a => batch.set(doc(db, 'teams', teamId, 'alerts', a.id), clean(a)));
        data.volunteers.forEach(v => batch.set(doc(db, 'teams', teamId, 'volunteers', v.id), clean(v)));
        data.fundraising.forEach(f => batch.set(doc(db, 'teams', teamId, 'fundraising', f.id), clean(f)));
        data.equipment.forEach(eq => batch.set(doc(db, 'teams', teamId, 'equipment', eq.id), clean(eq)));
        data.incidents.forEach(inc => batch.set(doc(db, 'teams', teamId, 'incidents', inc.id), clean(inc)));
        // Seed game results for Scorekeeping page
        data.games.forEach(g => batch.set(doc(db, 'teams', teamId, 'games', g.id), clean({ ...g, teamId, createdAt: now })));
        // Seed files for Library
        data.files.forEach(f => batch.set(doc(db, 'teams', teamId, 'files', f.id), clean({ ...f, teamId })));
        // Seed document signatures for Coaches Corner / Files
        data.signatures.forEach(s => s.sigs.forEach(sig => batch.set(doc(db, 'teams', teamId, 'members', sig.userId, 'signatures', sig.documentId), clean(sig))));
        data.chats.forEach(c => {
            batch.set(doc(db, 'teams', teamId, 'groupChats', c.id), clean({ id: c.id, name: c.name, createdBy: c.createdBy, memberIds: c.memberIds, isDeleted: c.isDeleted, teamId: c.teamId, createdAt: c.createdAt }));
            c.messages.forEach(m => batch.set(doc(db, 'teams', teamId, 'groupChats', c.id, 'messages', m.id), clean(m)));
        });

        // Avoid batch limit for large organization demos
        if (i > 0 && i % 2 === 0) {
            await batch.commit();
            batch = writeBatch(db);
        }
    }

    await batch.commit();
    return `demo_${planId}_${userId.slice(-4)}`;
}