/**
 * Sports Hub Resources — Complete Resource Library
 * All resources link to real, publicly accessible URLs where possible.
 * Internal resources use /sports-hub/resources/[id] viewer pages.
 */
import { EXPANDED_RESOURCES } from './sports-hub-expanded-resources';

export type ResourceType =
  | 'practice-plan'
  | 'drill'
  | 'season-planner'
  | 'lineup-template'
  | 'practice-template'
  | 'tournament-checklist'
  | 'game-day-checklist'
  | 'parent-communication'
  | 'volunteer-guide'
  | 'emergency-action-plan'
  | 'fundraising-ideas'
  | 'equipment-list'
  | 'travel-checklist'
  | 'coach-meeting-agenda'
  | 'video';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Resource {
  id: string;
  title: string;
  description: string;
  type: ResourceType;
  sport: string;
  difficulty: Difficulty;
  downloadCount: number;
  isFeatured: boolean;
  isVideo: boolean;
  videoUrl?: string;
  /** YouTube channel or creator credit shown on video resources */
  videoCredit?: string;
  /** Internal viewer slug — all non-video resources use /sports-hub/resources/[id] */
  content: ResourceContent;
  tags: string[];
  createdAt: string;
}

export interface ResourceContent {
  overview: string;
  /** Markdown body rendered in the resource viewer */
  body: string;
}

