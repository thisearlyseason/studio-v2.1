'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight, Clock, User, Lightbulb, Zap, ChevronRight,
  Dumbbell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeroBanner } from '@/components/sports-hub/HeroBanner';
import { NewsletterSignup } from '@/components/sports-hub/NewsletterSignup';

// ─── Sample Content ────────────────────────────────────────────────────────
const FEATURED_ARTICLE = {
  id: '1',
  title: 'Building a Championship Culture: Leadership Strategies That Actually Work',
  excerpt: 'The difference between good teams and great teams rarely comes down to talent. Discover the proven leadership frameworks that elite coaches use to build cultures of excellence.',
  category: 'Coaching',
  author: { name: 'The Squad Team' },
  readingTime: 8,
  publishedAt: '2026-07-09',
  slug: 'building-championship-culture',
  featuredImage: null,
};

const LATEST_ARTICLES = [
  {
    id: '2', title: 'The 5-Day Practice Plan Formula That Prepares Any Team for Game Day',
    excerpt: 'Stop winging it. Build a structured weekly practice plan that covers physical prep, tactical work, and mental readiness.',
    category: 'Coaching', author: { name: 'Coach Riley' }, readingTime: 6,
    publishedAt: '2026-07-08', slug: 'five-day-practice-plan',
  },
  {
    id: '3', title: 'Tournament Scheduling: How to Run a 32-Team Bracket Without Chaos',
    excerpt: 'From venue logistics to referee scheduling, this is the definitive guide to running a smooth tournament at any level.',
    category: 'Tournament Management', author: { name: 'The Squad Team' }, readingTime: 9,
    publishedAt: '2026-07-07', slug: 'tournament-scheduling-guide',
  },
  {
    id: '4', title: 'Parent Communication Templates That Save Coaches Hours Every Week',
    excerpt: 'Pre-written emails and messages for every situation — injury updates, schedule changes, game-day logistics, and more.',
    category: 'Team Management', author: { name: 'Coach Sarah M.' }, readingTime: 5,
    publishedAt: '2026-07-06', slug: 'parent-communication-templates',
  },
];

const PRODUCT_UPDATES = [
  {
    id: 'pu1', version: 'v2.1', title: 'Sports Hub Launches with 54+ Original Articles',
    description: 'The Squad Sports Hub is live — featuring original, in-depth articles on coaching, team management, tournaments, nutrition, and athlete development.',
    date: '2026-07-10', type: 'New',
  },
  {
    id: 'pu2', version: 'v2.1', title: 'Free Branded PDF Resources Now Available',
    description: 'Every Sports Hub resource can now be downloaded as a branded, print-ready PDF — free for all coaches and program directors.',
    date: '2026-07-10', type: 'Feature',
  },
  {
    id: 'pu3', version: 'v2.0', title: 'Tournament Bracket Generator Updated',
    description: 'Generate single elimination, double elimination, round robin, Swiss, and pool play brackets — now with automatic seeding and tiebreaker rules.',
    date: '2026-06-15', type: 'Improvement',
  },
  {
    id: 'pu4', version: 'v2.0', title: 'Team Roster Management Redesigned',
    description: 'Roster management got a full overhaul — faster player search, bulk imports from CSV, jersey number tracking, and emergency contact fields.',
    date: '2026-06-01', type: 'Improvement',
  },
];

