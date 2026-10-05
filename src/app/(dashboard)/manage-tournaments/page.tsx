"use client";

import { useTeam } from '@/components/providers/team-provider';
import { AccessRestricted } from '@/components/layout/AccessRestricted';
import { ManageTournamentsPageContent } from './manage-tournaments-page-content';

function ManageTournamentsPageGuard() {
  const { isStaff, isPrimaryClubAuthority } = useTeam();
  if (!isStaff && !isPrimaryClubAuthority) return <AccessRestricted />;
  return <ManageTournamentsPageContent />;
}

export default function ManageTournamentsPage() {
  return <ManageTournamentsPageGuard />;
}
