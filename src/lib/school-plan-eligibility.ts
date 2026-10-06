export type SchoolOrganizationDeclaration = 'school' | 'nonprofit';

export function schoolOrganizationDeclaration(value: unknown): SchoolOrganizationDeclaration | null {
  return value === 'school' || value === 'nonprofit' ? value : null;
}

// A declaration is not verification, a tax exemption, or an administrator grant.
// Existing Schools subscribers keep access and can change billing intervals.
export function schoolPlanEligibilityError(
  targetPlanId: string,
  profile: { plan_type?: unknown; organizationType?: unknown },
  declaration: unknown,
): string | null {
  if (targetPlanId !== 'school' || profile.plan_type === 'school') return null;
  if (schoolOrganizationDeclaration(declaration) || schoolOrganizationDeclaration(profile.organizationType)) return null;
  return 'The Schools plan is for schools and nonprofits. Confirm your organization type, or choose Elite Teams or Elite League.';
}