// ─── 365 Coach Tips (rotates daily by day-of-year) ────────────────────────────
const COACH_TIPS: { tip: string; category: string }[] = [
  { tip: "Start every practice with a 5-minute 'energy check.' Ask one athlete to rate team energy 1–10, then challenge them to hit a 9 by warm-up's end.", category: 'Practice Planning' },
  { tip: 'Use the rule of three: every practice should improve three specific skills. If you can\'t name them before players arrive, restructure your plan.', category: 'Practice Planning' },
  { tip: 'Give feedback in the sandwich model: positive → correction → positive. Athletes absorb critique better when it\'s framed by encouragement.', category: 'Communication' },
  { tip: 'Teach athletes to compete against their own best — not just the opponent. Internal benchmarks build resilience that external ones can\'t.', category: 'Player Development' },
  { tip: 'The 10-minute rule: spend 10 minutes after every game writing down what you wish you\'d done differently. It\'s the most underused coaching tool.', category: 'Self-Improvement' },
  { tip: 'Never punish the team for one player\'s mistake. Address discipline individually. Collective punishment destroys trust faster than any loss.', category: 'Leadership' },
  { tip: 'Build in a 2-minute "talk-to-your-teammate" segment mid-practice. Communication skills are physical skills — they need reps too.', category: 'Practice Planning' },
  { tip: 'Use names constantly during practice. Calling athletes by name signals that you see them as individuals, not just players.', category: 'Communication' },
  { tip: 'The best timeout is proactive, not reactive. Call it when you sense momentum shifting — not after you\'ve already lost it.', category: 'Game Strategy' },
  { tip: 'Don\'t overload athletes with corrections. Pick one or two high-leverage adjustments per game. Overcoaching creates hesitation.', category: 'Game Strategy' },
  { tip: 'Schedule a 10-minute "open floor" every two weeks where athletes can ask anything. It builds trust and often surfaces problems early.', category: 'Team Culture' },
  { tip: 'Ask athletes how they learn best at the start of the season. Some respond to visual cues, others to verbal, others to physical demonstration.', category: 'Player Development' },
  { tip: 'Recovery is a skill. Teach athletes how to warm down properly — it\'s as important as any drill in your repertoire.', category: 'Recovery' },
  { tip: 'The most dangerous coaching bias: assuming your best practice performers will be your best game performers. Test it regularly.', category: 'Evaluation' },
  { tip: 'Before criticizing effort, ask yourself: did I make the expectation crystal clear? Most effort problems are actually clarity problems.', category: 'Leadership' },
  { tip: 'Celebrate process, not just results. "That was a perfect defensive rotation" matters more long-term than celebrating the score.', category: 'Team Culture' },
  { tip: 'Hydration affects decision-making before it affects physical performance. Ensure athletes hydrate starting 2 hours before competition.', category: 'Nutrition' },
  { tip: 'Video review works best in small groups of 3–4 athletes. Large group film sessions lead to passive watching, not active learning.', category: 'Coaching Tools' },
  { tip: 'Set a "coachability standard" at the start of the season: what does being coachable look like on your team? Define it explicitly.', category: 'Team Culture' },
  { tip: 'End every practice with a highlight. Have the team call out one great play or effort from a teammate. Ends sessions on a high.', category: 'Practice Planning' },
  { tip: 'Study coaches from different sports. The best tactical ideas often come from cross-sport learning — basketball reads in soccer, swimming intervals in football.', category: 'Self-Improvement' },
  { tip: 'Athletes who understand the "why" behind a drill perform it with more intention. Add a 30-second explanation before each new activity.', category: 'Player Development' },
  { tip: 'The quietest athletes on your roster often have the sharpest observations. Create space for them to contribute — not just the vocal leaders.', category: 'Team Culture' },
  { tip: 'Pre-competition routines reduce anxiety by creating predictability. Help each athlete build their own — music, warmup sequence, mental cues.', category: 'Mental Performance' },
  { tip: 'Plan your practice backward: start with the game situation you want to train, then design activities that build toward it.', category: 'Practice Planning' },
  { tip: 'A coach\'s body language communicates more than words. Athletes read your posture, expression, and energy constantly. Be intentional about all three.', category: 'Communication' },
  { tip: 'Scrimmages without coaching interventions are invaluable. Let athletes problem-solve in real time. Resist the urge to stop play for every teaching moment.', category: 'Practice Planning' },
  { tip: 'The second year is the hardest. Most athletes regress slightly as expectations increase. Anticipate it, normalize it, and plan for it.', category: 'Player Development' },
  { tip: 'Sleep is the most powerful recovery tool available to your athletes — and it\'s free. Track it as seriously as training load.', category: 'Recovery' },
  { tip: 'Peer coaching is underused at every level. Pair stronger and developing athletes for specific drill repetitions — both benefit from the teaching dynamic.', category: 'Player Development' },
  { tip: 'Run a quarterly survey asking athletes: what\'s working, what\'s not working, and what do you wish was different? Act on the responses visibly.', category: 'Team Culture' },
  { tip: 'The athlete who argues with officials the most is often most in need of impulse control training — which is a coachable skill.', category: 'Mental Performance' },
  { tip: 'Write your pre-game speech outline before game day. Winging it rarely produces the clarity and calm you want to project.', category: 'Leadership' },
  { tip: 'Identify your "culture carriers" — the athletes whose behavior other players mirror. Coach them first, and your team culture changes faster.', category: 'Team Culture' },
  { tip: 'Use distance in your coaching. Step back from drills periodically to see the whole picture. Close proximity makes coaches miss patterns.', category: 'Self-Improvement' },
  { tip: 'Every athlete needs to be recognized for something at least once a week. Track it. Some athletes go entire seasons without specific praise.', category: 'Player Development' },
  { tip: 'Nutrition timing matters. Athletes who eat within 30–60 minutes after practice recover significantly faster than those who wait.', category: 'Nutrition' },
  { tip: 'Introduce one new tactical concept per week. More than that and athletes don\'t have time to develop genuine understanding before the next one arrives.', category: 'Game Strategy' },
  { tip: 'A consistent warm-up routine primes athletes neurologically. The ritual itself signals the brain to shift into performance mode.', category: 'Practice Planning' },
  { tip: 'Don\'t mistake volume for quality. Three focused reps with full intention outperform thirty distracted ones every time.', category: 'Practice Planning' },
  { tip: 'Model vulnerability. Coaches who admit mistakes to their team create psychological safety that dramatically increases athlete candor and trust.', category: 'Leadership' },
  { tip: 'Teach athletes to reset between plays, points, or possessions. The mental reset skill is what separates consistent performers from streaky ones.', category: 'Mental Performance' },
  { tip: 'Cross-train your athletes mentally: have them practice a different sport skill occasionally. It develops coordination, prevents burnout, and builds athleticism.', category: 'Player Development' },
  { tip: 'Film your own coaching once a month. You will immediately notice patterns — both strengths and habits to change — that you can\'t see in the moment.', category: 'Self-Improvement' },
  { tip: 'Establish a "two-second rule" for your own emotional reactions on the sideline. Wait two seconds before responding to any frustrating moment.', category: 'Leadership' },
  { tip: 'Create team rituals — handshakes, warmup chants, post-practice traditions. Rituals create identity and belonging that transcend winning and losing.', category: 'Team Culture' },
  { tip: 'Build "decision-making reps" into practice. Athletes need to practice reading situations and choosing responses, not just executing set plays.', category: 'Player Development' },
  { tip: 'The athlete struggling most is often the one learning the fastest. Difficulty is a signal that the challenge level is appropriate.', category: 'Player Development' },
  { tip: 'When giving halftime adjustments, lead with one thing that\'s working before addressing what needs to change. Anchors performance positively.', category: 'Game Strategy' },
  { tip: 'Iron deficiency is the most common nutritional deficiency in female athletes. Ensure adequate dietary iron, especially during growth periods.', category: 'Nutrition' },
  { tip: 'Build an "escalation ladder" for parent conflicts: direct conversation → assistant coach → program director. Publish it at season start.', category: 'Parent Relations' },
  { tip: 'Don\'t coach in the moment of peak emotion — yours or the athlete\'s. Wait for the window of readiness, which usually comes 10–20 minutes later.', category: 'Communication' },
  { tip: 'Overtraining syndrome looks like underperformance. Before concluding an athlete is lazy, check training load, sleep, and nutrition first.', category: 'Recovery' },
  { tip: 'Set "team norms" collectively rather than imposing rules. Athletes who help create standards are far more likely to uphold them.', category: 'Team Culture' },
  { tip: 'Ask athletes "what did you see on that play?" rather than telling them what happened. Forces self-analysis and develops game intelligence faster.', category: 'Coaching Technique' },
  { tip: 'Strength training twice per week produces most of the performance gains of daily training with a fraction of the injury and recovery cost.', category: 'Strength & Conditioning' },
  { tip: 'Send one "I noticed" text or message to a different athlete each week. Specific, observed recognition is far more motivating than general praise.', category: 'Communication' },
  { tip: 'Keep a practice log. Looking back at practices 6 weeks ago tells you more about your program\'s development than any single game can.', category: 'Self-Improvement' },
  { tip: 'Teach athletes to manage their own arousal levels. Some need to calm down before competition; others need to amp up. Both are trainable.', category: 'Mental Performance' },
  { tip: 'The best drill library is worthless if athletes don\'t understand the competitive context for each drill. Connect training explicitly to game situations.', category: 'Practice Planning' },
  { tip: 'Protein synthesis peaks approximately 24–48 hours after strength training. Don\'t schedule competition too close to heavy lifting sessions.', category: 'Nutrition' },
  { tip: 'Build a pre-game checklist for yourself as a coach — not just for the team. Your preparation quality directly determines your sideline quality.', category: 'Self-Improvement' },
  { tip: 'Use the "5:1 ratio": aim for five positive interactions for every corrective one. Research consistently shows this ratio builds optimal learning environments.', category: 'Communication' },
  { tip: 'Create small-sided games that isolate specific skills. 3v3 develops decision-making faster than full 11v11 in most team sports.', category: 'Practice Planning' },
  { tip: 'The athlete who quits always gives you a signal beforehand. Missing practices, short answers, declining energy — learn to recognize the early signs.', category: 'Player Development' },
  { tip: 'Cold water immersion (10–15°C, 10 minutes) after intense sessions meaningfully reduces next-day soreness and speeds return to performance.', category: 'Recovery' },
  { tip: 'Know the difference between acceptable soreness and injury warning signs. Teach this distinction to your athletes explicitly — they shouldn\'t self-manage pain.', category: 'Injury Prevention' },
  { tip: 'Build a "substitute system" for every key role in your program. Single points of failure (one parent volunteer, one official) create avoidable crises.', category: 'Program Management' },
  { tip: 'Don\'t use practice time as punishment. Extra conditioning after practice for behavior issues conflates physical training with negative reinforcement.', category: 'Leadership' },
  { tip: 'Intrinsic motivation outlasts extrinsic by 10 to 1 in long-term sports participation. Help athletes discover personal reasons to compete, beyond trophies.', category: 'Player Development' },
  { tip: 'Create a "coach\'s notebook" for each athlete. Write one observation per week. At season\'s end, you\'ll have the most complete development record on the team.', category: 'Evaluation' },
  { tip: 'High-pressure practice scenarios (trailing by 2 with 2 minutes left) are the only way to develop genuine composure under pressure.', category: 'Mental Performance' },
  { tip: 'If athletes don\'t know why they\'re doing a drill, they can\'t self-correct. Naming the objective out loud before every rep changes engagement immediately.', category: 'Practice Planning' },
  { tip: 'Carbohydrates before training, protein after. This simple nutritional framework improves energy during sessions and recovery afterward for most athletes.', category: 'Nutrition' },
  { tip: 'Use "positive specificity" in praise: not "great job" but "the way you tracked the ball through contact and kept your feet moving — that was excellent."', category: 'Communication' },
  { tip: 'Team chemistry is built in the mundane moments — car rides, pre-game meals, downtime. Don\'t underestimate the culture value of these non-practice environments.', category: 'Team Culture' },
  { tip: 'Breathing control is the most accessible mental performance tool for athletes. Box breathing (4 count in, 4 hold, 4 out, 4 hold) takes 90 seconds to learn.', category: 'Mental Performance' },
  { tip: 'Observe your strongest athletes teaching others. How they explain a skill reveals their actual level of mastery — and exposes gaps you can address.', category: 'Player Development' },
  { tip: 'Program at least one "fun" element into every single practice. Athletes who enjoy training train harder, more consistently, over a longer career.', category: 'Practice Planning' },
  { tip: 'The most valuable scouting isn\'t watching the opponent — it\'s watching your own team. Self-awareness drives more improvement than opponent analysis.', category: 'Game Strategy' },
  { tip: 'Define "coachability" for your program: eye contact, body language, verbal acknowledgment, and immediate adjustment. Then assess it consistently.', category: 'Player Development' },
  { tip: 'When an athlete underperforms, ask "what got in the way?" before assuming lack of effort. Environmental and emotional factors often explain performance variance.', category: 'Communication' },
  { tip: 'Speed development requires near-maximal intent. Fatigued speed training creates compensatory movement patterns that can take months to unlearn.', category: 'Strength & Conditioning' },
  { tip: 'Build a "decision tree" for common game scenarios and practice it. Athletes who have pre-planned responses under pressure make better decisions faster.', category: 'Game Strategy' },
  { tip: 'Don\'t make every practice competitive. Cooperative drills build different (and equally important) social and technical skills.', category: 'Practice Planning' },
  { tip: 'Magnesium deficiency is underdiagnosed in athletes and contributes to cramping, poor sleep, and elevated anxiety. Leafy greens and nuts are good sources.', category: 'Nutrition' },
  { tip: 'Ask your best athletes what the program could do better. They\'re closest to the experience and often the most reluctant to volunteer criticism.', category: 'Leadership' },
  { tip: 'Learn the names of every parent on your roster. It costs nothing and dramatically changes how they interact with you at the sideline.', category: 'Parent Relations' },
  { tip: 'Track attendance trends, not just absences. Two late arrivals and one early departure in a row is a pattern worth addressing proactively.', category: 'Program Management' },
  { tip: 'Introduce visualization during cooldown stretching. Guide athletes through a mental replay of 2–3 successful moments from the day\'s session.', category: 'Mental Performance' },
  { tip: 'Technical skills degrade under fatigue. Run skills training early in practice when athletes are fresh. Save conditioning for the end.', category: 'Practice Planning' },
  { tip: 'Check your own confirmation bias: are you seeing what athletes are actually doing, or what you expect them to do? Deliberate observation corrects this.', category: 'Self-Improvement' },
  { tip: 'Match intensity levels in practice to game intensity levels. If practices are consistently lower intensity than games, athletes can\'t bridge the gap.', category: 'Practice Planning' },
  { tip: 'Write your season vision in one sentence before it starts. Every practice decision should trace back to that sentence.', category: 'Leadership' },
  { tip: 'Athletes who train with heart rate monitors learn to self-regulate effort better than those who train by feel alone. Consider basic biofeedback tools.', category: 'Strength & Conditioning' },
  { tip: 'Create a "non-negotiables" list: three behaviors your team commits to regardless of score, opponent, or circumstance. Review it weekly.', category: 'Team Culture' },
  { tip: 'Short practices can be more effective than long ones. 75 focused minutes beats 2 unfocused hours for skill acquisition and energy retention.', category: 'Practice Planning' },
  { tip: 'Celebrate moral victories explicitly. Competing hard in a loss teaches more than winning a mismatch. Recognize the effort publicly.', category: 'Leadership' },
  { tip: 'Don\'t wait for problems to surface in a team meeting. Walk the room during individual drills and check in one-on-one with 3–4 athletes per practice.', category: 'Communication' },
  { tip: 'Plyometric training (box jumps, bounding, hurdle hops) produces the best power-to-training-time ratio of any method. Use it twice weekly year-round.', category: 'Strength & Conditioning' },
  { tip: 'Map out your season week by week before it starts. Leaving practice planning to the week-of means you\'re always reactive, never proactive.', category: 'Season Planning' },
  { tip: 'Your culture is not what you say it is — it\'s what you tolerate. The behavior you walk past is the behavior you\'re endorsing.', category: 'Leadership' },
  { tip: 'Use "spectrum" questions in film sessions: "On a scale of 1–10, how well did we execute that play?" Forces athletes to evaluate rather than just observe.', category: 'Coaching Technique' },
  { tip: 'Vitamin D deficiency impairs both muscle function and immune response. Athletes training indoors or in northern climates should supplement and test regularly.', category: 'Nutrition' },
  { tip: 'After a difficult loss, give athletes 24 hours before conducting analysis. Reviewing performance in the heat of raw emotion rarely produces useful insight.', category: 'Leadership' },
  { tip: 'Build transition drills that mimic the chaos of real competition. Drills that always start in perfect formation don\'t prepare athletes for real game states.', category: 'Practice Planning' },
  { tip: 'Create a clear protocol for athlete conflicts: report → private conversation → mediated session → leadership decision. Don\'t improvise it during a crisis.', category: 'Program Management' },
  { tip: 'Athletic identity is valuable, but fragile. Help athletes develop identities beyond sport so performance setbacks don\'t become identity crises.', category: 'Mental Performance' },
  { tip: 'Start building next year\'s roster strategy in the final third of your current season. The best programs are always 12 months ahead.', category: 'Season Planning' },
  { tip: 'Practice environmental variety: train outdoors when weather is imperfect, in unfamiliar venues occasionally. Adaptability is a trained skill.', category: 'Player Development' },
  { tip: 'Creatine monohydrate is the most evidence-backed performance supplement. A 3–5g daily loading protocol improves high-intensity output in most athletes.', category: 'Nutrition' },
  { tip: 'Debrief losses with questions, not statements. "What did we do well?" and "what would we do differently?" develop critical thinking far better than lectures.', category: 'Coaching Technique' },
  { tip: 'Don\'t underestimate the power of small traditions — a specific handshake, a consistent pre-game song, a post-win routine. They anchor identity.', category: 'Team Culture' },
  { tip: 'Give athletes agency where you can: choice of warmup music, seating arrangement on road trips, input on practice schedule. Autonomy drives motivation.', category: 'Player Development' },
  { tip: 'The 4-minute rule: if you can\'t explain a tactical concept in 4 minutes, you don\'t know it well enough to coach it. Clarity precedes instruction.', category: 'Communication' },
  { tip: 'Build "stress inoculation" into your training: practices where music cuts out, equipment is limited, or conditions change without warning. Discomfort is a skill.', category: 'Mental Performance' },
  { tip: 'Post-competition nutrition window is 30–45 minutes. Missing it can delay glycogen replenishment by hours, affecting next-day training quality.', category: 'Nutrition' },
  { tip: 'Track your athletes\' academic schedules, especially around exams. Adjusting training load during exam periods prevents burnout and builds loyalty.', category: 'Athlete Welfare' },
  { tip: 'Use the "What, So What, Now What" debrief structure after practices. What happened? Why does it matter? What changes next time?', category: 'Coaching Technique' },
  { tip: 'Develop a set of 5 core practice principles that every drill reflects. Athletes internalize the principles faster than they internalize individual instructions.', category: 'Practice Planning' },
  { tip: 'Consistency in communication style reduces athlete anxiety. If they know how you deliver feedback, they can receive it more effectively.', category: 'Communication' },
  { tip: 'Program 1 "reflection day" per month: light physical activity, athlete-led discussions, and individual goal check-ins. The ROI far exceeds a standard practice.', category: 'Player Development' },
  { tip: 'The body adapts to training stress in 2–4 weeks. Vary training stimuli every 3–4 weeks to prevent accommodation and maintain progress.', category: 'Strength & Conditioning' },
  { tip: 'The best coaches are the best observers. Put your clipboard down occasionally and simply watch. You\'ll see things you\'ve been missing.', category: 'Self-Improvement' },
  { tip: 'Culture is established in the first three weeks of a season. The standards you hold — or don\'t hold — in that window define the entire year.', category: 'Leadership' },
  { tip: 'Encourage athletes to keep a performance journal. Writing about both successes and setbacks accelerates development by forcing structured self-reflection.', category: 'Mental Performance' },
  { tip: 'Never make a lineup decision in front of the group that hasn\'t been communicated privately first. Public surprises erode trust instantly.', category: 'Communication' },
  { tip: 'VO2 max improves most efficiently with interval training: 4–6 bouts of 3–5 minutes at 90–95% maximum effort, 2–3 times per week.', category: 'Strength & Conditioning' },
  { tip: 'Build a "compliment culture" where athletes are specifically expected and encouraged to recognize each other — not just the coaches to the players.', category: 'Team Culture' },
  { tip: 'Create a structured "walk-back" after difficult conversations with athletes. Follow up within 24 hours to check in. Closure matters.', category: 'Communication' },
  { tip: 'RPE (Rate of Perceived Exertion) scales are free, fast, and highly reliable for monitoring training load. Ask athletes to rate effort after every session.', category: 'Strength & Conditioning' },
  { tip: 'Understand the difference between technical errors (what they\'re doing) and tactical errors (when and why they\'re doing it). The correction for each is different.', category: 'Coaching Technique' },
  { tip: 'Build a "signature play" that the team can execute flawlessly under pressure. Having one set piece executed with confidence beats ten executed haphazardly.', category: 'Game Strategy' },
  { tip: 'Benchmark your players at the start of each season with consistent, repeatable fitness tests. It removes subjectivity from development conversations.', category: 'Evaluation' },
  { tip: 'You can\'t motivate anyone who doesn\'t want to be motivated. Your job is to create conditions where self-motivation becomes the rational choice.', category: 'Leadership' },
  { tip: 'Excessive soreness 48 hours after a session usually means volume or intensity was too high. Use it as data, not a badge of honor.', category: 'Recovery' },
  { tip: 'The coach who is most visible is rarely the most effective. Great coaches spend significant time watching, listening, and thinking — not talking.', category: 'Self-Improvement' },
  { tip: 'Teach athletes to self-coach by asking "what would your best self have done there?" This internal feedback loop builds long-term autonomy.', category: 'Player Development' },
  { tip: 'Lactate threshold training (sustained effort at 80–85% max HR) is the most powerful predictor of endurance performance. Prioritize it in conditioning blocks.', category: 'Strength & Conditioning' },
  { tip: 'Run a 15-minute individual check-in with every athlete 4 weeks into the season. You\'ll learn more in those conversations than in 20 practices.', category: 'Communication' },
  { tip: 'Model resilience visibly. When your program faces adversity, how you respond teaches more about mental toughness than any drill ever could.', category: 'Leadership' },
  { tip: 'The best practice plans have built-in flexibility — time buffers and optional modules — because athletes don\'t always arrive in the state you planned for.', category: 'Practice Planning' },
  { tip: 'Early sport specialization before age 12 is associated with higher burnout and injury rates. Encourage multi-sport participation in younger athletes.', category: 'Youth Coaching' },
  { tip: 'Track your win rate against the standards you set internally, not just the scoreboard. Teams that consistently meet internal standards usually win externally too.', category: 'Leadership' },
  { tip: 'Use the "three-before-me" rule: athletes should try to solve a problem with three teammates before bringing it to the coach. Builds independence.', category: 'Team Culture' },
  { tip: 'Caffeine (3–6mg/kg body weight, 30–60 minutes before competition) is the most well-researched ergogenic aid. Train athletes not to rely on it daily.', category: 'Nutrition' },
  { tip: 'Make eye contact with every player during pre-game prep. It takes 15 seconds and communicates presence and attention that words alone can\'t match.', category: 'Leadership' },
  { tip: 'Don\'t confuse likability with respect. Coaches can be warm AND demanding. The two aren\'t mutually exclusive, but conflating them leads to poor standards.', category: 'Leadership' },
  { tip: 'Build an explicit "failure protocol": what happens after a mistake? How does the athlete respond, and how do teammates respond? Define this before the first game.', category: 'Mental Performance' },
  { tip: 'Ankle mobility is the most commonly neglected physical quality in athletes. 5 minutes of daily ankle work prevents significant downstream injury risk.', category: 'Injury Prevention' },
  { tip: 'Slow down technical instruction for complex skills. Novice athletes can\'t process rapid-fire corrections. Space feedback so it has time to integrate.', category: 'Coaching Technique' },
  { tip: 'Publish your practice structure in advance. Athletes who know what to expect arrive more prepared, focused, and less anxious about what\'s coming.', category: 'Practice Planning' },
  { tip: 'Gratitude practices work in sports. End a weekly session with "what are you grateful for in this team?" It reframes the narrative and builds cohesion.', category: 'Team Culture' },
  { tip: 'The highest-performing athletes rarely have the worst work ethic problems. Focus your culture-building energy on your middle tier — they set the real standard.', category: 'Team Culture' },
  { tip: 'Periodize your mental skills just as you periodize physical training: early season focus on building habits, mid-season on executing under pressure, late season on resilience.', category: 'Mental Performance' },
  { tip: 'Explosive power decreases after 8–10 maximal efforts. Structure power development early in training sessions, not at the end when athletes are fatigued.', category: 'Strength & Conditioning' },
  { tip: 'When you notice an athlete\'s effort slipping, ask about their sleep before you address their attitude. Sleep deprivation mimics motivational decline in most metrics.', category: 'Athlete Welfare' },
  { tip: 'Never apologize for high standards — apologize for unclear communication of those standards. There\'s a difference, and athletes know it.', category: 'Leadership' },
  { tip: 'Create a "strength audit" at the start of each season: what does each athlete do better than everyone else on the roster? Build roles around those strengths.', category: 'Evaluation' },
  { tip: 'Mental fatigue affects physical performance as much as physical fatigue does. Monitor training stress holistically — school, relationships, and sport load together.', category: 'Athlete Welfare' },
  { tip: 'Add deceleration training to your conditioning program. The ability to slow down quickly and change direction is often what prevents ACL and hamstring injuries.', category: 'Injury Prevention' },
  { tip: 'Coaches who ask questions get more information than coaches who give answers. Shift your default from "Here\'s what you did wrong" to "What did you see?"', category: 'Coaching Technique' },
  { tip: 'Create a clear vision for what "winning the practice" looks like. Athletes who know the target for the day compete harder and leave with more confidence.', category: 'Practice Planning' },
  { tip: 'Post-season evaluations that athletes fill out anonymously give you better data than any observation. Provide structure but allow honesty.', category: 'Evaluation' },
  { tip: 'Refrain from coaching during athlete celebration. When a skill or play works beautifully, let the moment breathe before adding instruction.', category: 'Communication' },
  { tip: 'Players on the bench are still part of the game. Assign them specific observation tasks — they\'re learning even when not playing.', category: 'Player Development' },
  { tip: 'Build a travel protocol that covers nutrition, sleep, hydration, warmup space, and mental preparation. Road trips shouldn\'t be left to chance.', category: 'Program Management' },
  { tip: 'Use the phrase "not yet" instead of "no." Athletes who miss a standard haven\'t failed — they\'re on a timeline to meet it. Language shapes belief.', category: 'Communication' },
  { tip: 'Prepare athletes for worst-case scenarios specifically: poor field conditions, hostile crowds, equipment failures, weather. Exposure in practice makes it routine in games.', category: 'Mental Performance' },
  { tip: 'The most accurate indicator of team morale is how players treat each other in losing situations. Watch this specifically and coach it deliberately.', category: 'Team Culture' },
  { tip: 'Reactive agility (responding to real stimuli) transfers to games better than pre-planned agility ladders. Include more unpredictable movement training.', category: 'Strength & Conditioning' },
  { tip: 'Build a "coachability interview" into your tryout process. Ask athletes to demonstrate how they respond to correction in real time. It predicts development potential.', category: 'Evaluation' },
  { tip: 'Never miss an opportunity to learn from a coach who is different from you. Stylistic contrast is where the best growth lives.', category: 'Self-Improvement' },
  { tip: 'Elite performance is built on thousands of boring repetitions done with consistent excellence. Teach your athletes to love the grind, not just the highlight moments.', category: 'Player Development' },
  { tip: 'Taper intensity in the 48 hours before competition. Athletes who train hard the day before competition underperform the following day in measurable ways.', category: 'Recovery' },
  { tip: 'Name your team\'s values explicitly. Abstract values like "hard work" mean different things to different people. Define what they look like in specific behaviors.', category: 'Team Culture' },
  { tip: 'Use "process goals" in game plans: we will execute our set pieces perfectly, not "we will win by 3." Process goals give athletes something they control.', category: 'Mental Performance' },
  { tip: 'Foam rolling (myofascial release) is most effective when performed for 60–90 seconds on each muscle group, not the quick 10-second passes most athletes do.', category: 'Recovery' },
  { tip: 'Don\'t assume what motivates you motivates your athletes. Survey each athlete individually about what drives their best performances.', category: 'Player Development' },
  { tip: 'The "transition problem" — teams that perform beautifully in practice and poorly in games — is almost always a mental skills gap. Train the performance environment, not just the skill.', category: 'Mental Performance' },
  { tip: 'Coaching is a long game. The athletes who benefit most from your investment won\'t always be the ones who show the most immediate results.', category: 'Leadership' },
  { tip: 'Schedule a monthly "coaching development" hour for your staff — reading, watching film of great coaches, or discussing a coaching book together.', category: 'Self-Improvement' },
  { tip: 'Introduce consequences that match the offense. Disproportionate responses (benching for minor infractions) damage trust far more than they improve behavior.', category: 'Leadership' },
  { tip: 'Make athletes feel seen as people, not just performers. Ask about their lives outside sport. The emotional safety this creates dramatically improves performance.', category: 'Athlete Welfare' },
  { tip: 'Muscle fiber type distribution is largely genetic, but training can shift the spectrum. Power athletes benefit from strength training; endurance athletes from some power work.', category: 'Strength & Conditioning' },
  { tip: 'Teach athletes to "coach themselves" by narrating decisions mid-performance: "I see the gap, I\'m going to drive through it." Self-talk is a performance tool.', category: 'Mental Performance' },
  { tip: 'Hydration benchmarks: urine should be pale yellow. Dark urine before practice means athletes arrived dehydrated and performance will suffer immediately.', category: 'Nutrition' },
  { tip: 'End seasons with something to look forward to. Plant the seed for next year\'s goals before the last game. It converts the end into a beginning.', category: 'Season Planning' },
  { tip: 'Every great coach has mentors. If you\'re not currently learning from someone more experienced, you\'re slowing your own development.', category: 'Self-Improvement' },
  { tip: 'Tactical IQ compounds over time. The athlete who understands what they\'re doing at 14 will outperform the purely physical athlete at 18.', category: 'Player Development' },
  { tip: 'Develop a "pre-performance routine" for your staff, not just your athletes. Your preparation quality sets the baseline for the entire team environment.', category: 'Self-Improvement' },
  { tip: 'Athletic performance is a system: training, nutrition, sleep, psychology, and social environment all interact. Coaching only the training variable is leaving performance on the table.', category: 'Athlete Welfare' },
  { tip: 'Before the season, write down what you want athletes to say about this season 10 years from now. Reverse-engineer your coaching approach from that vision.', category: 'Leadership' },
  { tip: 'Encourage cross-training with non-competing athletes from other sports. The different movement vocabulary broadens athleticism in ways sport-specific training can\'t.', category: 'Player Development' },
  { tip: 'Athletes who understand periodization can manage their own readiness. Teach the basic concept — loading, deloading, peaking — even to youth athletes.', category: 'Strength & Conditioning' },
  { tip: 'Build "decision density" into game-realistic practices. The more choices athletes make per minute in training, the faster their decision-making becomes in games.', category: 'Practice Planning' },
  { tip: 'The most resilient programs have transparent systems. When athletes and parents understand how decisions are made, they accept outcomes — even disagreeable ones — far more readily.', category: 'Program Management' },
  { tip: 'Teach athletes to identify their "optimal arousal zone" — the anxiety/excitement level where they perform best. Performance varies dramatically above and below it.', category: 'Mental Performance' },
  { tip: 'Protein quality matters. Animal proteins contain all essential amino acids. Plant-based athletes should combine sources (rice + beans) to achieve complete amino acid profiles.', category: 'Nutrition' },
  { tip: 'A 10-minute meeting with your assistant coaches after every practice is worth more than any professional development course. Immediate debrief sharpens collective judgment.', category: 'Self-Improvement' },
  { tip: 'Create a "teaching progression" for every technical skill: isolated → controlled opposition → game-speed → competition. Jumping steps leads to misapplied skills.', category: 'Coaching Technique' },
  { tip: 'Track cumulative training load (weekly acute:chronic workload ratio) to predict injury risk. Spikes above 1.5x the rolling average dramatically increase injury probability.', category: 'Injury Prevention' },
  { tip: 'Make the first five minutes of practice the best five minutes. The energy and pace you establish at the start sets the tone for everything that follows.', category: 'Practice Planning' },
  { tip: 'Build a reading list of 6 books per year for your coaching staff. Learning from different domains — psychology, military leadership, business — prevents insular thinking.', category: 'Self-Improvement' },
  { tip: 'Athletes develop faster when they understand why they missed a standard, not just that they did. Root cause analysis belongs in coaching, not just engineering.', category: 'Coaching Technique' },
  { tip: 'Celebrate off-field excellence: academic achievement, community service, personal challenges overcome. It reinforces that your program values the person, not just the athlete.', category: 'Athlete Welfare' },
  { tip: 'Design drills with a "success rate sweet spot" of 60–70%. Too easy (>90%) doesn\'t challenge; too hard (<50%) creates frustration. Adjust difficulty to stay in the zone.', category: 'Practice Planning' },
  { tip: 'Team bonding activities should be low-stakes and fun, not physically demanding or requiring specific skills. The goal is relationship building, not performance.', category: 'Team Culture' },
  { tip: 'When an athlete\'s form breaks down under fatigue, stop the drill and recover. Practicing poor mechanics under fatigue encodes the wrong movement pattern.', category: 'Injury Prevention' },
  { tip: 'Build a "season arc" — early-season learning, mid-season consolidation, late-season execution. Every practice should know where it sits in that arc.', category: 'Season Planning' },
  { tip: 'The best teams aren\'t the ones who play perfectly — they\'re the ones who recover fastest from mistakes. Train mistake recovery as deliberately as you train skills.', category: 'Mental Performance' },
  { tip: 'Create a simple, consistent check-in at practice start: "energy, focus, soreness" rated 1–5. It takes 60 seconds and tells you more than any pre-practice observation.', category: 'Athlete Welfare' },
  { tip: 'When a technical drill isn\'t working, before stopping it, ask: is the problem the drill, or is it insufficient explanation? Most drills fail because athletes don\'t understand the purpose.', category: 'Coaching Technique' },
  { tip: 'Structure scrimmages to create specific teachable moments: limit one team to two touches, require players to switch positions, or modify the scoring system. Control the learning environment.', category: 'Practice Planning' },
  { tip: 'Build an explicit "captains framework" — not just a title, but a defined role. Great captains need coaching too, especially on leadership under pressure.', category: 'Team Culture' },
  { tip: 'The greatest gift you can give an athlete is the belief that they are capable of more than they currently think. Every coaching decision should reinforce that message.', category: 'Player Development' },
];

