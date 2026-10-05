"use client";

import { useTeam } from '@/components/providers/team-provider';
import { AccessRestricted } from '@/components/layout/AccessRestricted';
import { LeaguesPageContent } from './leagues-page-content';

function LeaguesPageGuard() {
  const { isStaff } = useTeam();
  if (!isStaff) return <AccessRestricted />;
  return <LeaguesPageContent />;
}

export default function LeaguesPage() {
  return <LeaguesPageGuard />;
}
