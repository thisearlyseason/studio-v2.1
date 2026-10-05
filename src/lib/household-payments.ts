export type HouseholdPayment = {
  amount?: unknown;
  status?: unknown;
  dueDate?: string;
};

export function calculateHouseholdPayments(payments: readonly HouseholdPayment[]) {
  const amountFor = (payment: HouseholdPayment) => {
    const amount = Number(payment.amount);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };
  const paid = payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + amountFor(payment), 0);
  const outstanding = payments.filter(payment => payment.status !== 'paid').reduce((sum, payment) => sum + amountFor(payment), 0);
  const overdue = payments.filter(payment => payment.status === 'overdue').reduce((sum, payment) => sum + amountFor(payment), 0);
  const nextDue = payments
    .filter(payment => payment.status === 'pending' && payment.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  return { paid, outstanding, overdue, nextDue };
}