const FEATURED_DRILL = {
  id: 'dr1', title: 'The 4-Corner Passing Drill', sport: 'Soccer',
  description: 'Improve first touch, communication, and movement off the ball with this high-intensity passing circuit. Works for all age groups.',
  difficulty: 'intermediate', duration: '15 minutes',
  slug: 'four-corner-passing-drill',
};



const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } },
};

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase">{children}</h2>
      {action}
    </div>
  );
}

export default function SportsHubHomePage() {
  // Rotate daily tip by day-of-year
  const todayTip = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return COACH_TIPS[dayOfYear % COACH_TIPS.length];
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-16">

      {/* ── Hero ── */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <HeroBanner />
      </motion.div>

      {/* ── Featured Article ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} aria-labelledby="featured-heading">
        <SectionHeader
          action={
            <Link href="/sports-hub/news">
              <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary">
                All Articles <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          <span id="featured-heading">Featured Article</span>
        </SectionHeader>
        <Link href={`/sports-hub/articles/${FEATURED_ARTICLE.slug}`} className="group block">
          <div className="relative overflow-hidden rounded-3xl hero-gradient p-8 md:p-12 depth-card transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
            <div className="absolute inset-0 grid-beam opacity-20 pointer-events-none" aria-hidden />
            <div className="relative z-10 max-w-3xl">
              <Badge className="bg-white/20 text-white border-white/30 font-black text-[9px] uppercase tracking-widest mb-4">
                {FEATURED_ARTICLE.category}
              </Badge>
              <h2 className="text-2xl md:text-4xl font-black tracking-tighter text-white leading-tight mb-4 group-hover:opacity-90 transition-opacity">
                {FEATURED_ARTICLE.title}
              </h2>
              <p className="text-white/70 font-medium text-sm md:text-base mb-6 leading-relaxed max-w-2xl">
                {FEATURED_ARTICLE.excerpt}
              </p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-white/60 text-xs font-bold uppercase tracking-widest">
                  <User className="h-3.5 w-3.5" />{FEATURED_ARTICLE.author.name}
                </div>
                <div className="flex items-center gap-2 text-white/60 text-xs font-bold uppercase tracking-widest">
                  <Clock className="h-3.5 w-3.5" />{FEATURED_ARTICLE.readingTime} min read
                </div>
                <Button className="bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs gap-2 ml-auto hidden sm:flex">
                  Read Article <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </Link>
      </motion.section>

      {/* ── Latest Squad Articles ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} aria-labelledby="latest-heading">
        <SectionHeader
          action={
            <Link href="/sports-hub/news">
              <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary">
                View All <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          <span id="latest-heading">Latest from The Squad</span>
        </SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {LATEST_ARTICLES.map((article, i) => (
            <motion.div key={article.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.08 }}>
              <Link href={`/sports-hub/articles/${article.slug}`} className="group block h-full">
                <div className="h-full bg-card border rounded-2xl overflow-hidden depth-card transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                  <div className="h-1.5 hero-gradient" />
                  <div className="p-6">
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5 mb-3">
                      {article.category}
                    </Badge>
                    <h3 className="font-black tracking-tight text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 font-medium leading-relaxed">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{article.author.name}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{article.readingTime}m</span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Product Updates ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} aria-labelledby="updates-heading">
        <SectionHeader>
          <span id="updates-heading">Product Updates</span>
        </SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRODUCT_UPDATES.map((update) => (
            <div key={update.id} className="bg-card border rounded-2xl p-6 depth-card hover:shadow-lg transition-all hover:-translate-y-0.5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <Zap className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-primary uppercase tracking-widest">{update.version}</span>
                    <Badge className="text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary border-0">{update.type}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{new Date(update.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
              <h3 className="font-black tracking-tight text-sm mb-1.5">{update.title}</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">{update.description}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Coach Tip of the Day ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} aria-labelledby="tip-heading">
        <div className="bg-card border-2 border-primary/10 rounded-3xl p-8 md:p-10 relative overflow-hidden glow-red">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" aria-hidden />
          <div className="flex items-start gap-5">
            <div className="h-14 w-14 rounded-2xl hero-gradient flex items-center justify-center shrink-0 shadow-xl shadow-primary/20">
              <Lightbulb className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-1" id="tip-heading">Coach Tip of the Day</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{todayTip.category}</p>
              <blockquote className="text-base md:text-lg font-black tracking-tight leading-snug text-foreground">
                &ldquo;{todayTip.tip}&rdquo;
              </blockquote>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── Featured Drill ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <SectionHeader action={<Link href="/sports-hub/playbook"><Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary">Playbook <ChevronRight className="h-3.5 w-3.5" /></Button></Link>}>
          Featured Drill
        </SectionHeader>
        <Link href="/sports-hub/playbook" className="group block">
          <div className="bg-card border rounded-2xl overflow-hidden depth-card transition-all hover:shadow-xl hover:-translate-y-0.5">
            <div className="hero-gradient p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <Dumbbell className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{FEATURED_DRILL.sport} · {FEATURED_DRILL.duration}</p>
                <h3 className="font-black tracking-tight text-lg text-white">{FEATURED_DRILL.title}</h3>
              </div>
            </div>
            <div className="p-6">
              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-amber-600 border-amber-200 bg-amber-50 mb-3">{FEATURED_DRILL.difficulty}</Badge>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-4">{FEATURED_DRILL.description}</p>
              <Button variant="outline" size="sm" className="font-black text-xs uppercase tracking-widest gap-2 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                View Drill <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Link>
      </motion.section>





      {/* ── Newsletter ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <NewsletterSignup />
      </motion.section>

    </div>
  );
}
