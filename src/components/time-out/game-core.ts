export type Sport = 'soccer' | 'basketball' | 'hockey' | 'volleyball' | 'baseball';
export type Difficulty = 'easy' | 'medium' | 'hard';

export const SPORTS: { id: Sport; label: string; icon: string; instructions: string }[] = [
  { id: 'soccer', label: 'Soccer', icon: '⚽', instructions: 'Move into the ball, then press Space to kick through the goal.' },
  { id: 'basketball', label: 'Basketball', icon: '🏀', instructions: 'Move into the ball, then press Space near the hoop to shoot.' },
  { id: 'hockey', label: 'Hockey', icon: '🏒', instructions: 'Skate to the puck and press Space to fire it at the net.' },
  { id: 'volleyball', label: 'Volleyball', icon: '🏐', instructions: 'Move under the ball and press Space to return it over the net.' },
  { id: 'baseball', label: 'Baseball', icon: '⚾', instructions: 'Watch the pitch and press Space as it reaches the plate.' },
];

export const DIFFICULTY = {
  easy: { label: 'Easy', speed: 0.72, aiSpeed: 0.48, timing: 0.21, accuracy: 0.45 },
  medium: { label: 'Medium', speed: 1, aiSpeed: 0.72, timing: 0.13, accuracy: 0.67 },
  hard: { label: 'Hard', speed: 1.22, aiSpeed: 0.98, timing: 0.075, accuracy: 0.84 },
} as const;

export const STORAGE = {
  sport: 'the-squad:time-out:sport', difficulty: 'the-squad:time-out:difficulty',
  sound: 'the-squad:time-out:sound', baseballBest: 'the-squad:time-out:baseball-best',
} as const;

export function firstToFive(home: number, away: number) { return home >= 5 || away >= 5; }
export function volleyballPoint(ballOnLeft: boolean, lastTouch: 'player' | 'ai') { return ballOnLeft ? (lastTouch === 'ai' ? 'player' : 'ai') : (lastTouch === 'player' ? 'ai' : 'player'); }
export function baseballContact(timing: number, difficulty: Difficulty) {
  const window = DIFFICULTY[difficulty].timing;
  const quality = Math.max(0, 1 - Math.abs(timing) / window);
  if (quality === 0) return { label: 'MISS', distance: 0 };
  if (quality < .32) return { label: 'FOUL', distance: Math.round(35 + quality * 55) };
  if (quality < .62) return { label: 'WEAK CONTACT', distance: Math.round(70 + quality * 110) };
  if (quality < .9) return { label: 'GOOD CONTACT', distance: Math.round(145 + quality * 105) };
  return { label: 'PERFECT CONTACT!', distance: Math.round(245 + quality * 55) };
}

export function storageGet(key: string, fallback: string) { try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
export function storageSet(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* private browsing can deny storage */ } }

export default { SPORTS, DIFFICULTY, STORAGE, firstToFive, volleyballPoint, baseballContact, storageGet, storageSet };
