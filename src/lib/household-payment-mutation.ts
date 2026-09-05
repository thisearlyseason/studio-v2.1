const STATUSES = new Set(['paid', 'pending', 'overdue']);

export class HouseholdPaymentMutationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Scope = { teamId: string; team: Record<string, unknown>; childId: string; child: Record<string, unknown> };

export function assertHouseholdPaymentMutationScope({ teamId, team, child }: Scope) {
  if (team.isActive === false || team.status === 'removed') {
    throw new HouseholdPaymentMutationError('Inactive squads cannot receive payment records.', 409);
  }
  if (typeof child.parentId !== 'string' || !child.parentId ||
      !Array.isArray(child.joinedTeamIds) || !child.joinedTeamIds.includes(teamId)) {
    throw new HouseholdPaymentMutationError('Athlete is not linked to this squad and guardian.', 403);
  }
}

export function buildHouseholdPaymentProjection({ paymentId, teamId, team, childId, child, input, actorUid, now }: Scope & {
  paymentId: string; input: Record<string, unknown>; actorUid: string; now: string;
}) {
  assertHouseholdPaymentMutationScope({ teamId, team, childId, child });
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const amount = Number(input.amount);
  const status = String(input.status || 'pending');
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  const dueDate = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
  if (!description || description.length > 160 || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 ||
      !STATUSES.has(status) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    throw new HouseholdPaymentMutationError('Valid payment fields are required.');
  }
  const firstName = typeof child.firstName === 'string' ? child.firstName.trim() : '';
  const lastName = typeof child.lastName === 'string' ? child.lastName.trim() : '';
  const teamName = typeof team.name === 'string' && team.name.trim() ? team.name.trim() : String(team.teamName || 'Squad');
  return {
    id: paymentId, parentId: child.parentId, childId, childName: `${firstName} ${lastName}`.trim(),
    teamId, teamName, description, amount, status, date,
    ...(dueDate ? { dueDate } : {}),
    ...(typeof input.category === 'string' && input.category.trim() ? { category: input.category.trim().slice(0, 80) } : {}),
    ...(typeof input.invoiceNumber === 'string' && input.invoiceNumber.trim() ? { invoiceNumber: input.invoiceNumber.trim().slice(0, 80) } : {}),
    recordedBy: actorUid, createdAt: now, updatedAt: now,
  };
}
