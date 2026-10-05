import { safeReturnPath, type AppDistribution } from '@/lib/app-distribution';

export type SignupRegistrationTarget =
  | 'self'
  | 'child'
  | 'coach'
  | 'league_creator'
  | 'school_ad'
  | 'nonprofit_manager';
export type SignupPlanChoice =
  | 'starter'
  | 'pro_team'
  | 'elite_teams'
  | 'elite_league'
  | 'school'
  | null;
export type SignupStep = 'target' | 'plan' | 'join_team' | 'account';
export type OnboardingRole = 'adult_player' | 'parent' | 'coach' | 'admin' | 'league_creator';

export function signupNextState(
  target: SignupRegistrationTarget,
  distribution: AppDistribution,
): { step: SignupStep; planChoice: SignupPlanChoice } {
  if (distribution === 'store') {
    return {
      step: target === 'self' || target === 'child' ? 'join_team' : 'account',
      planChoice: 'starter',
    };
  }
  if (target === 'self' || target === 'child') {
    return { step: 'join_team', planChoice: null };
  }
  return { step: 'plan', planChoice: (target === 'school_ad' || target === 'nonprofit_manager') ? 'school' : null };
}

export function signupSteps(
  target: SignupRegistrationTarget | null,
  distribution: AppDistribution,
): SignupStep[] {
  if (target === 'self' || target === 'child') return ['target', 'join_team', 'account'];
  if (target && distribution === 'web') return ['target', 'plan', 'account'];
  return ['target', 'account'];
}

export function signupBackStep(
  target: SignupRegistrationTarget | null,
  distribution: AppDistribution,
): SignupStep {
  if (target === 'self' || target === 'child') return 'join_team';
  return distribution === 'store' ? 'target' : 'plan';
}

export function signupPostVerificationPath(
  input: {
    target: SignupRegistrationTarget | null;
    joinCode: string;
    planChoice: SignupPlanChoice;
  },
  distribution: AppDistribution,
): string {
  const normalizedJoinCode = input.joinCode.trim().toUpperCase();
  const teamJoinPath = normalizedJoinCode
    ? `/teams/join?code=${encodeURIComponent(normalizedJoinCode)}`
    : '';

  let destination: string;
  if (distribution === 'web' && input.planChoice && input.planChoice !== 'starter') {
    destination = '/pricing';
  } else if (input.target === 'child' && teamJoinPath) {
    destination = `/family?addChild=1&returnTo=${encodeURIComponent(teamJoinPath)}`;
  } else if (teamJoinPath) {
    destination = teamJoinPath;
  } else {
    destination = '/dashboard';
  }

  return safeReturnPath(destination, distribution);
}

export function onboardingDestinationForRole(
  role: OnboardingRole,
  distribution: AppDistribution,
): string {
  // A new profile has no team yet. Creation and joining remain dashboard actions.
  return safeReturnPath('/dashboard', distribution);
}
