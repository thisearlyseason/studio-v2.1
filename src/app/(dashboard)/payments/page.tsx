"use client";
import Link from 'next/link';
import { canViewPersonalPayments } from '@/lib/dashboard-route-policy';
import { useTeam } from '@/components/providers/team-provider';
import { MyPaymentsView } from '@/components/finance/MyPaymentsView';
import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function PaymentsPage() {
  const { firebaseUser, teams, isParent, user } = useTeam();
  if (!canViewPersonalPayments(user?.role)) return <AccessRestricted title="Adult account required" description="Team payment history is available to adult account holders."/>;
  return <div className="space-y-6 pb-24">
    <div className="space-y-2"><h1 className="text-3xl font-bold">Payments</h1>
      <p className="text-muted-foreground">Your team payments, including online payments and payments recorded by your organizer. Records match the email address on your account.</p>
      <p className="text-sm text-muted-foreground">App subscriptions are managed separately through account billing or your app store.</p>
      {isParent && <Link href="/family/payments" className="inline-block font-semibold text-primary underline">Household charges &amp; balances →</Link>}
    </div>
    <MyPaymentsView userEmail={firebaseUser?.email || ''} teamIds={teams.map(team => team.id)}/>
  </div>;
}
