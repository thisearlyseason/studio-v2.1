export type DemoPlan = {
  planType: 'free' | 'team' | 'elite' | 'league' | 'school';
  teamLimit: number;
  role: 'parent' | 'adult_player' | 'coach' | 'admin' | 'league_creator';
  position: string;
  teamVariants: string[];
  isPro: boolean;
};

export type DemoTeamShell = {
  id: string;
  name: string;
  ownerUserId: string;
  type: 'school' | 'school_squad' | 'youth';
};

export const DEMO_PLANS: Record<string, DemoPlan> = {
  starter_squad: { planType: 'free', teamLimit: getPlanTeamLimit('free'), role: 'coach', position: 'Coach', teamVariants: [''], isPro: false },
  free: { planType: 'free', teamLimit: getPlanTeamLimit('free'), role: 'coach', position: 'Coach', teamVariants: [''], isPro: false },
  squad_pro: { planType: 'team', teamLimit: getPlanTeamLimit('team'), role: 'coach', position: 'Coach', teamVariants: [''], isPro: true },
  team: { planType: 'team', teamLimit: getPlanTeamLimit('team'), role: 'coach', position: 'Coach', teamVariants: [''], isPro: true },
  elite_teams: { planType: 'elite', teamLimit: getPlanTeamLimit('elite'), role: 'coach', position: 'Coach', teamVariants: ['Premier Division', 'Championship Division', 'Development Division'], isPro: true },
  elite: { planType: 'elite', teamLimit: getPlanTeamLimit('elite'), role: 'coach', position: 'Coach', teamVariants: ['Premier Division', 'Championship Division', 'Development Division'], isPro: true },
  league: { planType: 'league', teamLimit: getPlanTeamLimit('league'), role: 'coach', position: 'Coach', teamVariants: ['Premier Division', 'Championship Division', 'Development Division'], isPro: true },
  school_demo: { planType: 'school', teamLimit: getPlanTeamLimit('school'), role: 'admin', position: 'Athletic Director', teamVariants: ['Jr Soccer Club', 'Sr Soccer Club', 'Badminton Club', 'Jr Volleyball Club', 'Sr Volleyball Club'], isPro: true },
  school: { planType: 'school', teamLimit: getPlanTeamLimit('school'), role: 'admin', position: 'Athletic Director', teamVariants: ['Jr Soccer Club', 'Sr Soccer Club', 'Badminton Club', 'Jr Volleyball Club', 'Sr Volleyball Club'], isPro: true },
  parent_demo: { planType: 'team', teamLimit: getPlanTeamLimit('team'), role: 'parent', position: 'Parent', teamVariants: ['Strikers', 'Lakers'], isPro: true },
  player_demo: { planType: 'team', teamLimit: getPlanTeamLimit('team'), role: 'adult_player', position: 'Player', teamVariants: ['Strikers', 'Lakers'], isPro: true },
  league_demo: { planType: 'free', teamLimit: getPlanTeamLimit('free'), role: 'league_creator', position: 'League Creator', teamVariants: [], isPro: false },
};

export const demoTeamSlug = (variant: string) => (variant || 'main').toLowerCase().replace(/\s+/g, '');

export function sportForDemoVariant(variant: string): string {
  const normalized = variant.trim().toLowerCase();
  if (normalized.includes('soccer')) return 'Soccer';
  if (normalized.includes('volleyball')) return 'Volleyball';
  if (normalized.includes('badminton')) return 'Badminton';
  if (normalized.includes('basketball')) return 'Basketball';
  return 'Multi-Sport';
}

export function getDemoTeamShells(uid: string, planId: string, plan: DemoPlan): DemoTeamShell[] {
  const suffix = uid.slice(-4);
  const isFamilyDemo = planId === 'parent_demo' || planId === 'player_demo';
  const ownerUserId = isFamilyDemo ? `demo_coach_${uid.slice(-8)}` : uid;
  const shells: DemoTeamShell[] = plan.teamVariants.map((variant) => ({
    id: `demo_${planId}_${suffix}_${demoTeamSlug(variant)}`,
    name: isFamilyDemo
      ? variant
      : plan.planType === 'school'
        ? `Springfield ${variant}`
        : variant
          ? `Elite Squad - ${variant}`
          : plan.isPro ? 'Apex Demo Squad' : 'Grassroots Demo',
    ownerUserId,
    type: plan.planType === 'school' ? 'school_squad' : 'youth',
  }));

  if (plan.planType === 'school') {
    shells.unshift({
      id: `demo_${planId}_${suffix}_institution`,
      name: 'Springfield High School',
      ownerUserId: uid,
      type: 'school',
    });
  }
  return shells;
}
import { getPlanTeamLimit } from '@/lib/plan-catalog';
