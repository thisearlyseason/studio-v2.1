import type { Resource, ResourceType, Difficulty } from './sports-hub-resources';

type ResourceSeed = { id: string; title: string; description: string; type: ResourceType; sport: string; difficulty: Difficulty; tags: string[] };

const generalSeeds: ResourceSeed[] = [
  { id: 'expanded-season-kickoff-plan', title: 'Season Kickoff Operations Plan', description: 'A first-week checklist for rosters, staff, facilities, communication, and family orientation.', type: 'season-planner', sport: 'General', difficulty: 'beginner', tags: ['season kickoff', 'operations', 'planning'] },
  { id: 'expanded-weekly-practice-grid', title: 'Weekly Practice Grid Template', description: 'Map objectives, groups, equipment, transitions, and recovery across a complete training week.', type: 'practice-template', sport: 'General', difficulty: 'beginner', tags: ['practice', 'weekly planning', 'template'] },
  { id: 'expanded-game-day-command-sheet', title: 'Game-Day Command Sheet', description: 'Keep contacts, roles, arrival times, equipment, safety notes, and escalation steps together.', type: 'game-day-checklist', sport: 'General', difficulty: 'beginner', tags: ['game day', 'roles', 'checklist'] },
  { id: 'expanded-parent-welcome-pack', title: 'Parent Welcome Pack Outline', description: 'A ready structure for expectations, contacts, fees, travel, safety, and communication preferences.', type: 'parent-communication', sport: 'General', difficulty: 'beginner', tags: ['parents', 'welcome', 'communication'] },
  { id: 'expanded-volunteer-shift-planner', title: 'Volunteer Shift Planner', description: 'Assign bounded volunteer roles with shift windows, backups, handoffs, and contact details.', type: 'volunteer-guide', sport: 'General', difficulty: 'beginner', tags: ['volunteers', 'shifts', 'roles'] },
  { id: 'expanded-emergency-contact-card', title: 'Emergency Contact Card Template', description: 'Organize facility addresses, emergency numbers, first-aid roles, and incident documentation prompts.', type: 'emergency-action-plan', sport: 'General', difficulty: 'intermediate', tags: ['emergency', 'first aid', 'contacts'] },
  { id: 'expanded-team-fundraising-calendar', title: 'Team Fundraising Calendar', description: 'Plan ethical fundraising activities, owners, deadlines, communication, and reconciliation.', type: 'fundraising-ideas', sport: 'General', difficulty: 'intermediate', tags: ['fundraising', 'budget', 'calendar'] },
  { id: 'expanded-equipment-checkout-log', title: 'Equipment Checkout and Return Log', description: 'Track shared gear, condition, assigned athlete or coach, storage location, and return date.', type: 'equipment-list', sport: 'General', difficulty: 'beginner', tags: ['equipment', 'inventory', 'checkout'] },
  { id: 'expanded-away-game-travel-pack', title: 'Away Game Travel Pack', description: 'Prepare transportation, permissions, contacts, documents, medication, and arrival details.', type: 'travel-checklist', sport: 'General', difficulty: 'intermediate', tags: ['travel', 'away game', 'safety'] },
  { id: 'expanded-coach-huddle-agenda', title: 'Coach Huddle Agenda', description: 'A 15-minute agenda for staffing, athlete notes, practice objectives, and safety updates.', type: 'coach-meeting-agenda', sport: 'General', difficulty: 'beginner', tags: ['coaches', 'meeting', 'alignment'] },
  { id: 'expanded-balanced-lineup-sheet', title: 'Balanced Lineup Planning Sheet', description: 'Record rotation principles, position coverage, substitutions, and development goals.', type: 'lineup-template', sport: 'General', difficulty: 'intermediate', tags: ['lineup', 'rotations', 'development'] },
  { id: 'expanded-tournament-host-pack', title: 'Tournament Host Operations Pack', description: 'Coordinate venue, officials, check-in, schedule buffers, results, and participant messaging.', type: 'tournament-checklist', sport: 'General', difficulty: 'advanced', tags: ['tournament', 'host', 'operations'] },
  { id: 'expanded-season-review-workbook', title: 'Season Review Workbook', description: 'Review participation, safety, budget, feedback, and improvements before the next cycle.', type: 'season-planner', sport: 'General', difficulty: 'intermediate', tags: ['season review', 'feedback', 'planning'] },
  { id: 'expanded-practice-transition-map', title: 'Practice Transition Map', description: 'Reduce idle time by documenting equipment moves, group changes, and coach handoffs.', type: 'practice-template', sport: 'General', difficulty: 'intermediate', tags: ['practice', 'transitions', 'pacing'] },
  { id: 'expanded-weather-message-kit', title: 'Weather Update Message Kit', description: 'Clear templates for heat, lightning, air quality, delays, relocation, and cancellation.', type: 'parent-communication', sport: 'General', difficulty: 'beginner', tags: ['weather', 'parents', 'alerts'] },
  { id: 'expanded-accessibility-audit', title: 'Sports Program Accessibility Audit', description: 'Review routes, communication, equipment, scheduling, and accommodation follow-through.', type: 'emergency-action-plan', sport: 'General', difficulty: 'intermediate', tags: ['accessibility', 'inclusion', 'audit'] },
  { id: 'expanded-sponsor-deliverables-sheet', title: 'Sponsor Deliverables Sheet', description: 'Track agreed visibility, deadlines, assets, approvals, and post-event proof.', type: 'fundraising-ideas', sport: 'General', difficulty: 'intermediate', tags: ['sponsors', 'fundraising', 'events'] },
  { id: 'expanded-uniform-measurement-list', title: 'Uniform Measurement and Order List', description: 'Collect sizes, names, quantities, payment status, and exchange notes without duplicate orders.', type: 'equipment-list', sport: 'General', difficulty: 'beginner', tags: ['uniforms', 'orders', 'inventory'] },
  { id: 'expanded-tournament-officials-roster', title: 'Tournament Officials Roster', description: 'Record assignments, availability, rates, contacts, and backup coverage for each game block.', type: 'tournament-checklist', sport: 'General', difficulty: 'intermediate', tags: ['officials', 'tournament', 'schedule'] },
  { id: 'expanded-parent-meeting-agenda', title: 'Parent Meeting Agenda and Notes', description: 'Keep a focused record of expectations, questions, decisions, and follow-up owners.', type: 'parent-communication', sport: 'General', difficulty: 'beginner', tags: ['parents', 'meeting', 'notes'] },
  { id: 'expanded-team-transport-plan', title: 'Team Transportation Plan', description: 'Document approved drivers, permissions, pickup points, emergency contacts, and changes.', type: 'travel-checklist', sport: 'General', difficulty: 'advanced', tags: ['transportation', 'travel', 'safety'] },
];