export const RESOURCES: Resource[] = [
  ...EXPANDED_RESOURCES,
  // ─── PRACTICE PLANS ───────────────────────────────────────────────────────
  {
    id: 'pp-1',
    title: '4-Week Pre-Season Training Plan',
    description: 'A complete four-week progressive training program to prepare your team for the season ahead. Includes daily session breakdowns, conditioning targets, and recovery days.',
    type: 'practice-plan',
    sport: 'General',
    difficulty: 'intermediate',
    downloadCount: 1204,
    isFeatured: true,
    isVideo: false,
    tags: ['pre-season', 'conditioning', 'progressive', 'planning'],
    createdAt: '2026-04-01',
    content: {
      overview: 'A structured four-week program to transform your team from off-season to game-ready.',
      body: `## 4-Week Pre-Season Training Plan

**Purpose:** Transform your team from off-season to fully game-ready over four progressive weeks.

---

### Week 1 \u2014 Establish a Baseline

> *Goal: Assess fitness levels, establish team norms, introduce foundational movement patterns.*

**Monday \u2014 Day 1: Fitness Assessment**
- 1-mile timed run (record every player's time)
- Max push-ups in 60 seconds
- Agility: 5-10-5 shuttle (record times)
- Flexibility: seated toe touch measurement

**Tuesday \u2014 Day 2: Technical Skills (Low Intensity)**
- 30 min individual skill stations
- 20 min small-sided games (4v4)
- Emphasis: technique over speed

**Wednesday \u2014 Day 3: Active Recovery**
- 20 min light jog or dynamic stretching
- Film session: review last season's highlights and areas for improvement
- Team goal-setting meeting (30 min)

**Thursday \u2014 Day 4: Strength Foundation**
- Bodyweight circuit: 3 rounds
  - 15 squats
  - 12 push-ups
  - 10 lunges per leg
  - 30-sec plank
  - 20 mountain climbers
- Core work: 3 sets \xd7 1-min hold

**Friday \u2014 Day 5: Team Tactical Introduction**
- Introduce team shape and basic tactical principles
- 3v3 / 4v4 scenario-based games
- Cool-down and weekly debrief

---

### Week 2 \u2014 Build Volume

**Conditioning targets:** Increase session duration by 15%. Introduce interval work.

- Monday: High-intensity intervals (6 \xd7 400m at 85% effort)
- Tuesday: Technical work + 11v11 / full-sided scrimmage
- Wednesday: Rest or pool recovery
- Thursday: Strength circuit (add resistance bands or light weights)
- Friday: Tactical sessions \u2014 set pieces, defensive shape, transitions

---

### Week 3 \u2014 Peak Load

**Warning:** This is the hardest week. Monitor for signs of overtraining.

- Two-a-days on Tuesday and Thursday (morning: conditioning, afternoon: technical)
- Introduce competitive elements: timed challenges, leaderboards
- Film review every evening (20 min cap)
- Hydration and nutrition check-ins with every player

---

### Week 4 \u2014 Taper and Activate

> *Goal: Arrive at opening day fresh, confident, and sharp \u2014 not exhausted.*

- Reduce volume by 40% from Week 3
- Increase game-simulation intensity
- Final fitness benchmarks (compare to Week 1 assessments)
- Scrimmage against another team if possible
- **Final day: Walk-through only. No new information within 48 hours of opening game.**

---

## Key Principles

1. **Progressive Overload** \u2014 Each week should be slightly harder than the last (except Week 4).
2. **Recovery is Training** \u2014 Rest days are not optional. Tired athletes don\u2019t improve.
3. **Individualize Within the Group** \u2014 Note players who need modification (injury history, fitness gaps).
4. **Psychological Readiness** \u2014 Schedule at least one team-bonding activity per week.

---

## Tracking Sheet

| Player | Week 1 Mile | Week 4 Mile | Improvement |
|--------|-------------|-------------|-------------|
| [Name] | \u00a0 | \u00a0 | \u00a0 |

Use this table to celebrate measurable improvement with your team on the last day of pre-season.`,
    },
  },
  {
    id: 'pp-2',
    title: 'Youth Basketball: 90-Minute Practice Plan Template',
    description: 'A structured 90-minute practice plan template for youth basketball coaches. Includes warm-up, skill stations, scrimmage, and cool-down timing.',
    type: 'practice-plan',
    sport: 'Basketball',
    difficulty: 'beginner',
    downloadCount: 876,
    isFeatured: false,
    isVideo: false,
    tags: ['basketball', 'youth', '90-minute', 'template'],
    createdAt: '2026-04-15',
    content: {
      overview: 'A ready-to-run 90-minute practice plan for youth basketball programs.',
      body: `## Youth Basketball: 90-Minute Practice Plan

**Age Group:** 8\u201314 | **Level:** Recreational to Competitive

---

### Practice Timeline

| Time | Block | Duration |
|------|-------|----------|
| 0:00 | Arrival + Team Circle | 5 min |
| 0:05 | Dynamic Warm-Up | 10 min |
| 0:15 | Skill Station 1: Ball Handling | 15 min |
| 0:30 | Skill Station 2: Shooting | 15 min |
| 0:45 | Skill Station 3: Defense | 10 min |
| 0:55 | Team Tactical (offense/defense sets) | 15 min |
| 1:10 | 3v3 / 4v4 Competitive Scrimmage | 15 min |
| 1:25 | Cool-Down + Team Talk | 5 min |

---

### Station Details

**Ball Handling (15 min)**
- 2 min: Stationary dribbling (right, left, alternating)
- 3 min: Cone weave dribbling
- 5 min: Two-ball dribbling
- 5 min: 1v1 ball-handling challenge

**Shooting (15 min)**
- Form shooting (5 ft): 2 min
- Mid-range catch and shoot: 5 min
- Drive and finish at rim: 5 min
- Knockout game: 3 min

**Defense (10 min)**
- Defensive slide footwork: 3 min
- 1v1 closeout drill: 4 min
- Shell drill (team defense): 3 min

---

### Coaching Notes

> \u201cThe best practice plans have more reps than explanations. Talk less, play more.\u201d

- Keep instructions under 60 seconds per drill
- Use demonstrations before talking
- Celebrate effort, not just results
- End every practice on a positive note`,
    },
  },
  {
    id: 'pp-3',
    title: 'Soccer: Progressive 6-Week Training Block',
    description: 'A complete 6-week soccer training program covering fitness, technical skills, tactical understanding, and psychological preparation.',
    type: 'practice-plan',
    sport: 'Soccer',
    difficulty: 'intermediate',
    downloadCount: 654,
    isFeatured: false,
    isVideo: false,
    tags: ['soccer', 'training-block', 'progressive', 'periodization'],
    createdAt: '2026-05-01',
    content: {
      overview: 'Six weeks of structured soccer training with clear objectives for each phase.',
      body: `## Soccer: 6-Week Progressive Training Block

### Periodization Overview

| Week | Phase | Primary Focus |
|------|-------|---------------|
| 1 | General Preparation | Aerobic base, technique review |
| 2 | Specific Preparation | Sport-specific conditioning |
| 3 | Tactical Introduction | Team shape, pressing, transitions |
| 4 | Competition Preparation | Game scenarios, set pieces |
| 5 | Peak | Full-sided games, fine-tuning |
| 6 | Taper | Reduced volume, sharpen confidence |

---

### Week 1: General Preparation

**Focus:** Build the aerobic engine. Don\u2019t skimp on fitness in Week 1.

*Monday:* Aerobic base run (30 min at 70% max HR) + individual juggling and first touch
*Tuesday:* Rondo progressions (4v1 \u2192 6v2) + position-specific technical work
*Wednesday:* Rest or yoga/flexibility
*Thursday:* High-intensity aerobic intervals (8 \xd7 2 min on / 1 min off) + finishing
*Friday:* Full-sided game with one restriction (e.g., two-touch limit)

### Weeks 2\u20135: (Follow same structure, increasing tactical complexity and game speed each week)

### Week 6: Taper

- Reduce volume by 30%
- Maintain intensity (full game speed on all activities)
- No new information \u2014 reinforce existing patterns
- Focus on confidence and team cohesion

---

### Tracking Metrics

- Sprint speed (40-yard dash)
- Technical test: 1 min juggling count
- Fitness: Yo-Yo test score
- Team satisfaction survey (simple 1-10 rating)`,
    },
  },

  // ─── DRILLS ───────────────────────────────────────────────────────────────
  {
    id: 'dr-1',
    title: '4-Corner Passing Drill',
    description: 'Improve first touch, communication, and movement off the ball with this high-intensity passing circuit. Works for all age groups and skill levels.',
    type: 'drill',
    sport: 'Soccer',
    difficulty: 'intermediate',
    downloadCount: 856,
    isFeatured: false,
    isVideo: false,
    tags: ['passing', 'first-touch', 'communication', 'warm-up'],
    createdAt: '2026-03-15',
    content: {
      overview: 'A classic high-tempo passing drill that builds communication and first touch simultaneously.',
      body: `## 4-Corner Passing Drill

**Players:** 8\u201316 | **Duration:** 10\u201315 minutes | **Equipment:** 4 cones, 2\u20134 balls

---

### Setup

Set up 4 cones in a 15x15 yard square. Divide players evenly at each corner.

\`\`\`
[A] ------> [B]
 ^           |
 |           v
[D] <------ [C]
\`\`\`

---

### Basic Version (Beginners)

1. Player at **A** passes to **B** and follows their pass (joins B\u2019s line)
2. Player at **B** receives, passes to **C**, follows pass
3. Continue around the square
4. **Ball moves clockwise; players follow their pass**

**Key coaching points:**
- Pass with the inside of the foot
- First touch should set up the next pass direction
- Communicate with a call before receiving (\u201cyes!\u201d or player\u2019s name)

---

### Intermediate Version

- Add a second ball starting from the opposite corner (C)
- Players must communicate to avoid collision
- Increase speed gradually

---

### Advanced Version

- Balls go clockwise; players go **counter-clockwise**
- Requires anticipation and timing
- Add a 1-2 combination at each corner before passing on

---

### Coaching Notes

> \u201cThe drill only has value at game speed. Once they have the pattern, push the tempo.\u201d

- Stop the drill if tempo drops. Reset and restart.
- Count consecutive passes without errors as a team challenge
- Progression: Add a defender in the middle (creates 4v1 rondo feel)

**Common errors:**
- *Telegraphing the pass* \u2014 look away before passing
- *Poor first touch* \u2014 too heavy, too soft
- *Not following the pass* \u2014 remind players: always follow`,
    },
  },
  {
    id: 'dr-2',
    title: 'Box Drill \u2014 Basketball Dribbling & Control',
    description: 'A classic basketball dribbling drill for ball control, change of direction, and court awareness under game-speed pressure.',
    type: 'drill',
    sport: 'Basketball',
    difficulty: 'beginner',
    downloadCount: 743,
    isFeatured: false,
    isVideo: false,
    tags: ['dribbling', 'ball-control', 'change-of-direction', 'basketball'],
    createdAt: '2026-03-20',
    content: {
      overview: 'Develop ball-handling confidence and change-of-direction speed with this progressive dribbling drill.',
      body: `## Box Drill \u2014 Basketball Dribbling & Control

**Players:** 1\u20136 | **Duration:** 8\u201312 minutes | **Equipment:** 4 cones, 1 ball per player

---

### Setup

Place 4 cones at the corners of a 12x12 foot box near the three-point arc or half-court.

---

### Level 1: Basic Box Dribble

1. Start at cone A, dribble strong hand to cone B
2. At cone B, perform a **crossover** dribble to weak hand
3. Dribble weak hand to cone C
4. At cone C, **between-the-legs** move back to strong hand
5. Dribble strong hand back to cone A
6. Complete 3 laps, rest 30 seconds

**Focus:** Keep dribble below knee height. Eyes up at all times.

---

### Level 2: Speed Box

Same pattern as Level 1, but timed. Players compete against their own best time.

- Round 1: Normal speed
- Round 2: As fast as possible (without losing control)
- Round 3: Eyes closed at each cone transition (builds feel)

---

### Level 3: Add a Defender

Place a passive defender inside the box. Dribbler must avoid the defender while maintaining the pattern. Progress to active (trying to strip the ball) defender.

---

### Key Points

- **Head up** \u2014 no looking at the ball
- **Low and wide** stance \u2014 be a hard target to guard
- **Protect the ball** with your off-arm
- Moves should be explosive and decisive, not hesitant

---

### Progression Moves to Practice

1. Crossover
2. Between the legs
3. Behind the back
4. Spin move
5. Hesitation (stutter step)`,
    },
  },
  {
    id: 'dr-3',
    title: 'T-Drill \u2014 Multi-Sport Agility',
    description: 'The T-Drill is a fundamental agility test and training tool used across football, baseball, soccer, tennis, and more.',
    type: 'drill',
    sport: 'General',
    difficulty: 'intermediate',
    downloadCount: 612,
    isFeatured: false,
    isVideo: false,
    tags: ['agility', 'speed', 'change-of-direction', 'multi-sport'],
    createdAt: '2026-04-10',
    content: {
      overview: 'One of the most universal agility drills in sports \u2014 works for any athlete who needs to change direction quickly.',
      body: `## T-Drill \u2014 Multi-Sport Agility

**Sports:** Football, Baseball, Soccer, Tennis, Basketball, Lacrosse
**Players:** 1+ | **Duration:** 10 min | **Equipment:** 4 cones, stopwatch

---

### Setup (T-Shape)

\`\`\`
        [C]
       /   \\
      /     \\
    [B]---[D]
     |
     |  (5 yards)
     |
    [A] START
\`\`\`

- A to B = 10 yards (forward sprint)
- B to C = 5 yards (lateral shuffle left)
- C to D = 10 yards (lateral shuffle right)
- D to B = 5 yards (lateral shuffle back left)
- B to A = 10 yards (backpedal)

---

### Instructions

1. Start at cone **A** in athletic stance
2. **Sprint** forward to cone **B**, touch the base of cone
3. **Shuffle left** (no crossover steps) to cone **C**, touch
4. **Shuffle right** to cone **D**, touch
5. **Shuffle left** back to cone **B**, touch
6. **Backpedal** to cone **A** \u2014 time stops when you cross A

---

### Benchmark Times

| Level | Male (seconds) | Female (seconds) |
|-------|---------------|-----------------|
| Excellent | <9.5 | <10.5 |
| Above Average | 9.5\u201310.5 | 10.5\u201311.5 |
| Average | 10.5\u201311.5 | 11.5\u201312.5 |
| Below Average | >11.5 | >12.5 |

---

### Coaching Points

- Stay low throughout \u2014 high hips = slow transitions
- Touch cones with the correct hand (inside hand)
- Drive off the outside leg when changing direction
- Maintain a wide base during lateral shuffles

**Common errors:**
- Crossover steps during shuffle (loses efficiency)
- Straightening up at cones (loses speed)
- Looking at the ground instead of the next cone`,
    },
  },
  {
    id: 'dr-4',
    title: 'Mirror Drill \u2014 Defensive Footwork',
    description: 'A reaction-based drill for developing defensive footwork, lateral speed, and anticipation across any sport.',
    type: 'drill',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 489,
    isFeatured: false,
    isVideo: false,
    tags: ['defense', 'footwork', 'reaction', 'lateral-speed'],
    createdAt: '2026-05-05',
    content: {
      overview: 'Develop elite defensive footwork and anticipation with this partner reaction drill.',
      body: `## Mirror Drill \u2014 Defensive Footwork

**Players:** 2 per pair | **Duration:** 8 minutes | **Equipment:** 2 cones (markers)

---

### Setup

Two players face each other, 3\u20135 feet apart. Place one cone behind each player as a back boundary.

---

### How It Works

- Player 1 = **Offensive player** (leader) \u2014 moves laterally, changes direction randomly
- Player 2 = **Defensive player** (mirror) \u2014 must stay directly opposite Player 1 at all times

**Rounds:** 20 seconds on / 15 seconds rest \xd7 4 rounds, then switch roles

---

### Scoring (Optional)

The defender scores a point every time they successfully stay mirrored. The offense scores a point every time they create a full-step gap.

---

### Progressions

1. **Basic:** Side-to-side only (2D)
2. **Intermediate:** Add forward/backward movement
3. **Advanced:** Offense can use ball (basketball dribble or soccer dribble) to add realistic pressure

---

### Coaching Points

- Stay in a low, athletic stance (bend the knees, not the back)
- Short, choppy steps \u2014 never cross your feet
- Keep your eyes on the offensive player\u2019s hips (not the ball or their head)
- React, don\u2019t predict`,
    },
  },
  {
    id: 'dr-5',
    title: 'Volleyball: Serve Receive Progression Drill',
    description: 'A step-by-step progression for teaching and perfecting serve receive technique for youth and high school volleyball programs.',
    type: 'drill',
    sport: 'Volleyball',
    difficulty: 'beginner',
    downloadCount: 398,
    isFeatured: false,
    isVideo: false,
    tags: ['volleyball', 'serve-receive', 'passing', 'progression'],
    createdAt: '2026-05-20',
    content: {
      overview: 'Master serve receive with this three-stage progression drill used by successful youth volleyball programs.',
      body: `## Volleyball: Serve Receive Progression Drill

**Players:** 6\u201312 | **Duration:** 20 minutes | **Equipment:** Volleyballs, net

---

### Stage 1: Platform Foundation (5 min)

**Without ball:**
- Pair players facing each other, 8 feet apart
- Practice forearm platform position: arms together, elbows straight, thumbs parallel
- Toss to partner, partner bumps back \u2014 focus on form only

**Key coaching points:**
- Platform should be angled toward target (setter position)
- Move feet to the ball \u2014 never reach
- Contact point: forearms below the wrist, above the elbow

---

### Stage 2: Short Court Passing (8 min)

- Serving player tosses from 10 feet away (same side of net)
- Receiver passes to setter position (target player or cone)
- Rotate every 5 successful passes

**Success target:** 4 of 5 passes within 3 feet of target

---

### Stage 3: Full Court Serve Receive (7 min)

- Server serves from the end line (underhand first, then overhand)
- Receiver in serve-receive position on opposite side
- Must call the ball verbally before passing

**Coaching focus:**
- Early movement: step to ball before contact
- Keep eyes on server\u2019s contact point
- Communicate before the ball comes over the net`,
    },
  },

  // ─── SEASON PLANNERS ──────────────────────────────────────────────────────
  {
    id: 'sp-1',
    title: 'Season Planning Master Template',
    description: 'Map out your entire season \u2014 practices, games, tournaments, and rest days \u2014 in one comprehensive planning framework.',
    type: 'season-planner',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 987,
    isFeatured: true,
    isVideo: false,
    tags: ['season-planning', 'calendar', 'periodization', 'template'],
    createdAt: '2026-03-01',
    content: {
      overview: 'A complete season planning framework that helps any coach map an entire season in under 2 hours.',
      body: `## Season Planning Master Template

> *\u201cGive me six hours to chop down a tree and I will spend the first four sharpening the axe.\u201d \u2014 Abraham Lincoln*

A well-planned season is the foundation of a successful program. This template walks you through every layer of season planning.

---

### Step 1: Identify Your Season Parameters

Fill in these before planning anything else:

- **Season Start Date:** _______________
- **Season End Date:** _______________
- **Total Weeks:** _______________
- **Typical Practice Days:** M / T / W / Th / F / Sa / Su
- **Games Per Week (average):** _______________
- **Major Tournament/Championship Date:** _______________

---

### Step 2: Divide Into Phases

| Phase | Duration | Focus |
|-------|----------|-------|
| Pre-Season | 2\u20134 weeks | Fitness, baseline, team cohesion |
| Early Season | 20% of season | Learning systems, low-stakes games |
| Mid Season | 50% of season | Competitive, peak training load |
| Late Season / Playoffs | 30% of season | Taper, peaking, championship preparation |

---

### Step 3: Map the Calendar

For each week, define:
1. **Theme:** What is the main coaching focus this week?
2. **Training Load:** Low / Medium / High
3. **Game Days:** Circle them
4. **Rest Days:** Mark them \u2014 they are non-negotiable
5. **Special Events:** tournaments, parent meetings, etc.

---

### Step 4: Monthly Check-In Questions

At the end of each month, ask yourself:
- Are we on pace with physical development goals?
- Are team relationships healthy?
- Have I communicated effectively with parents?
- What needs to change in the next month?

---

### Step 5: Post-Season Evaluation

**Team Performance:** Did we achieve our stated goals?
**Player Development:** Which players improved most? Why?
**Coaching:** What would I do differently?
**Operations:** What administrative processes need improvement?

---

### 🎁 Free Templates

Use The Squad's interactive Season Planning Spreadsheet — a free in-browser template with training load calculation, phase mapping, and a printable weekly calendar. No account required.

**[→ Open the Season Planning Spreadsheet](/sports-hub/templates/season-planning-spreadsheet)**

Browse all free Squad templates at [Sports Hub Templates](/sports-hub/templates).`,
    },
  },
  {
    id: 'sp-2',
    title: 'Youth Soccer: 12-Week Season Planner',
    description: 'A complete 12-week season plan for recreational and competitive youth soccer, broken down week by week with themes and objectives.',
    type: 'season-planner',
    sport: 'Soccer',
    difficulty: 'beginner',
    downloadCount: 712,
    isFeatured: false,
    isVideo: false,
    tags: ['soccer', 'youth', '12-week', 'season-planner'],
    createdAt: '2026-04-20',
    content: {
      overview: 'Week-by-week season plan for youth soccer with themes, objectives, and progressions.',
      body: `## Youth Soccer: 12-Week Season Planner

**Level:** U10\u2013U16 | **Sessions per week:** 2 practices + 1 game

---

### Weeks 1\u20133: Foundation Phase

**Theme:** Individual skills and team identity

| Week | Practice 1 | Practice 2 | Game Day Focus |
|------|-----------|-----------|----------------|
| 1 | Dribbling \u0026 1v1 | Passing \u0026 receiving | Play free, have fun |
| 2 | Shooting \u0026 finishing | Small-sided games | Encourage shooting |
| 3 | Defending basics | Team rondo | Compact defense |

**Key principle:** In weeks 1\u20133, players should be playing more than listening.

---

### Weeks 4\u20136: System Introduction

**Theme:** Team shape and basic tactical understanding

- Introduce your team\u2019s preferred formation
- Practice set pieces: corner kicks, free kicks, throw-ins
- Begin to assign positional roles (but keep it flexible)

---

### Weeks 7\u20139: Competition Preparation

**Theme:** Game-like training at maximum intensity

- All drills include defensive pressure
- Focus on transitions: offense to defense, defense to offense
- Introduce video review (even just phone recordings)

---

### Weeks 10\u201312: Championship Phase

**Theme:** Fine-tuning and confidence

- Reduce volume, maintain intensity
- Let players lead warm-ups and drills
- Focus on team confidence, not new information
- Reserve energy for the tournament/championship`,
    },
  },

  // ─── CHECKLISTS & TEMPLATES ───────────────────────────────────────────────
  {
    id: 'gdc-1',
    title: 'Game Day Communication Checklist',
    description: 'Never forget a critical game-day communication again. Covers pre-game reminders, lineup notifications, post-game updates, and parent communication.',
    type: 'game-day-checklist',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 847,
    isFeatured: true,
    isVideo: false,
    tags: ['communication', 'game-day', 'parents', 'checklist'],
    createdAt: '2026-03-10',
    content: {
      overview: 'A comprehensive game day checklist that ensures nothing falls through the cracks.',
      body: `## Game Day Communication Checklist

Use this checklist before, during, and after every game to keep players, parents, and staff fully informed.

---

### \u23f0 48 Hours Before Game

- [ ] Send game reminder to all players and parents (time, location, directions)
- [ ] Confirm venue address is correct (use Google Maps link)
- [ ] Confirm uniform color (home vs. away)
- [ ] Send equipment list reminder (shin guards, cleats, water, snacks)
- [ ] Confirm officials are booked (if your responsibility)
- [ ] Notify any players of specific roles or changes for this game

---

### \u23f0 Morning of Game

- [ ] Send final reminder via team app/messaging group
- [ ] Include parking instructions if venue is new
- [ ] Share estimated weather forecast
- [ ] Confirm arrival time (30\u201345 min before game)
- [ ] Text any players who didn\u2019t confirm attendance

---

### \u2705 At the Venue (Pre-Game)

- [ ] Sign in with tournament/league official
- [ ] Get roster approved if required
- [ ] Brief assistant coaches on game plan
- [ ] Conduct warm-up (follow your standard routine)
- [ ] Identify first aid location and emergency exits
- [ ] Confirm score-keeping arrangements

---

### \ud83c\udfc1 During the Game

- [ ] Track substitutions systematically (no one sits for the whole game)
- [ ] Keep sideline calm and organized
- [ ] Monitor player energy and attitude, not just performance
- [ ] Track any injuries or incidents (even minor ones)

---

### \ud83d\udce8 Post-Game (Same Day)

- [ ] Send post-game summary to team (brief: 2\u20133 positives, 1 focus area)
- [ ] Document final score and record
- [ ] Note any injuries (report per your program\u2019s policy)
- [ ] Log player performance notes for coaching review
- [ ] Thank officials (sets a culture of respect)

---

### \ud83d\udcc5 Next Practice Communication

- [ ] Share next practice time and location within 24 hours
- [ ] Briefly address the game at the start of next practice
- [ ] Follow up individually with any players who need support

---

### Pro Tip

> Use The Squad\u2019s team messaging feature to automate game reminders \u2014 schedule them once and they go out automatically at the right time.`,
    },
  },
  {
    id: 'tc-1',
    title: 'Tournament Director Checklist',
    description: '68-point checklist covering everything from pre-registration to post-tournament wrap-up. Never forget a critical tournament detail again.',
    type: 'tournament-checklist',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 621,
    isFeatured: false,
    isVideo: false,
    tags: ['tournament', 'director', 'checklist', 'operations'],
    createdAt: '2026-03-25',
    content: {
      overview: 'The complete 68-point checklist every tournament director needs to run a professional, stress-free event.',
      body: `## Tournament Director Checklist

*The difference between a great tournament and a chaotic one is almost always preparation.*

---

### \ud83d\uddd3\ufe0f 8+ Weeks Before Tournament

**Venue & Logistics**
- [ ] Secure venue contract with dates and times locked
- [ ] Confirm parking capacity and arrange overflow if needed
- [ ] Verify restroom facilities (ratio: 1 per 75 people minimum)
- [ ] Plan field/court layout and numbering
- [ ] Confirm concessions plan (in-house vs. vendor)
- [ ] Arrange first aid station with certified personnel

**Registration**
- [ ] Open online registration (use The Squad or similar platform)
- [ ] Set registration deadline and payment terms
- [ ] Create waitlist process for oversubscribed brackets

**Officials**
- [ ] Contact your officiating association or assignor
- [ ] Confirm rate schedule and payment method
- [ ] Schedule assignment coordinator for game-day

---

### \ud83d\uddd3\ufe0f 4 Weeks Before

**Communication**
- [ ] Send acceptance/confirmation emails to all registered teams
- [ ] Share tournament rules and format document
- [ ] Post schedule on tournament website/app
- [ ] Send directions and parking map

**Equipment**
- [ ] Order/confirm balls, nets, corner flags, goals
- [ ] Secure scoreboard or scorekeeping app
- [ ] Order awards (trophies, medals, certificates)
- [ ] Confirm first aid supplies inventory

---

### \ud83d\uddd3\ufe0f 1 Week Before

- [ ] Send final schedule to all teams (confirm game times)
- [ ] Brief all volunteers on their roles
- [ ] Prepare registration packets (wristbands, programs, schedules)
- [ ] Test all technology (PA system, scoring app, payment terminal)
- [ ] Confirm food and beverage delivery times

---

### \u2705 Day Before

- [ ] Set up venue (nets, goals, signage, registration tables)
- [ ] Prep registration packets in alphabetical order
- [ ] Brief officials coordinator
- [ ] Post field maps at entrance

---

### \ud83c\udfab Tournament Day

**Morning Setup (2 hours before first game)**
- [ ] Open registration/check-in
- [ ] Verify officials are present and assigned
- [ ] Test PA system
- [ ] Confirm medical personnel is on-site
- [ ] Brief all staff and volunteers (10-min morning meeting)

**During Tournament**
- [ ] Monitor schedule adherence (games running on time?)
- [ ] Track scores in real time
- [ ] Handle disputes according to published protest procedure
- [ ] Monitor weather \u2014 have lightning/rain protocol ready

**Closing**
- [ ] Award ceremony \u2014 all finalists, not just champions
- [ ] Distribute all-tournament team/MVP awards
- [ ] Collect all equipment, nets, goals
- [ ] Thank officials, volunteers, and vendors

---

### \ud83d\udce7 Post-Tournament (Within 3 Days)

- [ ] Send thank-you emails to all participants
- [ ] Post final results and standings
- [ ] Process vendor payments
- [ ] Complete incident reports (if any)
- [ ] Send post-tournament survey to coaches and parents
- [ ] Document lessons learned for next year`,
    },
  },
  {
    id: 'eap-1',
    title: 'Emergency Action Plan Template',
    description: 'A ready-to-use EAP template for sports programs. Covers emergency contacts, medical procedures, AED locations, and evacuation protocols.',
    type: 'emergency-action-plan',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 632,
    isFeatured: true,
    isVideo: false,
    tags: ['emergency', 'safety', 'EAP', 'medical', 'required'],
    createdAt: '2026-02-15',
    content: {
      overview: 'A legally sound Emergency Action Plan template every sports program should have in place before the first practice.',
      body: `## Emergency Action Plan (EAP) Template

> **This is a template. Have your EAP reviewed by a certified athletic trainer or medical professional before using.**

---

### Organization Information

- **Organization Name:** _______________________
- **Primary Venue:** _______________________
- **Address:** _______________________
- **Emergency Contact (Primary):** _______________________ | Phone: _______
- **Emergency Contact (Backup):** _______________________ | Phone: _______

---

### Step 1: Activate EMS

**If a serious injury or medical emergency occurs:**

1. **Call 911 immediately** \u2014 do not delay
2. Give dispatcher:
   - Exact location (address + specific field number)
   - Nature of emergency
   - Number of injured persons
   - Your name and callback number
3. Send someone to the main entrance to **direct paramedics** to the scene
4. Do not move the injured person unless there is immediate danger

---

### Step 2: Provide Care

**Trained personnel should:**
- Check scene safety first (don\u2019t become a victim)
- Assess consciousness: tap shoulders, call name
- If unconscious and not breathing: Begin CPR
- If AED is available and needed: Use it immediately

**AED Location at [Venue Name]:**
___________________________________ (Be specific: \u201cnorth wall of gymnasium, 6 feet left of exit door\u201d)

---

### Step 3: Notify

Once EMS is en route:
- Notify head coach or program director
- Notify parent/guardian of injured athlete
- Do NOT share details with media or bystanders

---

### Venue-Specific Information

| Venue | AED Location | Nearest Hospital | Distance |
|-------|-------------|-----------------|---------|
| Main Field | Concession stand, east wall | [Hospital Name] | X miles |
| Gymnasium | Lobby, near entrance | [Hospital Name] | X miles |

---

### Common Scenarios

**Heat Illness**
- Move to shade or air conditioning immediately
- Apply ice packs to neck, armpits, groin
- Give cold water if conscious
- Call 911 if altered mental status or not improving in 10 minutes

**Suspected Concussion**
- Remove from play immediately \u2014 **no return same day**
- Do not leave alone
- Follow your league\u2019s concussion protocol
- Require medical clearance before return

**Cardiac Emergency**
- Call 911 immediately
- Begin CPR if trained
- Get AED \u2014 every minute without defibrillation = 10% lower survival rate

---

### Annual Review

This EAP should be reviewed and updated:
- At the start of every season
- After any incident that required its use
- When venue information changes

**Last Review Date:** _______________________
**Reviewed By:** _______________________`,
    },
  },

  // ─── PARENT COMMUNICATION ─────────────────────────────────────────────────
  {
    id: 'pc-1',
    title: 'Parent Communication Templates Pack',
    description: 'Pre-written email and message templates for coaches \u2014 injury updates, schedule changes, season kickoff, game-day logistics, and end-of-season letters.',
    type: 'parent-communication',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 578,
    isFeatured: false,
    isVideo: false,
    tags: ['parents', 'communication', 'templates', 'email'],
    createdAt: '2026-03-30',
    content: {
      overview: 'A complete pack of parent communication templates that save coaches hours every week.',
      body: `## Parent Communication Templates Pack

*Copy, customize, and send. These templates are designed to be professional, warm, and time-efficient.*

---

### \ud83d\udc4b Template 1: Season Kickoff Welcome

**Subject:** Welcome to [Team Name] \u2014 [Season] Season!

---

Dear [Parent/Guardian Name],

Welcome to the [Year] [Sport] season with [Team Name]! We\u2019re excited to have [Player Name] on our roster and can\u2019t wait to get the season started.

**Key Details:**
- First Practice: [Date] at [Time], [Location]
- Uniform Pick-Up: [Date/Details]
- Season Schedule: [Link or attachment]
- Required Paperwork: Please complete by [Date] \u2192 [Link]

**Our Communication Policy:**
- Game reminders: 48 hours before each game
- Schedule changes: ASAP via [The Squad App / email / text]
- Coaching concerns: Email me directly at [email]

I look forward to a great season. Please don\u2019t hesitate to reach out with any questions.

Go [Team Name]!

[Coach Name]

---

### \ud83e\ude79 Template 2: Injury Notification

**Subject:** Important \u2014 [Player Name] Injury Update

---

Dear [Parent/Guardian Name],

I wanted to reach out immediately about a situation during [today\u2019s practice / [Date]\u2019s game].

[Player Name] experienced a [brief description of injury, e.g., \u201croll of the left ankle\u201d] during [describe situation]. We responded by [describe what you did: removed from play, applied ice, etc.].

[Player Name]\u2019s condition when they left our supervision: [Stable / Under parent care].

**Next steps:**
- We recommend having [Player Name] evaluated by a medical professional
- Please inform me of any medical advice received
- We will modify [Player Name]\u2019s participation based on your doctor\u2019s guidance

Please don\u2019t hesitate to call me directly at [phone number] with any questions.

Sincerely,
[Coach Name]

---

### \u23f0 Template 3: Schedule Change Notification

**Subject:** \u26a0\ufe0f Schedule Change \u2014 [Date] Game/Practice

---

Hi [Team Name] families,

There has been a change to our scheduled [game/practice] on [Original Date].

**UPDATED INFORMATION:**
- New Date/Time: [New Date and Time]
- Location: [Same / New Location]
- Reason for change: [Brief explanation]

I apologize for any inconvenience this causes. Please update your calendars and let me know if this creates a conflict for [Player Name].

Thank you for your flexibility!

[Coach Name]

---

### \ud83c\udfc1 Template 4: Post-Season Thank You

**Subject:** Thank You \u2014 An Amazing [Season] Season!

---

Dear [Player Name]\u2019s Family,

What a season! I wanted to take a moment to thank you for everything you did to make this year possible.

**Season Highlights:**
- Final Record: [W-L]
- Team Achievements: [Awards, milestones]
- Individual Highlight for [Player Name]: [Specific, genuine observation]

Having [Player Name] on this team was a privilege. [One sincere, specific sentence about the player\u2019s growth or contribution].

Thank you for your time, support, and positive energy throughout the season. Families like yours make coaching worthwhile.

Until next season,
[Coach Name]

---

### \ud83d\udccc Template 5: Game Day Reminder

**Subject:** \ud83c\udfc6 Game Day Reminder \u2014 [Team Name] vs. [Opponent]

---

Reminder: We have a game tomorrow!

\ud83d\udccd **Location:** [Venue, Address]
\u23f0 **Arrive by:** [Time \u2014 30 min before game]
\ud83c\udfc6 **Game Time:** [Time]
\ud83d\udc55 **Uniform:** [Color] jersey + [Color] shorts

\ud83c\udf50 Please bring water, snacks, and a positive attitude!

See you on the [field/court/diamond]!

\u2014 Coach [Name]`,
    },
  },

  // ─── VOLUNTEER GUIDES ─────────────────────────────────────────────────────
  {
    id: 'vg-1',
    title: 'Volunteer Onboarding Guide',
    description: 'A complete guide to onboarding new volunteers \u2014 roles and responsibilities, training requirements, communication protocols, and appreciation strategies.',
    type: 'volunteer-guide',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 521,
    isFeatured: false,
    isVideo: false,
    tags: ['volunteers', 'onboarding', 'roles', 'retention'],
    createdAt: '2026-04-05',
    content: {
      overview: 'Everything you need to onboard, train, and retain great volunteers for your sports program.',
      body: `## Volunteer Onboarding Guide

*Your volunteers are the backbone of your program. Treat their time as the gift it is.*

---

### Step 1: Define the Roles Before You Recruit

Never recruit before you know exactly what you need. Common volunteer roles in sports programs:

| Role | Time Commitment | Skills Required |
|------|----------------|-----------------|
| Assistant Coach | 4\u20138 hrs/week | Coaching experience preferred |
| Team Manager | 2\u20134 hrs/week | Organized, good communicator |
| Scorekeeper | Game days only | Attention to detail |
| Concessions Volunteer | Game days only | None |
| First Aid Volunteer | Game days only | First aid certification required |
| Social Media Coordinator | 2\u20133 hrs/week | Social media experience |

---

### Step 2: The Volunteer Application Process

**Even for casual volunteers, have a brief process:**

1. Online application (name, contact, availability, skills)
2. Background check (required for any role with minor athlete contact)
3. Brief orientation meeting (in-person or video call)
4. Orientation packet review and sign-off

---

### Step 3: Orientation Packet Contents

Every new volunteer should receive:
- [ ] Welcome letter from the program director
- [ ] Volunteer code of conduct (require signature)
- [ ] Role description with specific responsibilities
- [ ] Key contacts list (who to call for what)
- [ ] Season calendar
- [ ] Communication tools (team app, WhatsApp group, etc.)
- [ ] Safeguarding / child protection policy

---

### Step 4: The First Month

**Week 1:** Pair new volunteers with experienced ones. Never throw someone in alone.

**Week 2:** Check-in conversation: How is it going? Any concerns?

**Month 1 end:** Brief evaluation \u2014 is this a good fit for both sides?

---

### Step 5: Volunteer Appreciation

Volunteers leave when they feel taken for granted. Prevention strategies:

1. **Say thank you publicly** \u2014 at events, on social media, in newsletters
2. **Give them ownership** \u2014 let good volunteers take on more responsibility
3. **Recognize milestones** \u2014 years of service, hours contributed
4. **Celebrate at season end** \u2014 volunteer appreciation dinner or event
5. **Ask for feedback** \u2014 the best volunteers will tell you how to improve

---

### Retention Formula

> *Fair + Appreciated + Empowered = Volunteer who comes back next season*`,
    },
  },

  // ─── COACH MEETING AGENDAS ────────────────────────────────────────────────
  {
    id: 'cma-1',
    title: 'Parent Meeting Agenda Template',
    description: 'Structure your first parent meeting with a professional agenda covering team expectations, communication protocols, volunteer roles, and season calendar.',
    type: 'coach-meeting-agenda',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 578,
    isFeatured: false,
    isVideo: false,
    tags: ['parent-meeting', 'agenda', 'expectations', 'communication'],
    createdAt: '2026-03-15',
    content: {
      overview: 'Run a professional first parent meeting that sets the right tone for the entire season.',
      body: `## Parent Meeting Agenda Template

**Meeting Duration:** 45\u201360 minutes
**Recommended Timing:** 1\u20132 weeks before the season starts
**Location:** [Venue or Virtual]

---

### Pre-Meeting Prep

- [ ] Send calendar invite with video link (if virtual) 3 weeks ahead
- [ ] Prepare handouts: season calendar, contact info, team handbook
- [ ] Set up name tags for in-person meetings
- [ ] Prepare a sign-in sheet for contact information updates

---

### Agenda

**0:00\u20130:05 \u2014 Welcome and Introductions (5 min)**

- Coach introduces themselves: name, background, coaching philosophy
- Assistant coaches introduce themselves
- Have parents briefly introduce themselves (for small groups <20)

---

**0:05\u20130:15 \u2014 Program Overview (10 min)**

- Season dates, schedule overview
- Tournament/championship dates
- Typical practice format and length
- Playing time philosophy (explain your approach clearly here)

---

**0:15\u20130:25 \u2014 Team Expectations (10 min)**

*For players:*
- Attendance policy
- Effort and attitude expectations
- Uniform and equipment requirements

*For parents:*
- Sideline behavior expectations
- How to communicate with coaches (and when)
- Travel/away game policies and responsibilities

---

**0:25\u20130:35 \u2014 Communication Plan (10 min)**

- Primary communication channel (The Squad app, email, text group)
- Response time expectations
- Game day communication timeline (48-hour reminders, etc.)
- How to handle emergencies or urgent situations

---

**0:35\u20130:45 \u2014 Volunteer Needs (10 min)**

- Roles available: team manager, scorekeeper, snack coordinator, etc.
- Background check requirement explanation
- Sign-up sheet

---

**0:45\u20130:55 \u2014 Questions and Concerns (10 min)**

- Open floor for questions
- Address common concerns proactively (playing time, conflicts, etc.)

---

**0:55\u20131:00 \u2014 Closing (5 min)**

- Thank parents for their time
- Remind them to download [The Squad / team app]
- Give out written materials
- Announce first practice date

---

### Coaching Tips for the Meeting

> *The first parent meeting sets the entire tone. Confident, organized, and warm.*

1. Start and end on time \u2014 this signals respect for everyone\u2019s time
2. Have written materials. Parents trust coaches who are prepared.
3. Address playing time philosophy proactively \u2014 don\u2019t wait for the question
4. Never speak negatively about other coaches, teams, or officials`,
    },
  },
  {
    id: 'cma-2',
    title: 'Staff Pre-Season Meeting Agenda',
    description: 'A structured agenda for your coaching staff pre-season meeting to align on goals, roles, communication, and team philosophy.',
    type: 'coach-meeting-agenda',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 312,
    isFeatured: false,
    isVideo: false,
    tags: ['staff', 'pre-season', 'coaching-staff', 'alignment'],
    createdAt: '2026-04-25',
    content: {
      overview: 'Get your entire coaching staff on the same page before the season starts.',
      body: `## Staff Pre-Season Meeting Agenda

**Duration:** 90 minutes | **Attendees:** All coaches and staff

---

### 1. Season Goals (20 min)

- Review previous season outcomes
- Set measurable team goals for this season (wins, development markers, culture)
- Set individual development goals for 3\u20135 key players
- Align on what \u201csuccess\u201d looks like at the end of the season

---

### 2. Roles and Responsibilities (15 min)

Define clearly who owns what:

| Role | Owner |
|------|-------|
| Head Coach | [Name] |
| Offense Coordinator | [Name] |
| Defense Coordinator | [Name] |
| Player Relations | [Name] |
| Team Manager / Admin | [Name] |
| Medical Liaison | [Name] |

---

### 3. Coaching Philosophy Review (15 min)

- What is our identity as a coaching staff?
- How do we handle player conflict or discipline?
- What is our playing time philosophy?
- How do we communicate with each other during games?

---

### 4. Practice Structure Agreement (15 min)

- Standard practice format (warm-up, skill, tactical, scrimmage, debrief)
- Who runs each section?
- How do we handle player who misses practice without notice?

---

### 5. Parent Communication Protocol (10 min)

- One voice policy: parents contact head coach first
- Staff do not discuss playing time with parents
- Agreed response time for messages

---

### 6. Open Issues and Planning (15 min)

- Equipment needs
- Scheduling conflicts
- Budget items

---

### Closing

- Set next staff meeting date
- Confirm communication channel for staff (group chat, email, etc.)`,
    },
  },

  // ─── LINEUP TEMPLATES ─────────────────────────────────────────────────────
  {
    id: 'lt-1',
    title: 'Baseball/Softball Lineup Card Template',
    description: 'Print-ready lineup card for 9-12 player rosters. Includes position tracking, batting order, and substitution sections.',
    type: 'lineup-template',
    sport: 'Baseball',
    difficulty: 'beginner',
    downloadCount: 445,
    isFeatured: false,
    isVideo: false,
    tags: ['baseball', 'softball', 'lineup', 'template', 'print'],
    createdAt: '2026-04-08',
    content: {
      overview: 'A clean, print-ready lineup card that works for baseball and softball at any level.',
      body: `## Baseball/Softball Lineup Card

### Before the Game \u2014 Coach Instructions

1. Fill in your starting lineup in batting order (1\u20139 or 1\u201310 for DH)
2. Note each player\u2019s defensive position (P, C, 1B, 2B, SS, 3B, LF, CF, RF, DH)
3. List available substitutes at the bottom
4. Exchange with umpire at home plate meeting

---

### Lineup Card Format

**Team:** __________________ | **Date:** ____________ | **Opponent:** __________________

| # | Player Name | Position | Notes |
|---|-------------|----------|-------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |

**Starting Pitcher:** ___________________ | **Warm-Up Throws Available:** ___

---

### Substitutes Available

| Player | Position | Notes |
|--------|----------|-------|
| | | |
| | | |
| | | |

---

### Pitching Plan

| Pitcher | Max Pitch Count | Trigger Inning |
|---------|----------------|----------------|
| Starter | | |
| Reliever 1 | | |
| Closer | | |

---

### Rule Reminders for Coaches

- Notify umpire of all substitutions immediately
- Batting out of order = appeal play \u2014 know your order!
- Pitcher re-entry rules vary by age/league \u2014 check local rules`,
    },
  },

  // ─── FUNDRAISING ──────────────────────────────────────────────────────────
  {
    id: 'fi-1',
    title: 'Sports Program Fundraising Playbook',
    description: '10 proven fundraising strategies for youth and recreational sports programs, from sponsorships to events to digital campaigns.',
    type: 'fundraising-ideas',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 489,
    isFeatured: false,
    isVideo: false,
    tags: ['fundraising', 'sponsorship', 'budget', 'revenue'],
    createdAt: '2026-05-10',
    content: {
      overview: 'Ten proven fundraising strategies specifically designed for sports programs.',
      body: `## Sports Program Fundraising Playbook

*The programs that struggle financially are usually the ones that rely on a single revenue source. Diversify.*

---

### Strategy 1: Local Business Sponsorships

**Potential Revenue:** $500\u2013$10,000+ per season

This is the highest ROI fundraising activity for most programs.

**How to approach it:**
1. Identify 20 local businesses within 5 miles of your venue
2. Create a simple sponsorship menu with clear benefits at each level:
   - **Bronze ($250):** Name on team schedule handout
   - **Silver ($500):** Logo on team banner
   - **Gold ($1,000):** Logo on jerseys + banner + social media mentions
3. Send a one-page sponsorship proposal (personalized, not generic)
4. Follow up with a phone call 5\u20137 days later

**Best prospects:** Restaurants, sports goods stores, medical/dental practices, insurance agents, real estate agents

---

### Strategy 2: Tournament as a Fundraiser

**Potential Revenue:** $2,000\u2013$20,000+

Host a tournament and charge entry fees. Your net profit depends on venue cost and format.

**Basic formula:**
- Entry fee per team: $150\u2013$400
- 16 teams \xd7 $200 = $3,200 gross
- Venue cost: $500\u2013$1,000
- Official fees: $600\u2013$800
- **Net: $1,400\u2013$2,100**

---

### Strategy 3: Spirit Wear Campaign

**Potential Revenue:** $500\u20132,000

Partner with a local screen printer or use a print-on-demand service (Printful, Custom Ink).

- Set a minimum order (40 pieces) to get bulk pricing
- Offer 2\u20133 items (t-shirt, hoodie, hat)
- Allow pre-orders only \u2014 eliminates inventory risk
- Profit margin: $5\u201315 per item

---

### Strategy 4: Give-A-Thon (Online Fundraiser)

**Potential Revenue:** $500\u20135,000

Players ask their networks to donate online (GoFundMe, Mightycause, or your league platform).

**Keys to success:**
- Set a clear, specific goal (\u201cWe\u2019re raising $3,000 for new equipment\u201d)
- Tell a story \u2014 why does this program matter?
- Share players\u2019 fundraising pages on social media
- Set a 2-week campaign window (urgency drives action)

---

### Strategy 5: Concession Stand

**Potential Revenue:** $200\u2013$800 per game day

Run your own concessions at home games:
- Keep menu simple (3\u20135 items)
- Volunteer-run by parents (rotate duties)
- Pre-negotiate with venue on any split agreement

**Best sellers:** Hot dogs, nachos, popcorn, sports drinks, candy

---

### Strategies 6\u201310 (Summary)

6. **Raffle:** $5\u201310 tickets for donated prizes. Easy, low-effort.
7. **Restaurant Night:** Partner with a local restaurant for a % of sales night
8. **Car Wash:** Classic, but effective for youth programs ($300\u2013$800/day)
9. **Grant Writing:** USOC, local community foundations often fund youth sports
10. **Alumni Network:** Contact former players and families for annual donations

---

### Annual Fundraising Calendar

| Month | Activity |
|-------|----------|
| January | Sponsor outreach begins |
| March | Spirit wear pre-order |
| April | Car wash / community event |
| June | Tournament (if hosting) |
| August | Give-a-thon campaign |
| October | Season-end raffle |`,
    },
  },

  // ─── EQUIPMENT LISTS ──────────────────────────────────────────────────────
  {
    id: 'el-1',
    title: 'Team Equipment Inventory Checklist',
    description: 'A complete equipment checklist for sports programs \u2014 organize, track, and manage your gear from pre-season through storage.',
    type: 'equipment-list',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 356,
    isFeatured: false,
    isVideo: false,
    tags: ['equipment', 'inventory', 'management', 'checklist'],
    createdAt: '2026-05-15',
    content: {
      overview: 'Never lose track of team equipment again with this comprehensive inventory system.',
      body: `## Team Equipment Inventory Checklist

*A $200 lost bag of gear every season adds up to thousands over a program\u2019s lifetime. Track everything.*

---

### Pre-Season Equipment Audit

**Step 1: Complete inventory before any equipment is distributed**

| Item | Quantity Owned | Condition (1\u20135) | Assigned To | Notes |
|------|---------------|-------------------|-------------|-------|
| Game Balls | | | | |
| Practice Balls | | | | |
| Pinnies/Bibs | | | | |
| Cones | | | | |
| Goals/Nets | | | | |
| First Aid Kit | | | | |
| Team Bags | | | | |

---

### Player Equipment Assignment Form

Each player should sign for any equipment assigned to them:

**Player Name:** ___________________ | **Jersey #:** ___
**Equipment Issued:**
- [ ] Jersey: Size ___
- [ ] Shorts: Size ___
- [ ] Practice pinnie: Color ___
- [ ] Other: _______________

*Player signature acknowledges responsibility for returned equipment.*

**Signature:** ___________________ | **Date:** ___________

---

### Season-End Return Checklist

- [ ] All jerseys collected and washed
- [ ] All practice pinnies returned
- [ ] Balls inventoried and deflated for storage
- [ ] Cones counted and stored
- [ ] Bag equipment returned
- [ ] First aid kit restocked

**Missing equipment report:** Player name \u2014 item \u2014 replacement cost

---

### Equipment Replacement Budget Planning

| Item | Cost to Replace | Replace Every |
|------|----------------|---------------|
| Match ball | $80\u2013$150 | 2\u20133 seasons |
| Practice ball | $25\u201340 | 1\u20132 seasons |
| Pinnies | $8\u201312 each | 3\u20134 seasons |
| Cones | $20\u201330/set | 4\u20135 seasons |
| First Aid Kit | $40\u201375 | Annual restock |

---

### Storage Best Practices

1. **Ball bag + pump:** Keep together in same storage location
2. **Deflate balls for off-season storage** \u2014 maintains bladder health
3. **Label everything** with your program\u2019s name (permanent marker)
4. **Climate-controlled storage preferred** for leather/premium equipment`,
    },
  },

  // ─── TRAVEL CHECKLISTS ────────────────────────────────────────────────────
  {
    id: 'trc-1',
    title: 'Travel Tournament Packing Checklist',
    description: 'Everything your team needs to pack and prepare for travel tournaments \u2014 equipment, medical, administrative, and family sections.',
    type: 'travel-checklist',
    sport: 'General',
    difficulty: 'beginner',
    downloadCount: 398,
    isFeatured: false,
    isVideo: false,
    tags: ['travel', 'tournament', 'packing', 'checklist'],
    createdAt: '2026-06-01',
    content: {
      overview: 'A comprehensive pre-travel checklist so nothing gets left at home.',
      body: `## Travel Tournament Packing Checklist

*The team that arrives organized has already won the first battle.*

---

### \ud83d\udc55 Uniforms & Apparel

- [ ] Game jersey (home AND away if applicable)
- [ ] Practice/training gear (1 set per practice day)
- [ ] Warm-up jacket and pants
- [ ] Sport-specific footwear (game + practice if different)
- [ ] Extra socks (at least 2 pairs per game day)
- [ ] Rain gear if outdoor event
- [ ] Team spirit wear / travel uniform

---

### \u26bd Equipment

- [ ] Personal equipment bag fully packed
- [ ] Sport-specific gear (pads, gloves, bat, stick, etc.)
- [ ] Water bottle (large, insulated \u2014 one per player)
- [ ] Snack bag (enough for 2 days minimum)
- [ ] Recovery items: foam roller, resistance bands, lacrosse ball

---

### \ud83e\ude7a Medical & Personal

- [ ] Prescription medications with extra supply (+3 days)
- [ ] Personal first aid kit: band-aids, ibuprofen, antacid, allergy meds
- [ ] Sunscreen (SPF 50+)
- [ ] Bug spray
- [ ] Athletic tape, blister bandages
- [ ] Ice packs (reusable)
- [ ] Extra contact lenses / glasses

---

### \ud83d\udcbc Administrative (Coach/Manager)

- [ ] Signed medical release forms for all players (physical copies)
- [ ] Emergency contact list (printed, not just on phone)
- [ ] Player ID cards or proof of age (if age-banded tournament)
- [ ] Roster documents (certified if required)
- [ ] Insurance documentation
- [ ] Hotel confirmation numbers
- [ ] Tournament schedule and field maps
- [ ] Cash for tips, emergencies
- [ ] Team credit card or petty cash fund

---

### \ud83c\udfe8 Hotel & Accommodation

- [ ] Book rooms with tournament hotel block (often discounted)
- [ ] Confirm check-in time aligns with arrival
- [ ] Request rooms on same floor for easy supervision
- [ ] Confirm hotel breakfast hours vs. game start times
- [ ] Team rules meeting upon arrival (quiet hours, visitor policy)

---

### \ud83d\ude97 Travel Day Logistics

- [ ] Pre-plan gas stops if driving
- [ ] 2-hour buffer before first game (traffic, registration)
- [ ] Carpool coordination sheet sent to parents
- [ ] Emergency meeting point established if groups get separated

---

### \u2728 Parent Communication Before Departure

Send parents this information at least 1 week before travel:
- Departure time and meeting location
- Hotel name and address
- Tournament schedule and field locations
- Expected return time
- Parent supervision expectations for overnight trips`,
    },
  },


  // ─── VIDEOS ───────────────────────────────────────────────────────────────

  // Soccer: midfielder training — 7mlc channel
  {
    id: 'vid-1',
    title: 'Midfielder Training Session: Scanning, First Touch & Decision Making',
    description: 'A full individual training session built around the technical and cognitive demands placed on midfielders — scanning, first touch under pressure, and split-second decisions.',
    type: 'video',
    sport: 'Soccer',
    difficulty: 'intermediate',
    downloadCount: 1240,
    isFeatured: true,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/SM9ECNPk1sA',
    videoCredit: '7mlc',
    tags: ['soccer', 'midfielder', 'scanning', 'first touch', 'decision making', 'training session'],
    createdAt: '2026-03-15',
    content: {
      overview: 'A complete individual midfielder training session covering scanning habits, first-touch mechanics, and faster decision making under simulated match pressure.',
      body: `## Midfielder Training: Scanning, First Touch & Decision Making

*The most important thing a midfielder can improve is not technical — it's the information they gather before the ball arrives.*

---

### Why Scanning Changes Everything

Elite midfielders scan an average of 0.67 times per second when off the ball. This means that by the time the ball arrives at their feet, they already know:
- Where the pressure is coming from
- Which teammates are available
- Which direction to play

The scanning habit is a coachable skill. It just requires deliberate repetition.

---

### Session Structure (60 Minutes)

**Warm-Up (10 min)**
- Dynamic movement: hip circles, lateral shuffles, carioca
- Ball activation: passing against a rebounder, moving after every touch
- Scanning trigger: call out a number after each touch (builds the habit)

**Technical Block: First Touch Under Pressure (20 min)**
- Rebounder work: receive and redirect in one motion
- Each touch should move the ball in a predetermined direction
- Progress: open body → disguised redirect → blind-side redirect

**Tactical Block: Chaos Drills (20 min)**
- Create drills that simulate match environments (multiple balls, multiple directions)
- The goal: players must make technical decisions at match speed
- Processing speed is the limiting factor at elite level

**Finishing Block (10 min)**
- Transition from midfield receipt → forward pass → support run → finish
- Simulate the link between technical and tactical

---

### The Key Coaching Cue

> "Where are your eyes before the ball arrives?"

If a player receives the ball and *then* looks up, they are already 1-2 seconds behind play. If they arrive with information, the technical execution becomes simple.

---

### Training Frequency

For meaningful improvement in scanning habits:
- Minimum 3 sessions per week
- 15 minutes of scan-trigger practice per session
- Video review of themselves playing (even phone recordings)`,
    },
  },

  // Soccer: leg power & speed — 7mlc channel
  {
    id: 'vid-2',
    title: 'Leg Workout for Footballers: Build Speed & Explosive Power',
    description: 'A full leg workout designed specifically for football (soccer) players to increase first-step speed, explosive power, and injury resilience — no gym membership required.',
    type: 'video',
    sport: 'Soccer',
    difficulty: 'intermediate',
    downloadCount: 874,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/HHVF4K2aFTA',
    videoCredit: '7mlc',
    tags: ['soccer', 'football', 'speed', 'leg workout', 'explosive power', 'conditioning'],
    createdAt: '2026-04-01',
    content: {
      overview: 'A leg strength and power session tailored for footballers — covering explosive jumps, lateral strength, and sport-specific movement patterns.',
      body: `## Leg Workout for Footballers: Build Speed & Explosive Power

*Every elite sprinting action starts from the ground up. Build the engine first.*

---

### Why Leg Power Is Different for Footballers

Footballers don't need maximal strength — they need **reactive strength** and **lateral power**. A deadlift won't replicate a first-step burst. A squat won't replicate a sharp change of direction.

This session uses compound movements and sport-specific patterns that transfer directly to match performance.

---

### Session Structure

**Activation (5–8 min)**
- Glute bridges: 3 × 15 (activate before loading)
- Lateral band walks: 2 × 10 each direction
- Single-leg Romanian deadlift (bodyweight): 2 × 8 each leg

**Explosive Block (15–20 min)**

| Exercise | Sets | Reps | Rest |
|----------|------|------|------|
| Jump squats | 4 | 6 | 90s |
| Box jumps | 4 | 5 | 90s |
| Lateral bounds | 3 | 8 each | 60s |
| Sprint starts (10m) | 4 | 3 | Full |

**Strength Block (15–20 min)**
- Bulgarian split squats: 3 × 8 each leg
- Nordic hamstring curls: 3 × 6 (essential for hamstring injury prevention)
- Step-ups with knee drive: 3 × 10 each leg

**Speed Block (10 min)**
- Agility ladder: 3 patterns × 3 reps each
- Cone slalom (ball at feet): 4 runs

---

### Key Principle: Quality Over Quantity

Every explosive rep should be maximum effort. If quality drops, stop the set. Half-speed training produces half-speed athletes.

---

### Programming Note

Run this session 2× per week in pre-season, dropping to 1× in-season to maintain rather than build. Allow 48 hours minimum between sessions.`,
    },
  },

  // Soccer: dribbling one-v-ones — 7mlc channel
  {
    id: 'vid-3',
    title: 'How to Dominate 1v1s: Three Keys to Elite Dribbling',
    description: 'Three simple, high-leverage principles that separate elite dribblers from average ones — and how to train them into your game through deliberate solo sessions.',
    type: 'video',
    sport: 'Soccer',
    difficulty: 'intermediate',
    downloadCount: 2130,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/6Px5YfwvpkM',
    videoCredit: '7mlc',
    tags: ['soccer', 'dribbling', 'one v one', '1v1', 'individual training', 'skill development'],
    createdAt: '2026-02-20',
    content: {
      overview: 'Mastering 1v1 situations requires a small number of well-practiced principles applied consistently. This session breaks them down and shows you how to train them.',
      body: `## How to Dominate 1v1s: Three Keys to Elite Dribbling

*You don't need 30 moves. You need 3 moves that you own completely.*

---

### The 1v1 Reality Check

Watch any elite dribbler and you'll notice they use a small repertoire of moves — but they execute them perfectly, at full speed, in both directions, under pressure. Breadth of skill is less important than depth of execution.

---

### Key 1: Body Shape Before the Move

Before you perform any dribbling technique, your body position sends a signal to the defender about where you're going. Elite dribblers use an **open body shape** to create ambiguity:
- Hips at 45°, not fully square
- Ball slightly out of reach
- Eyes scanning — not fixed on the ball

**Drill:** Practice receiving every pass with an open body shape. Do this 50 times per session until it's automatic.

---

### Key 2: Timing the Defender's Weight

The best moment to beat a defender is the split second their weight is shifting the wrong way. This means:
1. Draw them forward (fake a pass or look away)
2. Wait for the weight shift
3. Explode past in the space they've vacated

You cannot rush this. The dribble itself is not the skill — **reading the defender is the skill.**

---

### Key 3: First Touch After the Move

Where you put the ball after the move determines whether you escape or get tackled from behind. The touch after the move should:
- Be ahead (2–3 yards) into open space
- Angle you toward goal or toward open teammates
- Allow you to accelerate without breaking stride

**Drill:** Cone → dummy → touch forward → sprint 10 yards. Repeat 15 times each side.

---

### Solo Training Application

You can train all three keys without a partner:
1. Rebounder receives → practice open body receive
2. Cone slalom with weight transfer at each gate
3. Full speed run-through with finishing touch`,
    },
  },

  // Volleyball: blocking footwork — AoCVB (Art of Coaching Volleyball)
  {
    id: 'vid-4',
    title: 'Middle Blocker Footwork: The Two-Step Blocking Technique',
    description: 'Volleyball coach Jim Stone breaks down the two-step crossover blocking footwork for middle blockers facing fast sets — from the turn step through to the single-leg jump.',
    type: 'video',
    sport: 'Volleyball',
    difficulty: 'advanced',
    downloadCount: 688,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/BodeaYnXKbU',
    videoCredit: 'The Art of Coaching Volleyball',
    tags: ['volleyball', 'blocking', 'middle blocker', 'footwork', 'technique', 'advanced'],
    createdAt: '2026-01-10',
    content: {
      overview: 'The two-step blocking approach is used by advanced middle blockers when a fast set leaves insufficient time for a full crossover. Learn the mechanics, jump timing, and hand shaping.',
      body: `## Middle Blocker Footwork: The Two-Step Blocking Technique

*When the set is fast, every step counts. Here's how elite middles still get there.*

---

### When to Use the Two-Step Approach

Standard blocking footwork (3-step crossover) works well on medium and slow sets. Against a fast set to the quick or slide, the middle blocker is often late and needs a shorter, more direct path.

The two-step approach sacrifices some coverage for speed. Used correctly, the blocker arrives on time with proper hand position.

---

### The Mechanics

**Step 1: Turn Step**
- Plant the outside foot
- Turn the hips toward the target
- This step covers lateral distance quickly

**Step 2: Crossover**
- Bring the inside leg across the body
- Stay low — don't rise on this step
- Eyes on the setter's hands

**Jump: Single-Leg Takeoff**
- Because the blocker is late, the approach is short
- Jump from the crossover leg
- Drive the arms up and forward aggressively

---

### Hand Positioning on the Fast Set

Because the blocker arrives late:
- Hands must push slightly outside the body line to reach the ball
- Turn hands inward — this is "shaping" the ball
- Curvature directs the block back to the center of the court

If hands are flat (perpendicular to the net), the ball deflects out of bounds. Shaped hands keep the ball in play.

---

### Coaching the Technique

**Common mistakes:**
1. Taking too big a turn step (loses lateral speed)
2. Rising on the crossover (reduces control at jump)
3. Flat hands (block goes out)

**Progression:**
1. Slow walk-through with verbal cues
2. Half-speed with shadowing (no ball)
3. Full speed with a tossed ball
4. Live practice against the setter`,
    },
  },

  // Volleyball: warmup drill — AoCVB
  {
    id: 'vid-5',
    title: 'Dynamic Warm-Up Drill: 6v6 With Hot Hitter',
    description: 'A game-like team warm-up drill from coach Tod Mattox that focuses on middle transition, passing, and competitive readiness — a smarter alternative to static stretching and passive passing lines.',
    type: 'video',
    sport: 'Volleyball',
    difficulty: 'intermediate',
    downloadCount: 540,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/-nspljeyz68',
    videoCredit: 'The Art of Coaching Volleyball',
    tags: ['volleyball', 'warm-up', 'team drill', 'transition', '6v6', 'middle', 'practice'],
    createdAt: '2026-02-05',
    content: {
      overview: 'Replace passive warm-up routines with this active 6v6 game-like drill that gets players physically and mentally ready for practice while training transition and decision-making.',
      body: `## Dynamic Warm-Up Drill: 6v6 With Hot Hitter

*A warm-up should prepare athletes to compete — not just elevate their heart rate.*

---

### Why This Drill Works

Traditional warm-ups (passing lines, static stretching, tossed balls) don't prepare players for the chaotic, decision-heavy environment of a game. This drill from coach Tod Mattox solves that by placing players in a live game structure from the first minute of practice.

The result: players arrive at the technical portion of practice already dialed in — not still waking up.

---

### Setup

- Two full teams of 6
- One team has a designated **hot hitter** — a middle who is the only player allowed to take a full swing
- Coach enters the ball from the sideline

---

### How It Works

**Round 1: Team with Hot Hitter Receives**
1. Coach tosses ball to the hot-hitter side
2. They pass, set, and the middle swings
3. The opposing team's only goal: get the ball back in play with a controlled pass

**Defending Team Rules**
- No blocking (keeps the drill moving)
- Immediate transition after receiving the hit
- They work on reading the attack angle and moving quickly

**Scoring**
- Rotate the hot hitter role every 3 minutes
- Play to 7 points, winner serves

---

### Coaching Focus Points

- **Passers:** Are they reading the middle's approach and moving early?
- **Setter:** Is the set consistent enough to be attacked at full speed?
- **Middle:** Is the approach clean, even in warm-up conditions?

---

### Variation: Rotate Hot Hitter

Instead of one player being the permanent hot hitter, rotate by position on each play. This trains all players to be ready to attack off a quick first ball.`,
    },
  },

  // Basketball: top 10 drills solo — One Up Basketball
  {
    id: 'vid-6',
    title: 'Top 10 Basketball Drills to Do By Yourself',
    description: 'If you could only pick 10 drills to do alone, these are the ones — efficient combo drills focusing on the skills that happen most often in games. Ideal for players who want to improve fast with limited time.',
    type: 'video',
    sport: 'Basketball',
    difficulty: 'beginner',
    downloadCount: 3120,
    isFeatured: true,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/HLHhVyiOExA',
    videoCredit: 'One Up Basketball',
    tags: ['basketball', 'solo drills', 'ball handling', 'individual training', 'beginner', 'youth'],
    createdAt: '2026-01-20',
    content: {
      overview: 'A focused selection of the 10 most effective basketball drills for solo practice — combining efficiency with game-realistic skill development.',
      body: `## Top 10 Basketball Drills to Do By Yourself

*If you want to improve fast in a short amount of time, you need to prioritize drills that train the skills that happen most often in games.*

---

### The Solo Practice Principle

Too many players spend time on flashy moves they'll never use. Elite players focus their solo work on:
1. **Ball handling** — because you need it every possession
2. **Finishing** — because you'll attack the rim on every drive
3. **Shooting** — because every offensive play ends with a shot attempt

These 10 drills cover all three categories with combinations that replicate game scenarios.

---

### The 10 Drills

**Ball Handling**
1. **Two-ball dribble series** — pound, alternate, crossover, through-legs (2 min)
2. **Figure-8 with speed variation** — slow, medium, then max speed (90 sec)
3. **Cone slalom** — dribble through 5 cones with a change of direction at each (3 × 3)

**Finishing**
4. **Mikan drill** — continuous layup alternating hands (2 min)
5. **Euro step layup** — from the wing, full speed, both sides (10 each)
6. **Floater series** — mid-range from both sides of the lane (15 each)

**Shooting**
7. **Catch-and-shoot spots** — 5 spots around the arc, 3 shots each (without moving)
8. **Off-the-dribble pull-up** — one dribble, pull-up jumper (10 each side)
9. **Corner three after sprint** — sprint the baseline, catch, shoot (10 each)

**Combo (Game-Realistic)**
10. **Drive → Kick → Relocate → Shoot** — simulate the most common offensive sequence

---

### Tips for Solo Practice

- **Eyes up** at all times during ball handling
- **Pound the ball hard** — lazy dribbles create lazy habits
- **Full speed** on every finishing drill
- Set a timer, not a rep count — this forces consistent pace`,
    },
  },

  // Basketball: skills coaches look for — One Up Basketball
  {
    id: 'vid-7',
    title: 'The 11 Most Important Basketball Skills Coaches Look For',
    description: 'What skills do coaches actually prioritize when selecting teams and starting lineups? Understanding exactly what coaches look for will guide your training and give you the best chance to earn playing time.',
    type: 'video',
    sport: 'Basketball',
    difficulty: 'beginner',
    downloadCount: 1890,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/U9RS9D69_9M',
    videoCredit: 'One Up Basketball',
    tags: ['basketball', 'coaching', 'player development', 'youth', 'skills', 'tryouts'],
    createdAt: '2026-03-10',
    content: {
      overview: "Knowing what coaches look for changes how players train. These 11 skills are what decide who makes teams, who starts, and who gets consistent playing time.",
      body: `## The 11 Basketball Skills Coaches Look For

*Training without knowing what coaches value is like studying the wrong chapters for a test.*

---

### Why This Matters for Coaches

As a coach, you can use this list as a **player evaluation rubric** during tryouts, as a development framework during the season, and as feedback language when talking with players and parents.

When players understand what earns playing time, they practice with more purpose.

---

### The 11 Skills

**1. Coachability**
Do they listen on the first instruction? Adjust their behavior based on feedback? This is the non-negotiable skill every coach values above all others.

**2. Effort and Consistency**
Players who sprint every play — regardless of score or fatigue — are invaluable. Inconsistent effort is the fastest way off the court.

**3. On-Ball Defense**
Can they stay in front of their player? Are their hands active without fouling? Defense is the quickest way to earn trust from a coach.

**4. Communication**
Do they talk on defense? Call out screens? Direct teammates? Quiet players are often overlooked even when they're skilled.

**5. Ball Handling Under Pressure**
Not fancy dribbles — sound ball protection when pressed or guarded closely. Turnover-prone players cannot be trusted in close games.

**6. Basketball IQ**
Do they cut when their defender ball-watches? Do they know where to be without being told? High IQ players make their teammates better.

**7. Finishing at the Rim**
Can they complete drives with contact, both hands, from multiple angles?

**8. Mid-Range Game**
The pull-up jumper and floater are essential tools for scoring inside-out.

**9. Catch-and-Shoot Efficiency**
Open threes. No dribbles. Clean release. If a player can't hit open shots, defenses ignore them.

**10. Rebounding Effort**
Box out every possession. Pursue every loose ball. This is effort-based and immediately visible to coaches.

**11. Unselfish Play**
Do they take good shots or any shots? Do they pass to the open player? Selfishness breaks team chemistry and is spotted immediately.

---

### For Coaches: Evaluation Sheet

During tryouts, rate each player 1–5 on the top 6 skills. You'll find the evaluation process becomes much faster and more consistent.`,
    },
  },

  // Basketball: ball handling passing drills — One Up Basketball
  {
    id: 'vid-8',
    title: '7 Challenging Ball Handling & Passing Drills You Can Do Alone',
    description: 'Seven progressive solo drills combining ball handling and passing skills — done at full speed to build the handles and passing fundamentals that show up in real games.',
    type: 'video',
    sport: 'Basketball',
    difficulty: 'intermediate',
    downloadCount: 1540,
    isFeatured: false,
    isVideo: true,
    videoUrl: 'https://www.youtube.com/embed/3ckHPv9ufn0',
    videoCredit: 'One Up Basketball',
    tags: ['basketball', 'ball handling', 'passing', 'solo drills', 'handles', 'fundamentals'],
    createdAt: '2026-04-15',
    content: {
      overview: 'A progressive set of 7 solo drills combining dribbling and passing fundamentals — designed to be done at full speed so the skills transfer directly to game situations.',
      body: `## 7 Challenging Ball Handling & Passing Drills You Can Do Alone

*Mistakes are OK — that's how you get better. Challenge yourself with these drills.*

---

### The Ground Rules

Before you start:
- **Eyes up** at all times — no looking at the ball
- **Pound the ball hard** — weak dribbles create weak habits
- **Cross the ball as fast as you can** — speed builds speed
- **Full speed** — if you slow down to get through the drill, you're training the wrong speed

These drills are challenging. You're supposed to struggle at first.

---

### The 7-Drill Sequence

**Drill 1 — Pound & Pass** *(10 reps each hand)*
Pound the ball with your right hand, then fire a pass to the wall or rebounder. Receive, switch hands, repeat.

**Drill 2 — Pound, Cross, Pass** *(10 reps each hand)*
Add a crossover before the pass. Stay low on the cross.

**Drill 3 — Pound, Through Legs, Pass** *(10 reps each hand)*
Through-legs dribble, then a sharp pass. The through-legs move must be quick, not slow.

**Drill 4 — Behind Back, Pass** *(10 reps each hand)*
Behind-the-back dribble into a pass. This replicates a real game action — using a behind-back to create a better passing angle.

**Drill 5 — Speed Dribble, Stop, Pass** *(4 reps each direction)*
Full-speed dribble for 10 feet, hard stop, chest pass. This trains the ability to stop under control and make a clean pass.

**Drill 6 — Combo: Cross → Through → Behind → Pass**
All three moves before the pass. This is the hardest drill. 5 reps each starting hand.

**Drill 7 — Eyes-Up Freestyle** *(2 minutes)*
Free dribble — any moves — but your eyes must be fixed on the wall or on a target you pick. Never look down.

---

### Progression

Start at comfortable speed and increase over 2–3 weeks. Once you can complete the sequence without looking down, you've built the foundation for game-speed handle.`,
    },
  },
];