const drillSeeds: ResourceSeed[] = [
  { id: 'expanded-drill-first-touch-gates', title: 'First-Touch Gates', description: 'A progressive receiving drill that teaches athletes to scan, open their body, and play forward.', type: 'drill', sport: 'Soccer', difficulty: 'beginner', tags: ['first touch', 'soccer', 'scanning'] },
  { id: 'expanded-drill-3v2-transition', title: '3v2 Transition Waves', description: 'Train quick attacking decisions and defensive recovery through continuous small-sided waves.', type: 'drill', sport: 'Soccer', difficulty: 'intermediate', tags: ['transition', 'soccer', 'small-sided'] },
  { id: 'expanded-drill-closeout-corner', title: 'Closeout Corner', description: 'Build controlled closeouts, communication, and help positioning with short competitive reps.', type: 'drill', sport: 'Basketball', difficulty: 'beginner', tags: ['closeout', 'basketball', 'defense'] },
  { id: 'expanded-drill-pivot-pass-relay', title: 'Pivot Pass Relay', description: 'Teach basketball players to establish a target, pivot under pressure, and deliver an accurate pass.', type: 'drill', sport: 'Basketball', difficulty: 'beginner', tags: ['passing', 'basketball', 'pivot'] },
  { id: 'expanded-drill-serve-receive-triangles', title: 'Serve-Receive Triangles', description: 'Improve volleyball platform angles, communication, and movement into the next action.', type: 'drill', sport: 'Volleyball', difficulty: 'intermediate', tags: ['serve receive', 'volleyball', 'communication'] },
  { id: 'expanded-drill-block-footwork-ladder', title: 'Block Footwork Ladder', description: 'Progress lateral movement and timing for volleyball blockers using repeatable footwork patterns.', type: 'drill', sport: 'Volleyball', difficulty: 'advanced', tags: ['blocking', 'volleyball', 'footwork'] },
  { id: 'expanded-drill-hockey-support-lanes', title: 'Support Lane Passing', description: 'Teach hockey players to create width, give a safe outlet, and move after the pass.', type: 'drill', sport: 'Hockey', difficulty: 'beginner', tags: ['passing', 'hockey', 'support'] },
  { id: 'expanded-drill-hockey-corner-cycle', title: 'Corner Cycle Decisions', description: 'Practice puck protection, support angles, and quick decisions around the offensive zone.', type: 'drill', sport: 'Hockey', difficulty: 'advanced', tags: ['hockey', 'cycling', 'decision making'] },
  { id: 'expanded-drill-base-stealing-read', title: 'Base-Stealing Read', description: 'Develop baseball runners’ leads, first movement, and safe decision-making from a live read.', type: 'drill', sport: 'Baseball', difficulty: 'intermediate', tags: ['base running', 'baseball', 'reads'] },
  { id: 'expanded-drill-infield-funnel', title: 'Infield Funnel and Throw', description: 'Rehearse ground-ball approach, footwork, transfer, and accurate throws under time pressure.', type: 'drill', sport: 'Baseball', difficulty: 'beginner', tags: ['infield', 'baseball', 'fielding'] },
  { id: 'expanded-drill-football-box-fit', title: 'Box Fit and Leverage', description: 'Build safe tackling posture, leverage, and gap communication with controlled football repetitions.', type: 'drill', sport: 'Football', difficulty: 'advanced', tags: ['football', 'defense', 'leverage'] },
  { id: 'expanded-drill-football-route-spacing', title: 'Route Spacing Windows', description: 'Help receivers and quarterbacks recognize spacing, timing, and open windows in a compact setup.', type: 'drill', sport: 'Football', difficulty: 'intermediate', tags: ['football', 'routes', 'spacing'] },
  { id: 'expanded-drill-lacrosse-passing-box', title: 'Lacrosse Passing Box', description: 'Develop catch-and-release timing, off-hand confidence, and communication in a moving box.', type: 'drill', sport: 'Lacrosse', difficulty: 'beginner', tags: ['lacrosse', 'passing', 'communication'] },
  { id: 'expanded-drill-lacrosse-slide-recovery', title: 'Slide and Recovery', description: 'Train defenders to communicate the slide, protect the middle, and recover with urgency.', type: 'drill', sport: 'Lacrosse', difficulty: 'advanced', tags: ['lacrosse', 'defense', 'slides'] },
  { id: 'expanded-drill-track-relay-handover', title: 'Relay Handover Rhythm', description: 'Practice acceleration, visual cues, and a clean exchange through progressive relay distances.', type: 'drill', sport: 'Track & Field', difficulty: 'intermediate', tags: ['relay', 'track', 'handover'] },
  { id: 'expanded-drill-track-acceleration-wall', title: 'Acceleration Wall Series', description: 'Teach body angles and force application with short, controlled acceleration efforts.', type: 'drill', sport: 'Track & Field', difficulty: 'beginner', tags: ['acceleration', 'track', 'mechanics'] },
  { id: 'expanded-drill-tennis-recovery-split', title: 'Recovery Split-Step', description: 'Improve tennis players’ readiness, balance, and first movement after every shot.', type: 'drill', sport: 'Tennis', difficulty: 'beginner', tags: ['tennis', 'footwork', 'recovery'] },
  { id: 'expanded-drill-tennis-crosscourt-pattern', title: 'Crosscourt Pattern Builder', description: 'Use cooperative patterns to teach depth, margin, and purposeful court movement.', type: 'drill', sport: 'Tennis', difficulty: 'intermediate', tags: ['tennis', 'patterns', 'consistency'] },
  { id: 'expanded-drill-rugby-support-line', title: 'Support Line Timing', description: 'Build running angles, communication, and support decisions after contact or a break.', type: 'drill', sport: 'Rugby', difficulty: 'intermediate', tags: ['rugby', 'support', 'running lines'] },
  { id: 'expanded-drill-rugby-tackle-technique', title: 'Safe Tackle Technique Progression', description: 'A progressive, coach-supervised sequence for body position, tracking, and safe completion.', type: 'drill', sport: 'Rugby', difficulty: 'advanced', tags: ['rugby', 'tackling', 'safety'] },
  { id: 'expanded-drill-general-reaction-colors', title: 'Reaction Color Calls', description: 'A multi-sport reaction game that develops scanning, movement quality, and fast choices.', type: 'drill', sport: 'General', difficulty: 'beginner', tags: ['reaction', 'movement', 'multi-sport'] },
];

function makeResource(seed: ResourceSeed, index: number): Resource {
  return { ...seed, downloadCount: 120 + index * 17, isFeatured: index === 0, isVideo: false, createdAt: '2026-08-08', content: { overview: seed.description, body: `## ${seed.title}

${seed.description}

### Setup

Prepare the space, equipment, participant groups, and safety expectations before starting. Explain the purpose in one sentence and demonstrate the first repetition.

### Run the Activity

Use short rounds, observe the key decision or movement, and offer one correction at a time. Increase challenge only when athletes can repeat the basic action with control. Build in water, recovery, and inclusive modifications for different ages or abilities.

### Coach Review

After the session, record what worked, what needs changing, and the next progression. Keep private athlete information in the approved team system rather than in a public copy of this resource.` }, tags: seed.tags };
}

export const EXPANDED_RESOURCES: Resource[] = [...generalSeeds, ...drillSeeds].map(makeResource);