export const RESOURCES_BY_TYPE = {
  'practice-plan': RESOURCES.filter(r => r.type === 'practice-plan'),
  'drill': RESOURCES.filter(r => r.type === 'drill'),
  'season-planner': RESOURCES.filter(r => r.type === 'season-planner'),
  'game-day-checklist': RESOURCES.filter(r => r.type === 'game-day-checklist'),
  'tournament-checklist': RESOURCES.filter(r => r.type === 'tournament-checklist'),
  'emergency-action-plan': RESOURCES.filter(r => r.type === 'emergency-action-plan'),
  'parent-communication': RESOURCES.filter(r => r.type === 'parent-communication'),
  'volunteer-guide': RESOURCES.filter(r => r.type === 'volunteer-guide'),
  'coach-meeting-agenda': RESOURCES.filter(r => r.type === 'coach-meeting-agenda'),
  'lineup-template': RESOURCES.filter(r => r.type === 'lineup-template'),
  'fundraising-ideas': RESOURCES.filter(r => r.type === 'fundraising-ideas'),
  'equipment-list': RESOURCES.filter(r => r.type === 'equipment-list'),
  'travel-checklist': RESOURCES.filter(r => r.type === 'travel-checklist'),
  'video': RESOURCES.filter(r => r.type === 'video'),
};

export const FEATURED_RESOURCES = RESOURCES.filter(r => r.isFeatured);

export function getResourceById(id: string): Resource | undefined {
  return RESOURCES.find(r => r.id === id);
}
